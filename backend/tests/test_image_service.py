"""
Unit tests for ImageService.
Tests placeholder fallback behavior when GCP is not configured.
"""

import pytest
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

os.environ.setdefault("GEMINI_API_KEY", "test-dummy-key")
os.environ["GCP_PROJECT_ID"] = ""  # Force placeholder mode


@pytest.mark.asyncio
async def test_image_service_placeholder_when_no_gcp():
    """ImageService returns placeholder when GCP_PROJECT_ID is not set."""
    from services.image_service import ImageService, _PLACEHOLDER_B64

    svc = ImageService()
    assert not svc._use_vertex, "Should be in placeholder mode without GCP project"

    result = await svc.generate("A cozy forest scene")
    assert result == _PLACEHOLDER_B64


@pytest.mark.asyncio
async def test_image_service_placeholder_is_valid_base64():
    """Placeholder image is valid base64."""
    import base64
    from services.image_service import _PLACEHOLDER_B64

    # Should not raise
    decoded = base64.b64decode(_PLACEHOLDER_B64)
    assert len(decoded) > 0


@pytest.mark.asyncio
async def test_image_service_with_gcp_project_uses_vertex(monkeypatch):
    """ImageService uses Vertex AI when GCP_PROJECT_ID is set."""
    monkeypatch.setenv("GCP_PROJECT_ID", "my-test-project")

    from services.image_service import ImageService

    svc = ImageService()
    assert svc._use_vertex, "Should use Vertex AI when GCP project is set"
    assert svc._project == "my-test-project"


@pytest.mark.asyncio
async def test_image_service_vertex_error_falls_back_to_placeholder(monkeypatch):
    """ImageService falls back to placeholder on Vertex AI error."""
    monkeypatch.setenv("GCP_PROJECT_ID", "my-test-project")

    from services.image_service import ImageService, _PLACEHOLDER_B64

    svc = ImageService()

    # Mock _generate_via_vertex to raise an exception
    async def mock_fail(desc):
        raise RuntimeError("Vertex AI unavailable in test")

    svc._generate_via_vertex = mock_fail

    result = await svc.generate("A scary thunderstorm")
    assert result == _PLACEHOLDER_B64
