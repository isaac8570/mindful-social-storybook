"""
Unit tests for Pydantic models.
"""

import pytest
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def test_story_chunk_text():
    from models.message import StoryChunk

    chunk = StoryChunk(type="text", data="Hello, world!", sequence=1)
    assert chunk.type == "text"
    assert chunk.data == "Hello, world!"
    assert chunk.sequence == 1
    assert chunk.mime_type is None


def test_story_chunk_image():
    from models.message import StoryChunk

    chunk = StoryChunk(
        type="image", data="base64data==", mime_type="image/png", sequence=2
    )
    assert chunk.type == "image"
    assert chunk.mime_type == "image/png"


def test_story_chunk_audio():
    from models.message import StoryChunk

    chunk = StoryChunk(
        type="audio", data="audiob64==", mime_type="audio/pcm;rate=24000", sequence=3
    )
    assert chunk.type == "audio"
    assert chunk.mime_type == "audio/pcm;rate=24000"


def test_story_chunk_error():
    from models.message import StoryChunk

    chunk = StoryChunk(type="error", data="Something went wrong")
    assert chunk.type == "error"
    assert chunk.data == "Something went wrong"


def test_story_chunk_json_serialization():
    from models.message import StoryChunk

    chunk = StoryChunk(type="text", data="test", sequence=1)
    json_str = chunk.model_dump_json()
    assert '"type":"text"' in json_str
    assert '"data":"test"' in json_str


def test_client_message_text():
    from models.message import ClientMessage

    msg = ClientMessage(type="text", data="I am scared of the dark")
    assert msg.type == "text"
    assert msg.data == "I am scared of the dark"


def test_client_message_audio():
    from models.message import ClientMessage

    msg = ClientMessage(
        type="audio", data="audiob64==", mime_type="audio/pcm;rate=16000"
    )
    assert msg.type == "audio"
    assert msg.mime_type == "audio/pcm;rate=16000"


def test_client_message_interrupt():
    from models.message import ClientMessage

    msg = ClientMessage(type="interrupt")
    assert msg.type == "interrupt"
    assert msg.data is None


def test_client_message_validation_from_json():
    from models.message import ClientMessage
    import json

    raw = json.dumps({"type": "text", "data": "hello"})
    msg = ClientMessage.model_validate_json(raw)
    assert msg.type == "text"
    assert msg.data == "hello"
