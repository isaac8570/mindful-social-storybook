import os
import asyncio
import base64
from contextlib import asynccontextmanager
from typing import AsyncGenerator, Optional

from models.message import ClientMessage, StoryChunk
from services.image_service import ImageService

SYSTEM_INSTRUCTION = """
You are Sprout, an infinitely warm and gentle fairy tale narrator.
You deeply empathize with children's fears and anxieties.
When a child tells you what they are afraid of, you create a short, comforting fairy tale
that helps them understand and overcome their fear.

Your story must be delivered as an interleaved stream:
- Narrate the story in warm, simple language a child can understand.
- At key emotional moments in the story, call the 'generate_image' tool to create
  an illustration that matches the scene. The image will appear inline in the story.
- Speak in a gentle, rhythmic tone as if reading a bedtime story.
- Keep each story under 3 minutes when read aloud.
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
            await self._status("🌱 생각하는 중...")
            await self._session.send(input=msg.data, end_of_turn=True)
        elif msg.type == "audio" and msg.data:
            audio_bytes = base64.b64decode(msg.data)
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

    async def _read_loop(self):
        first_audio = True
        try:
            async for response in self._session.receive():
                # Tool calls (image generation)
                if response.tool_call:
                    for fc in response.tool_call.function_calls:
                        if fc.name == "generate_image":
                            scene_desc = fc.args.get("scene_description", "")
                            await self._status("🎨 그림 그리는 중...")
                            image_b64 = await self._image_service.generate(scene_desc)
                            if image_b64:
                                await self._response_queue.put(
                                    StoryChunk(
                                        type="image",
                                        data=image_b64,
                                        mime_type="image/png",
                                        sequence=self._next_seq(),
                                    )
                                )
                                await self._status("🌱 이야기 계속 중...")
                            else:
                                await self._status("🌱 이야기 계속 중...")
                            from google.genai import types

                            await self._session.send(
                                input=types.LiveClientToolResponse(
                                    function_responses=[
                                        types.FunctionResponse(
                                            name="generate_image",
                                            id=fc.id,
                                            response={"result": "image_generated"},
                                        )
                                    ]
                                )
                            )

                if response.text:
                    await self._response_queue.put(
                        StoryChunk(
                            type="text",
                            data=response.text,
                            sequence=self._next_seq(),
                        )
                    )

                if response.data:
                    if first_audio:
                        await self._status("🌱 말하는 중...")
                        first_audio = False
                    await self._response_queue.put(
                        StoryChunk(
                            type="audio",
                            data=base64.b64encode(response.data).decode(),
                            mime_type="audio/pcm;rate=24000",
                            sequence=self._next_seq(),
                        )
                    )

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
