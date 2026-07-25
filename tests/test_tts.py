"""Tests for TTS (text-to-speech) module and endpoint."""

import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

from proxy.services.tts import (
    synthesize_speech,
    _synthesize_sync,
    map_language,
    LANG_MAP,
    speech_cache,
)
from proxy.main import app, tts_limiter


@pytest.fixture(autouse=True)
def reset_tts_state():
    """Clear TTS cache and rate limiter before and after each test."""
    speech_cache.clear()
    tts_limiter._requests.clear()
    yield
    speech_cache.clear()
    tts_limiter._requests.clear()


class TestLanguageMapping:
    """Tests for Translate → SpeechKit language code mapping."""

    def test_known_codes(self):
        assert map_language("en") == "en-US"
        assert map_language("ru") == "ru-RU"
        assert map_language("de") == "de-DE"
        assert map_language("fr") == "fr-FR"

    def test_unknown_code_fallback(self):
        assert map_language("xx") == "xx"

    def test_empty_code(self):
        assert map_language("") == ""

    def test_all_mapped_codes_have_speechkit_format(self):
        """All mapped codes should contain a region qualifier (dash)."""
        for code, mapped in LANG_MAP.items():
            if code != "eo":  # Esperanto has no region
                assert "-" in mapped, f"Missing region in mapping for {code}: {mapped}"


class TestSpeechCache:
    """Tests for the speech audio cache."""

    def test_set_and_get(self):
        speech_cache.set("hello", "en", b"mp3data")
        assert speech_cache.get("hello", "en") == b"mp3data"

    def test_get_missing(self):
        assert speech_cache.get("nonexistent", "en") is None

    def test_different_lang_different_entry(self):
        speech_cache.set("hello", "en", b"english_audio")
        speech_cache.set("hello", "ru", b"russian_audio")
        assert speech_cache.get("hello", "en") == b"english_audio"
        assert speech_cache.get("hello", "ru") == b"russian_audio"

    def test_clear(self):
        speech_cache.set("hello", "en", b"mp3data")
        speech_cache.clear()
        assert speech_cache.size() == 0
        assert speech_cache.get("hello", "en") is None

    def test_size(self):
        assert speech_cache.size() == 0
        speech_cache.set("hello", "en", b"mp3data")
        assert speech_cache.size() == 1


class TestSynthesizeSync:
    """Tests for _synthesize_sync function."""

    @patch("proxy.services.tts.API_KEY", None)
    def test_no_api_key_returns_none(self):
        assert _synthesize_sync("hello", "en") is None

    @patch("proxy.services.tts.API_KEY", "test-key")
    @patch("proxy.services.tts.httpx.Client")
    def test_successful_synthesis(self, mock_client_cls):
        mock_response = MagicMock()
        mock_response.content = b"fake_mp3_audio"
        mock_response.raise_for_status = MagicMock()
        mock_client = MagicMock()
        mock_client.__enter__ = MagicMock(return_value=mock_client)
        mock_client.__exit__ = MagicMock(return_value=False)
        mock_client.post = MagicMock(return_value=mock_response)
        mock_client_cls.return_value = mock_client

        result = _synthesize_sync("hello", "en")
        assert result == b"fake_mp3_audio"

        # Verify request params
        mock_client.post.assert_called_once()
        call_args = mock_client.post.call_args
        assert call_args.kwargs["data"]["text"] == "hello"
        assert call_args.kwargs["data"]["lang"] == "en-US"
        assert call_args.kwargs["data"]["format"] == "mp3"
        assert call_args.kwargs["headers"]["Authorization"] == "Api-Key test-key"

    @patch("proxy.services.tts.API_KEY", "test-key")
    @patch("proxy.services.tts.httpx.Client")
    def test_caching(self, mock_client_cls):
        mock_response = MagicMock()
        mock_response.content = b"cached_audio"
        mock_response.raise_for_status = MagicMock()
        mock_client = MagicMock()
        mock_client.__enter__ = MagicMock(return_value=mock_client)
        mock_client.__exit__ = MagicMock(return_value=False)
        mock_client.post = MagicMock(return_value=mock_response)
        mock_client_cls.return_value = mock_client

        # First call — hits API
        result1 = _synthesize_sync("hello", "en")
        assert result1 == b"cached_audio"
        assert mock_client.post.call_count == 1

        # Second call — should use cache, no API call
        result2 = _synthesize_sync("hello", "en")
        assert result2 == b"cached_audio"
        assert mock_client.post.call_count == 1

    @patch("proxy.services.tts.API_KEY", "test-key")
    @patch("proxy.services.tts.httpx.Client")
    def test_http_error_returns_none(self, mock_client_cls):
        import httpx
        mock_response = MagicMock()
        mock_response.raise_for_status.side_effect = httpx.HTTPStatusError(
            "error", request=MagicMock(), response=MagicMock(status_code=500)
        )
        mock_client = MagicMock()
        mock_client.__enter__ = MagicMock(return_value=mock_client)
        mock_client.__exit__ = MagicMock(return_value=False)
        mock_client.post = MagicMock(return_value=mock_response)
        mock_client_cls.return_value = mock_client

        result = _synthesize_sync("hello", "en")
        assert result is None

    @patch("proxy.services.tts.API_KEY", "test-key")
    @patch("proxy.services.tts.httpx.Client")
    def test_network_error_returns_none(self, mock_client_cls):
        import httpx
        mock_client = MagicMock()
        mock_client.__enter__ = MagicMock(return_value=mock_client)
        mock_client.__exit__ = MagicMock(return_value=False)
        mock_client.post.side_effect = httpx.RequestError("network error")
        mock_client_cls.return_value = mock_client

        result = _synthesize_sync("hello", "en")
        assert result is None


class TestSynthesizeAsync:
    """Tests for async synthesize_speech function."""

    @pytest.mark.asyncio
    @patch("proxy.services.tts.API_KEY", None)
    async def test_returns_none_without_api_key(self):
        result = await synthesize_speech("hello", "en")
        assert result is None


class TestTtsEndpoint:
    """Tests for POST /tts endpoint via TestClient."""

    def test_empty_text_returns_400(self):
        client = TestClient(app)
        response = client.post("/tts", json={"text": "", "lang": "en"})
        assert response.status_code == 400

    def test_whitespace_text_returns_400(self):
        client = TestClient(app)
        response = client.post("/tts", json={"text": "   ", "lang": "en"})
        assert response.status_code == 400

    @patch("proxy.services.tts._synthesize_sync")
    def test_successful_response(self, mock_synthesize):
        mock_synthesize.return_value = b"fake_mp3_audio"
        client = TestClient(app)
        response = client.post("/tts", json={"text": "hello", "lang": "en"})
        assert response.status_code == 200
        assert response.content == b"fake_mp3_audio"
        assert response.headers["content-type"] == "audio/mpeg"
        assert "cache-control" in response.headers

    @patch("proxy.services.tts._synthesize_sync")
    def test_synthesis_failure_returns_502(self, mock_synthesize):
        mock_synthesize.return_value = None
        client = TestClient(app)
        response = client.post("/tts", json={"text": "hello", "lang": "en"})
        assert response.status_code == 502

    @patch("proxy.services.tts._synthesize_sync")
    def test_rate_limiting(self, mock_synthesize):
        mock_synthesize.return_value = b"fake_mp3_audio"
        client = TestClient(app)
        # Make 30 successful requests (the limit)
        for _ in range(30):
            resp = client.post("/tts", json={"text": "hello", "lang": "en"})
            assert resp.status_code == 200
        # 31st should be rate limited
        resp = client.post("/tts", json={"text": "hello", "lang": "en"})
        assert resp.status_code == 429
