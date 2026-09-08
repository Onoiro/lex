"""Tests for app token auth and CORS whitelist."""

import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient

from proxy.main import app, token_auth, ALLOWED_ORIGINS, translation_cache


@pytest.fixture(autouse=True)
def token_auth_disabled(monkeypatch):
    """Disable token checking by default; tests enable it explicitly."""
    monkeypatch.setattr(token_auth, "_tokens", set())
    yield
    token_auth.reload()


@pytest.fixture(autouse=True)
def clear_translation_cache():
    """Clear the shared translation cache so tests don't see each other's entries."""
    translation_cache.clear()
    yield
    translation_cache.clear()


@pytest.fixture
def client():
    return TestClient(app)


class TestAppTokenAuth:
    """Unit tests for the AppTokenAuth class."""

    def test_disabled_when_no_tokens(self, monkeypatch):
        monkeypatch.setenv("APP_TOKENS", "")
        token_auth.reload()
        assert not token_auth.enabled
        assert token_auth.is_valid(None)

    def test_enabled_with_tokens(self, monkeypatch):
        monkeypatch.setenv("APP_TOKENS", "tok1, tok2 ,")
        token_auth.reload()
        assert token_auth.enabled
        assert token_auth.is_valid("tok1")
        assert token_auth.is_valid("tok2")
        assert not token_auth.is_valid("tok3")
        assert not token_auth.is_valid(None)
        assert not token_auth.is_valid("")

    def test_reload_picks_up_env_changes(self, monkeypatch):
        monkeypatch.setenv("APP_TOKENS", "old")
        token_auth.reload()
        assert token_auth.is_valid("old")

        monkeypatch.setenv("APP_TOKENS", "new")
        token_auth.reload()
        assert not token_auth.is_valid("old")
        assert token_auth.is_valid("new")


class TestTokenMiddleware:
    """Integration tests for the X-App-Token middleware."""

    def test_request_without_token_passes_when_disabled(self, client):
        resp = client.post("/translate", json={"word": "hello"})
        assert resp.status_code != 403

    def test_request_without_token_returns_403_when_enabled(self, client, monkeypatch):
        monkeypatch.setattr(token_auth, "_tokens", {"secret"})
        resp = client.post("/translate", json={"word": "hello"})
        assert resp.status_code == 403
        assert resp.json() == {"error": "unauthorized"}

    def test_request_with_wrong_token_returns_403(self, client, monkeypatch):
        monkeypatch.setattr(token_auth, "_tokens", {"secret"})
        resp = client.post(
            "/translate",
            json={"word": "hello"},
            headers={"X-App-Token": "wrong"},
        )
        assert resp.status_code == 403

    def test_request_with_valid_token_passes(self, client, monkeypatch):
        monkeypatch.setattr(token_auth, "_tokens", {"secret"})
        with patch("proxy.main.translate_word", return_value=("привет", "en")):
            resp = client.post(
                "/translate",
                json={"word": "hello"},
                headers={"X-App-Token": "secret"},
            )
        assert resp.status_code == 200
        assert resp.json()["translation"] == "привет"

    def test_health_check_open_without_token(self, client, monkeypatch):
        monkeypatch.setattr(token_auth, "_tokens", {"secret"})
        resp = client.get("/")
        assert resp.status_code == 200
        assert resp.json() == {"status": "ok"}

    def test_preflight_does_not_require_token(self, client, monkeypatch):
        monkeypatch.setattr(token_auth, "_tokens", {"secret"})
        resp = client.options(
            "/translate",
            headers={
                "Origin": ALLOWED_ORIGINS[0],
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type,x-app-token",
            },
        )
        assert resp.status_code == 200

    def test_all_protected_endpoints_require_token(self, client, monkeypatch):
        monkeypatch.setattr(token_auth, "_tokens", {"secret"})
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
            assert resp.status_code == 403, f"{method.upper()} {url} not protected"


class TestCorsWhitelist:
    """Tests for the CORS origin whitelist."""

    def test_preflight_from_allowed_origin(self, client):
        origin = ALLOWED_ORIGINS[0]
        resp = client.options(
            "/translate",
            headers={
                "Origin": origin,
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type,x-app-token",
            },
        )
        assert resp.status_code == 200
        assert resp.headers["access-control-allow-origin"] == origin

    def test_simple_request_from_allowed_origin_gets_header(self, client):
        origin = ALLOWED_ORIGINS[0]
        resp = client.get("/", headers={"Origin": origin})
        assert resp.headers["access-control-allow-origin"] == origin

    def test_disallowed_origin_gets_no_cors_header(self, client):
        resp = client.get("/", headers={"Origin": "https://evil.com"})
        assert "access-control-allow-origin" not in resp.headers

    def test_preflight_from_disallowed_origin_rejected(self, client):
        resp = client.options(
            "/translate",
            headers={
                "Origin": "https://evil.com",
                "Access-Control-Request-Method": "POST",
            },
        )
        assert resp.status_code == 400

    def test_all_platform_origins_in_default_list(self):
        for origin in (
            "https://lex.2-way.ru",
            "https://localhost",
            "capacitor://localhost",
            "http://tauri.localhost",
            "tauri://localhost",
        ):
            assert origin in ALLOWED_ORIGINS

    def test_allowed_origins_env_overrides_default(self, monkeypatch):
        from proxy.main import load_allowed_origins

        monkeypatch.setenv(
            "ALLOWED_ORIGINS", "https://custom.example,http://localhost:5173"
        )
        assert load_allowed_origins() == [
            "https://custom.example",
            "http://localhost:5173",
        ]

    def test_allowed_origins_env_empty_uses_default(self, monkeypatch):
        from proxy.main import load_allowed_origins, DEFAULT_ALLOWED_ORIGINS

        monkeypatch.setenv("ALLOWED_ORIGINS", "")
        assert load_allowed_origins() == DEFAULT_ALLOWED_ORIGINS
