import os
import asyncio
import base64
from contextlib import asynccontextmanager
from typing import AsyncGenerator, Optional

from models.message import ClientMessage, StoryChunk
from services.image_service import ImageService

SYSTEM_INSTRUCTION = """
You are Sprout, a warm and gentle fairy tale narrator for children.
When a child tells you what they are afraid of, create a short comforting fairy tale.

IMPORTANT - You MUST call the generate_image tool:
- Call generate_image at the START of the story (first scene).
- Call generate_image again at the MIDDLE of the story (key emotional moment).
- Call generate_image at the END of the story (hopeful resolution scene).
- Always call generate_image BEFORE narrating that scene, not after.

Story guidelines:
- Speak in warm, simple language a child can understand.
- Gentle, rhythmic tone like a bedtime story.
- Keep the story under 2 minutes when read aloud.
- Always end with a hopeful, reassuring message.

Language: Respond in the same language the child uses (Korean or English).
"""

IMAGE_TOOL = {
    "name": "generate_image",
    "description": (
        "Generate an illustration for the current scene in the fairy tale. "
        "Call this at emotionally significant moments to create inline visuals."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "scene_description": {
                "type": "string",
                "description": (
                    "A detailed description of the scene to illustrate. "
                    "Style: soft watercolor, warm colors, child-friendly, "
                    "cozy knitted texture aesthetic."
                ),
            }
        },
        "required": ["scene_description"],
    },
}

# Live API model — supports bidiGenerateContent
LIVE_MODEL = "gemini-2.5-flash-native-audio-latest"


class GeminiSession:
    """
    Wraps a Gemini Live API session.
    Uses an internal asyncio.Event to keep the session alive while
    the WebSocket connection is open.
    """

    def __init__(self, client, image_service: ImageService):
        self._client = client
        self._image_service = image_service
        self._session = None
        self._response_queue: asyncio.Queue = asyncio.Queue()
        self._sequence = 0
        self._reader_task: Optional[asyncio.Task] = None
        self._session_task: Optional[asyncio.Task] = None
        self._session_ready = asyncio.Event()
        self._session_done = asyncio.Event()
        self._last_user_input: str = ""  # for auto image generation
        self._image_count = 0  # how many images generated this session

    async def __aenter__(self):
        # Run the session in a background task so the `async with connect()`
        # block stays alive for the duration of the WebSocket connection.
        self._session_task = asyncio.create_task(self._run_session())
        # Wait until the session is actually connected
        await asyncio.wait_for(self._session_ready.wait(), timeout=15.0)
        return self

    async def __aexit__(self, *args):
        # Signal the session task to exit
        self._session_done.set()
        if self._reader_task:
            self._reader_task.cancel()
            try:
                await self._reader_task
            except asyncio.CancelledError:
                pass
        if self._session_task:
            try:
                await asyncio.wait_for(self._session_task, timeout=5.0)
            except (asyncio.TimeoutError, asyncio.CancelledError, Exception):
                self._session_task.cancel()

    async def _run_session(self):
        """Holds the `async with connect()` block open until _session_done is set."""
        from google.genai import types

        try:
            async with self._client.aio.live.connect(
                model=LIVE_MODEL,
                config=types.LiveConnectConfig(
                    system_instruction=types.Content(
                        parts=[types.Part(text=SYSTEM_INSTRUCTION)]
                    ),
                    response_modalities=["AUDIO"],
                    speech_config=types.SpeechConfig(
                        voice_config=types.VoiceConfig(
                            prebuilt_voice_config=types.PrebuiltVoiceConfig(
                                voice_name="Puck"
                            )
                        )
                    ),
                    tools=[{"function_declarations": [IMAGE_TOOL]}],
                ),
            ) as session:
                self._session = session
                self._reader_task = asyncio.create_task(self._read_loop())
                self._session_ready.set()
                # Keep alive until WebSocket closes
                await self._session_done.wait()
        except Exception as e:
            err = StoryChunk(type="error", data=f"Session error: {e}")
            await self._response_queue.put(err)
            await self._response_queue.put(None)
            self._session_ready.set()  # unblock __aenter__ on error

    async def send(self, msg: ClientMessage):
        from google.genai import types

        if not self._session:
            return

        if msg.type == "text" and msg.data:
            self._last_user_input = msg.data
            self._image_count = 0
            await self._status("🌱 생각하는 중...")
            await self._session.send(input=msg.data, end_of_turn=True)
        elif msg.type == "audio" and msg.data:
            audio_bytes = base64.b64decode(msg.data)
            self._image_count = 0
            await self._session.send(
                input=types.Blob(data=audio_bytes, mime_type="audio/pcm;rate=16000")
            )

    async def interrupt(self):
        if self._session:
            try:
                await self._session.send(input=".", end_of_turn=False)
            except Exception as e:
                print(f"[GeminiSession] interrupt error: {e}")

    async def _status(self, msg: str):
        """Helper to push a status chunk to the queue."""
        await self._response_queue.put(StoryChunk(type="status", data=msg))

    async def _generate_image_async(self, prompt: str):
        """Generate image in background and push to queue."""
        await self._status("🎨 그림 그리는 중...")
        try:
            image_b64 = await self._image_service.generate(prompt)
            if image_b64:
                await self._response_queue.put(
                    StoryChunk(
                        type="image",
                        data=image_b64,
                        mime_type="image/jpeg",
                        sequence=self._next_seq(),
                    )
                )
                await self._status("🖼️ 그림 완성!")
                print(f"[ImageGen] Generated image for: {prompt[:60]}")
            else:
                await self._status("⚠️ 그림 생성 실패")
        except Exception as e:
            print(f"[ImageGen] Error: {e}")
            await self._status("⚠️ 그림 생성 실패")

    async def _read_loop(self):
        first_audio = True
        audio_chunk_count = 0
        # Trigger image generation after every N audio chunks (approx every ~8 seconds)
        IMAGE_TRIGGER_EVERY = 80
        try:
            async for response in self._session.receive():
                if response.data:
                    if first_audio:
                        await self._status("🌱 말하는 중...")
                        first_audio = False
                    audio_chunk_count += 1
                    await self._response_queue.put(
                        StoryChunk(
                            type="audio",
                            data=base64.b64encode(response.data).decode(),
                            mime_type="audio/pcm;rate=24000",
                            sequence=self._next_seq(),
                        )
                    )
                    # Auto-generate image at regular intervals (max 3 per session)
                    if (
                        audio_chunk_count % IMAGE_TRIGGER_EVERY == 0
                        and self._image_count < 3
                    ):
                        self._image_count += 1
                        scene_num = self._image_count
                        user_fear = self._last_user_input or "something scary"
                        if scene_num == 1:
                            prompt = f"A child who is afraid of {user_fear}, beginning of a comforting fairy tale"
                        elif scene_num == 2:
                            prompt = f"A magical helper arriving to comfort a child afraid of {user_fear}, fairy tale middle scene"
                        else:
                            prompt = f"A child feeling safe and happy, overcoming fear of {user_fear}, hopeful fairy tale ending"
                        print(
                            f"[ReadLoop] Auto image #{self._image_count} at chunk {audio_chunk_count}"
                        )
                        asyncio.create_task(self._generate_image_async(prompt))

                if response.text:
                    await self._response_queue.put(
                        StoryChunk(
                            type="text",
                            data=response.text,
                            sequence=self._next_seq(),
                        )
                    )

                # Also trigger on turn_complete
                turn_complete = (
                    hasattr(response, "server_content")
                    and response.server_content is not None
                    and getattr(response.server_content, "turn_complete", False)
                )
                if turn_complete:
                    print(f"[ReadLoop] Turn complete at chunk {audio_chunk_count}")
                    if audio_chunk_count > 10 and self._image_count < 3:
                        self._image_count += 1
                        prompt = (
                            self._last_user_input or "a comforting fairy tale scene"
                        )
                        print(
                            f"[ReadLoop] Turn complete — generating image #{self._image_count}"
                        )
                        asyncio.create_task(self._generate_image_async(prompt))
                    first_audio = True
                    audio_chunk_count = 0

        except asyncio.CancelledError:
            pass
        except Exception as e:
            await self._response_queue.put(StoryChunk(type="error", data=str(e)))
        finally:
            await self._response_queue.put(None)

    async def stream_responses(self) -> AsyncGenerator[StoryChunk, None]:
        while True:
            chunk = await self._response_queue.get()
            if chunk is None:
                break
            yield chunk

    def _next_seq(self) -> int:
        self._sequence += 1
        return self._sequence


class GeminiService:
    def __init__(self):
        from google import genai

        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            raise ValueError(
                "GEMINI_API_KEY environment variable is not set. "
                "Get your free API key at https://aistudio.google.com/app/apikey"
            )
        self._client = genai.Client(api_key=api_key)
        self._image_service = ImageService()

    @asynccontextmanager
    async def create_session(self):
        session = GeminiSession(self._client, self._image_service)
        async with session:
            yield session
