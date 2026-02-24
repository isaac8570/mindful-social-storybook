"""
Shared pytest fixtures and configuration.
"""

import os
import sys
import pytest

# Ensure backend root is on path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Set test environment variables before any imports
os.environ.setdefault("GEMINI_API_KEY", "test-dummy-key-for-tests")
os.environ.setdefault("GCP_PROJECT_ID", "")
os.environ.setdefault("GCP_LOCATION", "us-central1")
os.environ.setdefault("PORT", "8080")


@pytest.fixture(autouse=True)
def reset_gemini_service_singleton():
    """Reset the global GeminiService singleton between tests."""
    import api.websocket as ws_module

    original = ws_module._gemini_service
    ws_module._gemini_service = None
    yield
    ws_module._gemini_service = original
