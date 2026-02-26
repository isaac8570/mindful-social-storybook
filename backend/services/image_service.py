import os
import httpx


class ImageService:
    """
    Generates story illustrations via gemini-2.0-flash-exp-image-generation.
    Uses the same GEMINI_API_KEY — no extra auth needed.
    """

    def __init__(self):
        self._api_key = os.environ.get("GEMINI_API_KEY", "")

    async def generate(self, scene_description: str) -> str:
        """Returns a base64-encoded PNG, or empty string on failure."""
        if not self._api_key:
            print("[ImageService] No GEMINI_API_KEY — skipping image")
            return ""
        try:
            return await self._generate(scene_description)
        except Exception as e:
            print(f"[ImageService] Image generation failed: {e}")
            return ""

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
                    return part["inlineData"]["data"]  # base64 PNG
            raise ValueError("No image in response")
