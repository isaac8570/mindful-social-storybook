import os
import base64
import io
import httpx

try:
    from PIL import Image as PILImage

    _PIL_AVAILABLE = True
except ImportError:
    _PIL_AVAILABLE = False

# Target max size for WebSocket transmission (bytes, before base64 encoding)
_MAX_IMAGE_BYTES = 400_000  # ~400KB raw → ~533KB base64, well under 1MB WS limit
_TARGET_SIZE = (768, 768)


class ImageService:
    """
    Generates story illustrations via gemini-2.0-flash-exp-image-generation.
    Uses the same GEMINI_API_KEY — no extra auth needed.
    """

    def __init__(self):
        self._api_key = os.environ.get("GEMINI_API_KEY", "")

    async def generate(self, scene_description: str) -> str:
        """Returns a base64-encoded JPEG, or empty string on failure."""
        if not self._api_key:
            print("[ImageService] No GEMINI_API_KEY — skipping image")
            return ""
        try:
            return await self._generate(scene_description)
        except Exception as e:
            print(f"[ImageService] Image generation failed: {e}")
            return ""

    def _compress_image(self, raw_b64: str) -> str:
        """Resize and compress image to JPEG to reduce payload size."""
        if not _PIL_AVAILABLE:
            return raw_b64
        try:
            img_bytes = base64.b64decode(raw_b64)
            img = PILImage.open(io.BytesIO(img_bytes)).convert("RGB")
            img.thumbnail(_TARGET_SIZE, PILImage.LANCZOS)
            buf = io.BytesIO()
            quality = 85
            img.save(buf, format="JPEG", quality=quality, optimize=True)
            while buf.tell() > _MAX_IMAGE_BYTES and quality > 40:
                quality -= 10
                buf = io.BytesIO()
                img.save(buf, format="JPEG", quality=quality, optimize=True)
            compressed = base64.b64encode(buf.getvalue()).decode()
            orig_kb = len(img_bytes) // 1024
            new_kb = buf.tell() // 1024
            print(f"[ImageService] Compressed {orig_kb}KB → {new_kb}KB (q={quality})")
            return compressed
        except Exception as e:
            print(f"[ImageService] Compression failed: {e}, using original")
            return raw_b64

    async def _generate(self, scene_description: str) -> str:
        prompt = (
            f"{scene_description}. "
            "Style: soft watercolor illustration, warm pastel colors, "
            "child-friendly fairy tale art, gentle and comforting atmosphere. "
            "No text, no words in the image."
        )

        url = (
            "https://generativelanguage.googleapis.com/v1beta/models/"
            f"gemini-2.0-flash-exp-image-generation:generateContent"
            f"?key={self._api_key}"
        )

        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"responseModalities": ["TEXT", "IMAGE"]},
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(url, json=payload)
            resp.raise_for_status()
            parts = (
                resp.json()
                .get("candidates", [{}])[0]
                .get("content", {})
                .get("parts", [])
            )
            for part in parts:
                if "inlineData" in part:
                    raw_b64 = part["inlineData"]["data"]
                    return self._compress_image(raw_b64)
            raise ValueError("No image in response")
