"""
Health check and basic API tests.
These tests run without a real Gemini API key.
"""

import pytest
from fastapi.testclient import TestClient
import sys
import os

# Add backend root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Set dummy env vars before importing app
os.environ.setdefault("GEMINI_API_KEY", "test-dummy-key-for-unit-tests")
os.environ.setdefault("GCP_PROJECT_ID", "")


def test_health_endpoint():
    """GET /health should return 200 with status ok."""
    from main import app

    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["service"] == "mindful-social-storybook"


def test_health_endpoint_content_type():
    """Health endpoint should return JSON."""
    from main import app

    client = TestClient(app)
    response = client.get("/health")
    assert "application/json" in response.headers["content-type"]
