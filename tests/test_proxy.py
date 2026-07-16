"""Tests for translate proxy endpoints."""

import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient

from proxy.main import app, translate_limiter


@pytest.fixture(autouse=True)
def reset_rate_limiter():
    """Clear rate limiter state before each test."""
    translate_limiter._requests.clear()
    yield
    translate_limiter._requests.clear()


@pytest.fixture
def client():
    return TestClient(app)


class TestHealthCheck:
    """Tests for GET / endpoint."""

    def test_health_check(self, client):
        """Root endpoint returns status ok."""
        resp = client.get("/")
        assert resp.status_code == 200
        assert resp.json() == {"status": "ok"}


class TestTranslate:
    """Tests for POST /translate endpoint."""

    def test_successful_translation(self, client):
        """Returns translation and detected language."""
        with patch("proxy.main.translate_word", return_value=("привет", "en")):
            resp = client.post("/translate", json={
                "word": "hello",
                "source_lang": "auto",
                "target_lang": "ru",
            })

        assert resp.status_code == 200
        data = resp.json()
        assert data["translation"] == "привет"
        assert data["detected_language"] == "en"

    def test_translation_with_default_params(self, client):
        """Works with only word provided (defaults: auto/ru)."""
        with patch("proxy.main.translate_word", return_value=("тест", "en")):
            resp = client.post("/translate", json={"word": "test"})

        assert resp.status_code == 200
        assert resp.json()["translation"] == "тест"

    def test_empty_word_returns_400(self, client):
        """Empty word returns 400 error."""
        resp = client.post("/translate", json={"word": "  "})

        assert resp.status_code == 400
        assert "error" in resp.json()

    def test_translation_failure_returns_502(self, client):
        """Failed translation returns 502."""
        with patch("proxy.main.translate_word", return_value=(None, None)):
            resp = client.post("/translate", json={"word": "xyz"})

        assert resp.status_code == 502
        assert "error" in resp.json()

    def test_detected_language_empty_when_none(self, client):
        """detected_language is empty string when None (cache hit)."""
        with patch("proxy.main.translate_word", return_value=("кэш", None)):
            resp = client.post("/translate", json={"word": "cached"})

        assert resp.status_code == 200
        assert resp.json()["detected_language"] == ""

    def test_rate_limit_exceeded(self, client):
        """Returns 429 after exceeding rate limit."""
        with patch("proxy.main.translate_word", return_value=("тест", "en")):
            # Exhaust the rate limit (30 requests)
            for _ in range(30):
                resp = client.post("/translate", json={"word": "test"})
                assert resp.status_code == 200

            # 31st request should be rate limited
            resp = client.post("/translate", json={"word": "test"})
            assert resp.status_code == 429
            assert "error" in resp.json()
            assert resp.headers.get("Retry-After") == "60"


class TestLanguages:
    """Tests for GET /languages endpoint."""

    def test_successful_response(self, client):
        """Returns list of supported languages with names."""
        with patch("proxy.main.get_supported_languages", return_value={
            "en": ["ru"], "de": ["ru"], "fr": ["ru"]
        }), patch("proxy.main.get_api_language_names", return_value={
            "en": "English", "de": "German", "fr": "French"
        }):
            resp = client.get("/languages")

        assert resp.status_code == 200
        data = resp.json()
        assert len(data["languages"]) == 3
        assert {"code": "en", "name": "English"} in data["languages"]
        assert {"code": "de", "name": "German"} in data["languages"]
        assert {"code": "fr", "name": "French"} in data["languages"]

    def test_empty_languages(self, client):
        """Returns empty list when API returns nothing."""
        with patch("proxy.main.get_supported_languages", return_value={}), \
             patch("proxy.main.get_api_language_names", return_value={}):
            resp = client.get("/languages")

        assert resp.status_code == 200
        assert resp.json()["languages"] == []

    def test_language_without_name_falls_back_to_code(self, client):
        """Languages without API name fall back to code."""
        with patch("proxy.main.get_supported_languages", return_value={
            "xx": ["ru"]
        }), patch("proxy.main.get_api_language_names", return_value={}):
            resp = client.get("/languages")

        assert resp.status_code == 200
        assert resp.json()["languages"] == [{"code": "xx", "name": "xx"}]


class TestCacheStats:
    """Tests for GET /cache/stats endpoint."""

    def test_cache_stats(self, client):
        """Returns cache size."""
        with patch("proxy.main.translation_cache") as mock_cache:
            mock_cache.size.return_value = 5
            resp = client.get("/cache/stats")

        assert resp.status_code == 200
        assert resp.json() == {"size": 5}


class TestCors:
    """Tests for CORS headers."""

    def test_cors_headers_present(self, client):
        """CORS headers are present in response."""
        resp = client.options("/translate", headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "POST",
        })

        assert resp.headers.get("access-control-allow-origin") == "*"
