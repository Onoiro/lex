"""Tests for GET /quota endpoint and cache flags in /translate and /tts."""

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
def reset_state():
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


class TestQuotaEndpoint:
    """Tests for GET /quota endpoint."""

    def test_full_quota_with_device_id(self, device_client):
        """Fresh device sees the full device limit for translate and tts."""
        resp = device_client.get("/quota")

        assert resp.status_code == 200
        data = resp.json()
        device_limit = translate_quotas["device"].max_chars_per_day
        assert data["translate"] == {
            "used": 0,
            "limit": device_limit,
            "remaining": device_limit,
        }
        assert data["tts"] == {
            "used": 0,
            "limit": device_limit,
            "remaining": device_limit,
        }

    def test_remaining_decreases_after_translate(self, device_client):
        """After consuming chars via /translate the quota endpoint reflects it."""
        with patch("proxy.main.translate_word", return_value=("тест", "en")):
            resp = device_client.post("/translate", json={"word": "a" * 100})
            assert resp.status_code == 200

        resp = device_client.get("/quota")
        data = resp.json()
        device_limit = translate_quotas["device"].max_chars_per_day
        assert data["translate"]["used"] == 100
        assert data["translate"]["remaining"] == device_limit - 100
        # TTS quota untouched
        assert data["tts"]["used"] == 0

    def test_min_with_ip_quota(self, device_client, monkeypatch):
        """IP quota exhaustion (antibot) drives remaining to 0."""
        monkeypatch.setattr(translate_quotas["ip"], "max_chars_per_day", 150)

        with patch("proxy.main.translate_word", return_value=("тест", "en")):
            # 2 x 100 = 200 > 150 IP limit: first passes, second is rejected
            resp = device_client.post("/translate", json={"word": "a" * 100})
            assert resp.status_code == 200
            resp = device_client.post("/translate", json={"word": "b" * 100})
            assert resp.status_code == 429

        resp = device_client.get("/quota")
        data = resp.json()
        # Device quota has 400 left, but IP quota only 50 -> min is 50.
        # used = limit - remaining (reflects the effective min, not raw usage)
        assert data["translate"]["remaining"] == 50
        assert data["translate"]["used"] == 450

    def test_anon_quota_without_device_id(self, client):
        """Without a device ID the anon limit applies."""
        resp = client.get("/quota")

        assert resp.status_code == 200
        data = resp.json()
        anon_limit = translate_quotas["anon"].max_chars_per_day
        assert data["translate"]["limit"] == anon_limit
        assert data["translate"]["remaining"] == anon_limit

    def test_requires_token(self, client):
        """GET /quota is protected by the token middleware."""
        from proxy.security.token_auth import AppTokenAuth

        with patch.object(AppTokenAuth, "is_valid", return_value=False):
            resp = client.get("/quota", headers={"X-App-Token": "wrong"})

        assert resp.status_code == 403
        assert resp.json()["error"] == "unauthorized"

    def test_blank_device_id_treated_as_anonymous(self, client):
        """Whitespace-only X-Device-Id falls back to the anon quota."""
        resp = client.get("/quota", headers={"X-Device-Id": "   "})

        assert resp.status_code == 200
        data = resp.json()
        anon_limit = translate_quotas["anon"].max_chars_per_day
        assert data["translate"]["limit"] == anon_limit


class TestCacheFlags:
    """Tests for cache indicators in /translate and /tts responses."""

    def test_translate_fresh_response_not_cached(self, client):
        """Fresh translation reports cached: false."""
        with patch("proxy.main.translate_word", return_value=("тест", "en")):
            resp = client.post("/translate", json={"word": "hello"})

        assert resp.status_code == 200
        assert resp.json()["cached"] is False

    def test_translate_cache_hit_reports_cached(self, client):
        """Repeated translation of the same word reports cached: true."""
        translation_cache.set("auto:ru:hello", "тест")

        with patch("proxy.main.translate_word") as mock_translate:
            resp = client.post("/translate", json={"word": "hello"})

        assert resp.status_code == 200
        assert resp.json()["cached"] is True
        mock_translate.assert_not_called()

    def test_tts_cache_hit_sets_x_cached_header(self, client):
        """Repeated TTS of the same text returns X-Cached: 1."""
        speech_cache.set("hello", "en", b"audio")

        with patch("proxy.main.synthesize_speech") as mock_synth:
            resp = client.post("/tts", json={"text": "hello", "lang": "en"})

        assert resp.status_code == 200
        assert resp.headers.get("X-Cached") == "1"
        mock_synth.assert_not_called()
