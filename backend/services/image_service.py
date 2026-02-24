import os
import base64
import httpx

# Placeholder image (1x1 warm beige PNG) used when Vertex AI is not configured
_PLACEHOLDER_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg=="


class ImageService:
    """
    Generates story illustrations via Vertex AI Imagen 3.
    Falls back to a placeholder when credentials are not available.
    """

    def __init__(self):
        self._project = os.environ.get("GCP_PROJECT_ID", "")
        self._location = os.environ.get("GCP_LOCATION", "us-central1")
        self._use_vertex = bool(self._project)

    async def generate(self, scene_description: str) -> str:
        """
        Returns a base64-encoded PNG image for the given scene description.
        """
        if not self._use_vertex:
            print(
                f"[ImageService] No GCP project set — returning placeholder for: {scene_description[:60]}"
            )
            return _PLACEHOLDER_B64

        try:
            return await self._generate_via_vertex(scene_description)
        except Exception as e:
            print(f"[ImageService] Vertex AI error: {e} — returning placeholder")
            return _PLACEHOLDER_B64

    async def _generate_via_vertex(self, scene_description: str) -> str:
        """Call Vertex AI Imagen 3 REST API and return base64 PNG."""
        import google.auth
        import google.auth.transport.requests

        credentials, _ = google.auth.default(
            scopes=["https://www.googleapis.com/auth/cloud-platform"]
        )
        auth_req = google.auth.transport.requests.Request()
        credentials.refresh(auth_req)
        token = credentials.token

        endpoint = (
            f"https://{self._location}-aiplatform.googleapis.com/v1/"
            f"projects/{self._project}/locations/{self._location}/"
            f"publishers/google/models/imagen-3.0-generate-001:predict"
        )

        prompt = (
            f"{scene_description}. "
            "Style: soft watercolor illustration, warm pastel colors, "
            "cozy knitted texture, child-friendly fairy tale art, "
            "gentle and comforting atmosphere."
        )

        payload = {
            "instances": [{"prompt": prompt}],
            "parameters": {
                "sampleCount": 1,
                "aspectRatio": "1:1",
                "safetyFilterLevel": "block_some",
                "personGeneration": "allow_adult",
            },
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                endpoint,
                json=payload,
                headers={"Authorization": f"Bearer {token}"},
            )
            resp.raise_for_status()
            result = resp.json()
            b64_image = result["predictions"][0]["bytesBase64Encoded"]
            return b64_image
