"""Tests for the client version gate (X-App-Version header)."""

import pytest
from fastapi.testclient import TestClient

from proxy.main import app, token_auth, version_gate, translation_cache
from proxy.security.version_gate import VersionGate, parse_version


@pytest.fixture(autouse=True)
def token_auth_disabled(monkeypatch):
    """Disable token checking by default; tests enable it explicitly."""
    monkeypatch.setattr(token_auth, "_tokens", set())
    yield
    token_auth.reload()


@pytest.fixture(autouse=True)
def version_gate_disabled(monkeypatch):
    """Disable version checking by default; tests enable it explicitly."""
    monkeypatch.setattr(version_gate, "_min_version", None)
    yield
    version_gate.reload()


@pytest.fixture(autouse=True)
def clear_translation_cache():
    """Clear the shared translation cache so tests don't see each other's entries."""
    translation_cache.clear()
    yield
    translation_cache.clear()


@pytest.fixture
def client():
    return TestClient(app)


class TestParseVersion:
    """Unit tests for parse_version."""

    def test_valid_versions(self):
        assert parse_version("1.21.0") == (1, 21, 0)
        assert parse_version("0.1.0") == (0, 1, 0)
        assert parse_version("10.0.3") == (10, 0, 3)

    def test_whitespace_is_stripped(self):
        assert parse_version("  1.2.3 ") == (1, 2, 3)

    def test_invalid_versions(self):
        assert parse_version("1.2") is None
        assert parse_version("1.2.3.4") is None
        assert parse_version("1.2.x") is None
        assert parse_version("abc") is None
        assert parse_version("") is None

    def test_comparison_semantics(self):
        assert parse_version("1.21.0") > parse_version("1.20.9")
        assert parse_version("1.2.0") < parse_version("1.10.0")


class TestVersionGate:
    """Unit tests for the VersionGate class."""

    def test_disabled_when_env_empty(self, monkeypatch):
        monkeypatch.setenv("MIN_APP_VERSION", "")
        gate = VersionGate()
        assert not gate.enabled
        assert gate.is_supported(None)
        assert gate.is_supported("0.0.1")
        assert gate.min_version is None

    def test_enabled_with_env(self, monkeypatch):
        monkeypatch.setenv("MIN_APP_VERSION", "1.21.0")
        gate = VersionGate()
        assert gate.enabled
        assert gate.min_version == "1.21.0"

    def test_equal_version_supported(self, monkeypatch):
        monkeypatch.setenv("MIN_APP_VERSION", "1.21.0")
        gate = VersionGate()
        assert gate.is_supported("1.21.0")

    def test_newer_version_supported(self, monkeypatch):
        monkeypatch.setenv("MIN_APP_VERSION", "1.21.0")
        gate = VersionGate()
        assert gate.is_supported("1.22.0")
        assert gate.is_supported("2.0.0")

    def test_older_version_not_supported(self, monkeypatch):
        monkeypatch.setenv("MIN_APP_VERSION", "1.21.0")
        gate = VersionGate()
        assert not gate.is_supported("1.20.9")
        assert not gate.is_supported("1.2.0")

    def test_missing_version_not_supported(self, monkeypatch):
        monkeypatch.setenv("MIN_APP_VERSION", "1.21.0")
        gate = VersionGate()
        assert not gate.is_supported(None)
        assert not gate.is_supported("")

    def test_garbage_version_not_supported(self, monkeypatch):
        monkeypatch.setenv("MIN_APP_VERSION", "1.21.0")
        gate = VersionGate()
        assert not gate.is_supported("not-a-version")
        assert not gate.is_supported("1.2")

    def test_reload_picks_up_env_changes(self, monkeypatch):
        monkeypatch.setenv("MIN_APP_VERSION", "1.0.0")
        gate = VersionGate()
        assert gate.is_supported("1.0.0")

        monkeypatch.setenv("MIN_APP_VERSION", "2.0.0")
        gate.reload()
        assert not gate.is_supported("1.0.0")
        assert gate.is_supported("2.0.0")


class TestVersionMiddleware:
    """Integration tests for the X-App-Version middleware."""

    def test_passes_when_disabled(self, client):
        resp = client.post("/translate", json={"word": "hello"})
        assert resp.status_code != 426

    def test_outdated_version_returns_426(self, client, monkeypatch):
        monkeypatch.setattr(version_gate, "_min_version", (1, 21, 0))
        resp = client.post(
            "/translate",
            json={"word": "hello"},
            headers={"X-App-Version": "1.20.0"},
        )
        assert resp.status_code == 426
        assert resp.json() == {
            "error": "update_required",
            "min_version": "1.21.0",
        }

    def test_missing_version_returns_426_when_enabled(self, client, monkeypatch):
        monkeypatch.setattr(version_gate, "_min_version", (1, 21, 0))
        resp = client.post("/translate", json={"word": "hello"})
        assert resp.status_code == 426

    def test_equal_version_passes(self, client, monkeypatch):
        monkeypatch.setattr(version_gate, "_min_version", (1, 21, 0))
        resp = client.post(
            "/translate",
            json={"word": "hello"},
            headers={"X-App-Version": "1.21.0"},
        )
        assert resp.status_code != 426

    def test_newer_version_passes(self, client, monkeypatch):
        monkeypatch.setattr(version_gate, "_min_version", (1, 21, 0))
        resp = client.post(
            "/translate",
            json={"word": "hello"},
            headers={"X-App-Version": "2.0.0"},
        )
        assert resp.status_code != 426

    def test_health_check_open_without_version(self, client, monkeypatch):
        monkeypatch.setattr(version_gate, "_min_version", (1, 21, 0))
        resp = client.get("/")
        assert resp.status_code == 200
        assert resp.json() == {"status": "ok"}

    def test_preflight_does_not_require_version(self, client, monkeypatch):
        from proxy.main import ALLOWED_ORIGINS

        monkeypatch.setattr(version_gate, "_min_version", (1, 21, 0))
        resp = client.options(
            "/translate",
            headers={
                "Origin": ALLOWED_ORIGINS[0],
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type,x-app-version",
            },
        )
        assert resp.status_code == 200

    def test_all_protected_endpoints_check_version(self, client, monkeypatch):
        monkeypatch.setattr(version_gate, "_min_version", (1, 21, 0))
        endpoints = [
            ("post", "/translate", {"json": {"word": "hi"}}),
            ("post", "/tts", {"json": {"text": "hi", "lang": "en-US"}}),
            ("post", "/dictionary", {"json": {"word": "hi", "lang_pair": "en-ru"}}),
            ("post", "/feedback", {"json": {"category": "bug", "message": "x" * 10}}),
            ("get", "/languages", {}),
            ("get", "/cache/stats", {}),
            ("get", "/tts/cache/stats", {}),
            ("get", "/dictionary/cache/stats", {}),
        ]
        for method, url, kwargs in endpoints:
            resp = getattr(client, method)(url, **kwargs)
            assert resp.status_code == 426, f"{method.upper()} {url} not gated"

    def test_token_checked_before_version(self, client, monkeypatch):
        monkeypatch.setattr(token_auth, "_tokens", {"secret"})
        monkeypatch.setattr(version_gate, "_min_version", (1, 21, 0))
        resp = client.post(
            "/translate",
            json={"word": "hello"},
            headers={"X-App-Version": "1.20.0"},
        )
        assert resp.status_code == 403
        assert resp.json() == {"error": "unauthorized"}
