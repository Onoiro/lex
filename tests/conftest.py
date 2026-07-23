"""Shared fixtures for proxy tests."""

import pytest


@pytest.fixture(autouse=True)
def clear_env_vars(monkeypatch):
    """Clear Yandex API env vars before each test to avoid accidental API calls."""
    monkeypatch.delenv("YANDEX_API_KEY", raising=False)
    monkeypatch.delenv("YANDEX_FOLDER_ID", raising=False)
    yield