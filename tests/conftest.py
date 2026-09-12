"""Shared fixtures for proxy tests."""

import pytest


@pytest.fixture(autouse=True)
def sqlite_cache_env(tmp_path, monkeypatch):
    """Point SQLITE_CACHE_PATH at a per-test temp file BEFORE proxy imports.

    Global cache instances in proxy.services.* are created at import time,
    so the env var must be set before any proxy module is imported. This
    keeps tests from writing to the real data/cache.db.
    """
    monkeypatch.setenv("SQLITE_CACHE_PATH", str(tmp_path / "test-cache.db"))
    yield


@pytest.fixture(autouse=True)
def clear_env_vars(monkeypatch):
    """Clear Yandex API env vars before each test to avoid accidental API calls."""
    monkeypatch.delenv("YANDEX_API_KEY", raising=False)
    monkeypatch.delenv("YANDEX_FOLDER_ID", raising=False)
    yield
