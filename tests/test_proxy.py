"""Tests for translate proxy endpoints."""

import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient

from proxy.main import (
    app,
    translate_limiter,
    translate_quotas,
    tts_limiter,
    tts_quotas,
    global_budget,
    translation_cache,
    speech_cache,
)


@pytest.fixture(autouse=True)
def reset_rate_limiter():
    """Clear rate limiter, quota, budget and cache state before each test."""
    translate_limiter._requests.clear()
    tts_limiter._requests.clear()
    global_budget.reset()
    translation_cache.clear()
    speech_cache.clear()
    for quotas in (translate_quotas, tts_quotas):
        for quota in quotas.values():
            quota.reset()
    yield
    translate_limiter._requests.clear()
    tts_limiter._requests.clear()
    global_budget.reset()
    translation_cache.clear()
    speech_cache.clear()
    for quotas in (translate_quotas, tts_quotas):
        for quota in quotas.values():
            quota.reset()


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def device_client():
    """TestClient sending a default X-Device-Id header on every request."""
    return TestClient(app, headers={"X-Device-Id": "test-device-1"})


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

    def test_rate_limit_exceeded(self, device_client):
        """Returns 429 after exceeding rate limit."""
        with patch("proxy.main.translate_word", return_value=("тест", "en")):
            # Exhaust the rate limit (30 requests)
            for _ in range(30):
                resp = device_client.post("/translate", json={"word": "test"})
                assert resp.status_code == 200

            # 31st request should be rate limited
            resp = device_client.post("/translate", json={"word": "test"})
            assert resp.status_code == 429
            assert "error" in resp.json()
            assert resp.headers.get("Retry-After") == "60"

    def test_text_too_long_returns_400(self, client):
        """Word longer than 500 chars returns 400 text_too_long."""
        resp = client.post("/translate", json={"word": "a" * 501})

        assert resp.status_code == 400
        data = resp.json()
        assert data["error"] == "text_too_long"
        assert data["max_length"] == 500

    def test_text_at_limit_accepted(self, client):
        """Word of exactly 500 chars passes the length check."""
        with patch("proxy.main.translate_word", return_value=("тест", "en")):
            resp = client.post("/translate", json={"word": "a" * 500})

        assert resp.status_code == 200

    def test_daily_quota_exceeded(self, device_client):
        """Returns 429 daily_quota_exceeded after exhausting daily chars."""
        with patch("proxy.main.translate_word", return_value=("тест", "en")):
            # 500 chars/day: 5 requests x 100 chars
            for _ in range(5):
                resp = device_client.post("/translate", json={"word": "a" * 100})
                assert resp.status_code == 200

            # Quota exhausted — even a short word is rejected
            resp = device_client.post("/translate", json={"word": "hi"})
            assert resp.status_code == 429
            assert resp.json()["error"] == "daily_quota_exceeded"

    def test_daily_quota_not_consumed_on_length_error(self, client):
        """Rejected too-long requests do not consume quota."""
        resp = client.post("/translate", json={"word": "a" * 501})
        assert resp.status_code == 400

        with patch("proxy.main.translate_word", return_value=("тест", "en")):
            resp = client.post("/translate", json={"word": "a" * 500})
        assert resp.status_code == 200

    def test_global_budget_exceeded_returns_503(self, client):
        """Returns 503 service_overloaded when global budget is exhausted."""
        assert global_budget.try_consume(global_budget.remaining()) is True

        with patch("proxy.main.translate_word", return_value=("тест", "en")):
            resp = client.post("/translate", json={"word": "hi"})

        assert resp.status_code == 503
        assert resp.json()["error"] == "service_overloaded"

    def test_global_budget_not_consumed_on_cache_hit(self, client):
        """Cached translations don't consume the global budget."""
        translation_cache.set("auto:ru:hello", "тест")

        with patch("proxy.main.translate_word") as mock_translate:
            resp = client.post("/translate", json={"word": "hello"})

        assert resp.status_code == 200
        assert resp.json()["translation"] == "тест"
        assert resp.json()["detected_language"] == ""
        mock_translate.assert_not_called()


class TestQuotaLevels:
    """Tests for device / IP / anon daily quota levels."""

    def test_two_devices_one_ip_have_independent_quotas(self, device_client):
        """Devices behind one IP each get a full device quota."""
        device_a = TestClient(app, headers={"X-Device-Id": "device-a"})
        device_b = TestClient(app, headers={"X-Device-Id": "device-b"})

        with patch("proxy.main.translate_word", return_value=("тест", "en")):
            for _ in range(5):
                resp = device_a.post("/translate", json={"word": "a" * 100})
                assert resp.status_code == 200

            # Device A is out of quota, device B is not affected
            resp = device_a.post("/translate", json={"word": "hi"})
            assert resp.status_code == 429

            resp = device_b.post("/translate", json={"word": "a" * 100})
            assert resp.status_code == 200

    def test_ip_quota_blocks_many_devices(self, monkeypatch):
        """IP quota stops a flood of distinct device IDs from one IP."""
        monkeypatch.setattr("proxy.main.IP_DAILY_CHAR_LIMIT", 600)
        monkeypatch.setattr(translate_quotas["ip"], "max_chars_per_day", 600)

        with patch("proxy.main.translate_word", return_value=("тест", "en")):
            # 7 devices x 100 chars = 700 > 600 IP limit, each device well
            # within its own 500-char device quota
            for i in range(6):
                client = TestClient(app, headers={"X-Device-Id": f"flood-{i}"})
                resp = client.post("/translate", json={"word": "a" * 100})
                assert resp.status_code == 200

            client = TestClient(app, headers={"X-Device-Id": "flood-last"})
            resp = client.post("/translate", json={"word": "a" * 100})
            assert resp.status_code == 429
            assert resp.json()["error"] == "daily_quota_exceeded"

    def test_request_without_device_id_uses_anon_quota(self, client):
        """Anonymous request gets the reduced anon quota."""
        from proxy.main import translate_quotas as quotas

        anon_limit = quotas["anon"].max_chars_per_day

        with patch("proxy.main.translate_word", return_value=("тест", "en")):
            resp = client.post("/translate", json={"word": "x" * anon_limit})
            assert resp.status_code == 200

            resp = client.post("/translate", json={"word": "hi"})
            assert resp.status_code == 429
            assert resp.json()["error"] == "daily_quota_exceeded"

    def test_blank_device_id_treated_as_anonymous(self, client):
        """Whitespace-only X-Device-Id falls back to the anon quota."""
        with patch("proxy.main.translate_word", return_value=("тест", "en")):
            resp = client.post(
                "/translate",
                json={"word": "hi"},
                headers={"X-Device-Id": "   "},
            )
        assert resp.status_code == 200


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
        """CORS headers are present for a whitelisted origin."""
        from proxy.main import ALLOWED_ORIGINS

        origin = ALLOWED_ORIGINS[0]
        resp = client.options("/translate", headers={
            "Origin": origin,
            "Access-Control-Request-Method": "POST",
        })

        assert resp.headers.get("access-control-allow-origin") == origin
