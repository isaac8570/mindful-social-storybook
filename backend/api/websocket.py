import json
import asyncio
from fastapi import WebSocket, WebSocketDisconnect
from services.gemini_service import GeminiService
from models.message import ClientMessage, StoryChunk

_gemini_service = None


def get_gemini_service() -> GeminiService:
    global _gemini_service
    if _gemini_service is None:
        _gemini_service = GeminiService()
    return _gemini_service


async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    print("[WS] Client connected")

    try:
        async with get_gemini_service().create_session() as session:
            # Start a concurrent task to forward Gemini responses to client
            async def send_responses():
                async for chunk in session.stream_responses():
                    await websocket.send_text(chunk.model_dump_json())

            send_task = asyncio.create_task(send_responses())

            try:
                while True:
                    raw = await websocket.receive_text()
                    msg = ClientMessage.model_validate_json(raw)

                    if msg.type == "interrupt":
                        await session.interrupt()
                    elif msg.type == "audio":
                        await session.send(msg)
                    elif msg.type == "text":
                        await session.send(msg)

            except WebSocketDisconnect:
                print("[WS] Client disconnected")
            finally:
                send_task.cancel()
                try:
                    await send_task
                except asyncio.CancelledError:
                    pass

    except Exception as e:
        print(f"[WS] Error: {e}")
        error_chunk = StoryChunk(type="error", data=str(e))
        try:
            await websocket.send_text(error_chunk.model_dump_json())
        except Exception:
            pass
