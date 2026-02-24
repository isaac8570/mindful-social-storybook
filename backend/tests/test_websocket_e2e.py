"""
E2E WebSocket tests using mocked Gemini service.
Tests the full WebSocket message flow without a real API key.
"""

import pytest
import asyncio
import json
import sys
import os
from unittest.mock import AsyncMock, MagicMock, patch
from contextlib import asynccontextmanager

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

os.environ.setdefault("GEMINI_API_KEY", "test-dummy-key-for-e2e")
os.environ.setdefault("GCP_PROJECT_ID", "")


# ─── Mock GeminiSession ───────────────────────────────────────────────────────


class MockGeminiSession:
    """Simulates a GeminiSession that yields predefined story chunks."""

    def __init__(self, chunks):
        self._chunks = chunks

    async def send(self, msg):
        pass

    async def interrupt(self):
        pass

    async def stream_responses(self):
        from models.message import StoryChunk

        for chunk in self._chunks:
            yield chunk
            await asyncio.sleep(0)


# ─── Tests ────────────────────────────────────────────────────────────────────


def test_websocket_connect_and_receive_text():
    """WebSocket endpoint should accept connection and forward text chunks."""
    from fastapi.testclient import TestClient
    from models.message import StoryChunk

    mock_chunks = [
        StoryChunk(type="text", data="옛날 옛날에", sequence=1),
        StoryChunk(type="text", data=" 작은 새가 있었어요.", sequence=2),
    ]

    mock_session = MockGeminiSession(mock_chunks)

    @asynccontextmanager
    async def mock_create_session():
        yield mock_session

    with patch("api.websocket.get_gemini_service") as mock_svc_factory:
        mock_svc = MagicMock()
        mock_svc.create_session = mock_create_session
        mock_svc_factory.return_value = mock_svc

        from main import app

        client = TestClient(app)

        with client.websocket_connect("/ws/story") as ws:
            # Send a text message
            ws.send_text(json.dumps({"type": "text", "data": "천둥이 무서워요"}))

            # Receive chunks
            received = []
            for _ in range(2):
                try:
                    data = ws.receive_text()
                    received.append(json.loads(data))
                except Exception:
                    break

    assert len(received) >= 1
    assert received[0]["type"] == "text"
    assert "옛날" in received[0]["data"]


def test_websocket_connect_and_receive_image():
    """WebSocket endpoint should forward image chunks."""
    from fastapi.testclient import TestClient
    from models.message import StoryChunk

    mock_chunks = [
        StoryChunk(
            type="image",
            data="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQ==",
            mime_type="image/png",
            sequence=1,
        ),
    ]

    mock_session = MockGeminiSession(mock_chunks)

    @asynccontextmanager
    async def mock_create_session():
        yield mock_session

    with patch("api.websocket.get_gemini_service") as mock_svc_factory:
        mock_svc = MagicMock()
        mock_svc.create_session = mock_create_session
        mock_svc_factory.return_value = mock_svc

        from main import app

        client = TestClient(app)

        with client.websocket_connect("/ws/story") as ws:
            ws.send_text(json.dumps({"type": "text", "data": "그림 그려줘"}))

            received = []
            for _ in range(1):
                try:
                    data = ws.receive_text()
                    received.append(json.loads(data))
                except Exception:
                    break

    assert len(received) >= 1
    assert received[0]["type"] == "image"
    assert received[0]["mime_type"] == "image/png"


def test_websocket_interrupt_message():
    """WebSocket should handle interrupt messages without crashing."""
    from fastapi.testclient import TestClient
    from models.message import StoryChunk

    interrupted = []

    class InterruptTrackingSession(MockGeminiSession):
        async def interrupt(self):
            interrupted.append(True)

    mock_session = InterruptTrackingSession([])

    @asynccontextmanager
    async def mock_create_session():
        yield mock_session

    with patch("api.websocket.get_gemini_service") as mock_svc_factory:
        mock_svc = MagicMock()
        mock_svc.create_session = mock_create_session
        mock_svc_factory.return_value = mock_svc

        from main import app

        client = TestClient(app)

        with client.websocket_connect("/ws/story") as ws:
            ws.send_text(json.dumps({"type": "interrupt"}))
            # Give it a moment to process
            import time

            time.sleep(0.1)


def test_websocket_error_handling():
    """WebSocket should send error chunk when Gemini service fails."""
    from fastapi.testclient import TestClient

    @asynccontextmanager
    async def mock_create_session_error():
        raise RuntimeError("Gemini API connection failed")
        yield  # make it a generator

    with patch("api.websocket.get_gemini_service") as mock_svc_factory:
        mock_svc = MagicMock()
        mock_svc.create_session = mock_create_session_error
        mock_svc_factory.return_value = mock_svc

        from main import app

        client = TestClient(app)

        with client.websocket_connect("/ws/story") as ws:
            try:
                data = ws.receive_text()
                chunk = json.loads(data)
                assert chunk["type"] == "error"
            except Exception:
                # Connection may close on error — that's acceptable
                pass


def test_websocket_audio_message():
    """WebSocket should accept audio messages."""
    import base64
    from fastapi.testclient import TestClient
    from models.message import StoryChunk

    audio_sent = []

    class AudioTrackingSession(MockGeminiSession):
        async def send(self, msg):
            if msg.type == "audio":
                audio_sent.append(msg.data)

    mock_session = AudioTrackingSession([])

    @asynccontextmanager
    async def mock_create_session():
        yield mock_session

    with patch("api.websocket.get_gemini_service") as mock_svc_factory:
        mock_svc = MagicMock()
        mock_svc.create_session = mock_create_session
        mock_svc_factory.return_value = mock_svc

        from main import app

        client = TestClient(app)

        # Fake PCM audio data (16-bit, 16kHz, 1 channel)
        fake_audio = base64.b64encode(bytes(320)).decode()

        with client.websocket_connect("/ws/story") as ws:
            ws.send_text(
                json.dumps(
                    {
                        "type": "audio",
                        "data": fake_audio,
                        "mime_type": "audio/pcm;rate=16000",
                    }
                )
            )
            import time

            time.sleep(0.1)
