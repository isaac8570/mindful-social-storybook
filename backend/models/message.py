from pydantic import BaseModel
from typing import Literal, Optional


class StoryChunk(BaseModel):
    """A single chunk of the interleaved story stream sent to the client."""

    type: Literal["text", "image", "audio", "status", "error"]
    data: Optional[str] = None  # text content or base64 image/audio
    mime_type: Optional[str] = None  # e.g. "image/png", "audio/pcm"
    sequence: Optional[int] = None  # ordering index for sync


class ClientMessage(BaseModel):
    """Message received from the client over WebSocket."""

    type: Literal["audio", "text", "interrupt"]
    data: Optional[str] = None  # base64 audio or plain text
    mime_type: Optional[str] = None
