import os
import json
import asyncio
import base64
from contextlib import asynccontextmanager
from typing import AsyncGenerator

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


class GeminiSession:
    """Wraps a single Gemini Live API session."""

    def __init__(self, client, image_service: ImageService):
        self._client = client
        self._image_service = image_service
        self._session = None
        self._response_queue: asyncio.Queue[StoryChunk | None] = asyncio.Queue()
        self._sequence = 0

    async def __aenter__(self):
        from google import genai
        from google.genai import types

        self._session = await self._client.aio.live.connect(
            model="gemini-2.0-flash-live-001",
            config=types.LiveConnectConfig(
                system_instruction=SYSTEM_INSTRUCTION,
                response_modalities=["AUDIO", "TEXT"],
                speech_config=types.SpeechConfig(
                    voice_config=types.VoiceConfig(
                        prebuilt_voice_config=types.PrebuiltVoiceConfig(
                            voice_name="Puck"
                        )
                    )
                ),
                tools=[{"function_declarations": [IMAGE_TOOL]}],
            ),
        ).__aenter__()

        # Start background task to read from Gemini and enqueue chunks
        self._reader_task = asyncio.create_task(self._read_loop())
        return self

    async def __aexit__(self, *args):
        self._reader_task.cancel()
        try:
            await self._reader_task
        except asyncio.CancelledError:
            pass
        if self._session:
            await self._session.__aexit__(*args)

    async def send(self, msg: ClientMessage):
        from google.genai import types

        if msg.type == "text":
            await self._session.send(input=types.LiveClientRealtimeInput(text=msg.data))
        elif msg.type == "audio":
            audio_bytes = base64.b64decode(msg.data)
            await self._session.send(
                input=types.LiveClientRealtimeInput(
                    audio=types.Blob(data=audio_bytes, mime_type="audio/pcm;rate=16000")
                )
            )

    async def interrupt(self):
        """Signal Gemini to stop current generation."""
        if self._session:
            await self._session.send(
                input={"client_content": {"turn_complete": False, "interrupted": True}}
            )

    async def _read_loop(self):
        """Continuously read responses from Gemini and enqueue StoryChunks."""
        try:
            async for response in self._session.receive():
                # Handle tool calls (image generation)
                if response.tool_call:
                    for fc in response.tool_call.function_calls:
                        if fc.name == "generate_image":
                            scene_desc = fc.args.get("scene_description", "")
                            image_b64 = await self._image_service.generate(scene_desc)
                            chunk = StoryChunk(
                                type="image",
                                data=image_b64,
                                mime_type="image/png",
                                sequence=self._next_seq(),
                            )
                            await self._response_queue.put(chunk)

                            # Send tool response back to Gemini
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

                # Handle text chunks
                if response.text:
                    chunk = StoryChunk(
                        type="text",
                        data=response.text,
                        sequence=self._next_seq(),
                    )
                    await self._response_queue.put(chunk)

                # Handle audio chunks
                if response.data:
                    audio_b64 = base64.b64encode(response.data).decode()
                    chunk = StoryChunk(
                        type="audio",
                        data=audio_b64,
                        mime_type="audio/pcm;rate=24000",
                        sequence=self._next_seq(),
                    )
                    await self._response_queue.put(chunk)

        except asyncio.CancelledError:
            pass
        except Exception as e:
            err_chunk = StoryChunk(type="error", data=str(e))
            await self._response_queue.put(err_chunk)
        finally:
            await self._response_queue.put(None)  # sentinel

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
        self._client = genai.Client(api_key=api_key)
        self._image_service = ImageService()

    @asynccontextmanager
    async def create_session(self):
        session = GeminiSession(self._client, self._image_service)
        async with session:
            yield session
