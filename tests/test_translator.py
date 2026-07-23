"""Tests for translator module."""

import pytest
import os
import httpx
from unittest.mock import patch, MagicMock
from fastapi import HTTPException
from proxy.services.translator import (
    translate_word,
    _translate_sync,
    _get_language_name,
    get_supported_languages,
    get_api_language_names,
)
from proxy.services.cache import translation_cache


@pytest.fixture(autouse=True)
def clear_cache_and_env():
    """Clear translation cache and API env vars before and after each test."""
    # Clear cache
    translation_cache.clear()
    # Save and clear env vars
    saved_key = os.environ.pop("YANDEX_API_KEY", None)
    saved_folder = os.environ.pop("YANDEX_FOLDER_ID", None)
    yield
    # Restore env vars
    if saved_key:
        os.environ["YANDEX_API_KEY"] = saved_key
    if saved_folder:
        os.environ["YANDEX_FOLDER_ID"] = saved_folder
    # Clear cache again
    translation_cache.clear()


class TestTranslateSync:
    """Tests for synchronous translation function."""

    def test_cache_hit(self):
        """Returns cached translation without API call."""
        # Cache key format: "{source}:{target}:{word}"
        translation_cache.set("en:ru:cached_word", "кэшированный перевод")

        result, detected, debug = _translate_sync("cached_word")

        assert result == "кэшированный перевод"
        assert detected is None  # None means "from cache, no detected language"
        assert debug == ""  # Empty debug means cache hit

    def test_cache_hit_with_custom_target(self):
        """Cache works with non-default target language."""
        translation_cache.set("en:de:cached_word", "Kacheladen")

        result, detected, debug = _translate_sync("cached_word", target_language="de")

        assert result == "Kacheladen"
        assert detected is None
        assert debug == ""

    def test_api_key_missing(self):
        """Returns error when API key is missing."""
        # Patch API_KEY to None to simulate missing key
        with patch("proxy.services.translator.API_KEY", None):
            result, detected, debug = _translate_sync("word_no_key_test_xyz")

            assert result is None
            assert detected is None
            assert "API_KEY" in debug

    def test_api_error_401_raises_http_exception(self):
        """401/403 errors raise HTTPException(500)."""
        with patch("proxy.services.translator.API_KEY", "fake_key"), \
             patch("proxy.services.translator.FOLDER_ID", "fake_folder"):

            mock_response = MagicMock()
            mock_response.status_code = 401
            mock_response.text = "Unauthorized"

            http_error = httpx.HTTPStatusError(
                "Unauthorized", request=MagicMock(), response=mock_response
            )
            mock_response.raise_for_status.side_effect = http_error

            with patch("proxy.services.translator.httpx.Client") as mock_client_class:
                mock_client = MagicMock()
                mock_client_class.return_value.__enter__.return_value = mock_client
                mock_client.post.return_value = mock_response

                with pytest.raises(HTTPException) as exc_info:
                    _translate_sync("test_word")

                assert exc_info.value.status_code == 500
                assert "API key" in exc_info.value.detail

    def test_api_error_500_returns_debug_string(self):
        """Non-401/403 HTTP errors return debug string instead of raising."""
        with patch("proxy.services.translator.API_KEY", "fake_key"), \
             patch("proxy.services.translator.FOLDER_ID", "fake_folder"):

            mock_response = MagicMock()
            mock_response.status_code = 500
            mock_response.text = "Internal Server Error"

            http_error = httpx.HTTPStatusError(
                "Server Error", request=MagicMock(), response=mock_response
            )
            mock_response.raise_for_status.side_effect = http_error

            with patch("proxy.services.translator.httpx.Client") as mock_client_class:
                mock_client = MagicMock()
                mock_client_class.return_value.__enter__.return_value = mock_client
                mock_client.post.return_value = mock_response

                result, detected, debug = _translate_sync("test_word")

                assert result is None
                assert detected is None
                assert "500" in debug

    def test_empty_api_response(self):
        """Handles empty API response."""
        with patch("proxy.services.translator.API_KEY", "fake_key"), \
             patch("proxy.services.translator.FOLDER_ID", "fake_folder"):

            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.text = '{"translations": []}'
            mock_response.json.return_value = {"translations": []}
            mock_response.raise_for_status.return_value = None

            with patch("proxy.services.translator.httpx.Client") as mock_client_class:
                mock_client = MagicMock()
                mock_client_class.return_value.__enter__.return_value = mock_client
                mock_client.post.return_value = mock_response

                result, detected, debug = _translate_sync("test_word")

                assert result is None
                assert detected is None
                assert "Пустой" in debug or "empty" in debug.lower() or "translations" in debug

    def test_successful_api_response(self):
        """Handles successful API response."""
        with patch("proxy.services.translator.API_KEY", "fake_key"), \
             patch("proxy.services.translator.FOLDER_ID", "fake_folder"):

            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.text = '{"translations": [{"text": "тест", "detectedLanguageCode": "en"}]}'
            mock_response.json.return_value = {
                "translations": [{"text": "тест", "detectedLanguageCode": "en"}]
            }
            mock_response.raise_for_status.return_value = None

            with patch("proxy.services.translator.httpx.Client") as mock_client_class:
                mock_client = MagicMock()
                mock_client_class.return_value.__enter__.return_value = mock_client
                mock_client.post.return_value = mock_response

                result, detected, debug = _translate_sync("test")

                assert result == "тест"
                assert detected == "en"
                assert debug == ""

    def test_successful_api_response_with_custom_target(self):
        """Sends targetLanguageCode in API request when target_language is set."""
        with patch("proxy.services.translator.API_KEY", "fake_key"), \
             patch("proxy.services.translator.FOLDER_ID", "fake_folder"):

            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.text = '{"translations": [{"text": "Hallo", "detectedLanguageCode": "en"}]}'
            mock_response.json.return_value = {
                "translations": [{"text": "Hallo", "detectedLanguageCode": "en"}]
            }
            mock_response.raise_for_status.return_value = None

            with patch("proxy.services.translator.httpx.Client") as mock_client_class:
                mock_client = MagicMock()
                mock_client_class.return_value.__enter__.return_value = mock_client
                mock_client.post.return_value = mock_response

                result, detected, debug = _translate_sync("hello", target_language="de")

                assert result == "Hallo"
                assert detected == "en"
                assert debug == ""
                # Verify the API call used the custom target language
                call_args = mock_client.post.call_args
                payload = call_args.kwargs["json"]
                assert payload["targetLanguageCode"] == "de"

    def test_auto_source_language_no_source_code_in_payload(self):
        """Auto-detect mode does not send sourceLanguageCode in API request."""
        with patch("proxy.services.translator.API_KEY", "fake_key"), \
             patch("proxy.services.translator.FOLDER_ID", "fake_folder"):

            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.text = '{"translations": [{"text": "тест", "detectedLanguageCode": "fr"}]}'
            mock_response.json.return_value = {
                "translations": [{"text": "тест", "detectedLanguageCode": "fr"}]
            }
            mock_response.raise_for_status.return_value = None

            with patch("proxy.services.translator.httpx.Client") as mock_client_class:
                mock_client = MagicMock()
                mock_client_class.return_value.__enter__.return_value = mock_client
                mock_client.post.return_value = mock_response

                result, detected, debug = _translate_sync("test", source_language="auto")

                assert result == "тест"
                assert detected == "fr"
                # Verify the API call did NOT include sourceLanguageCode
                call_args = mock_client.post.call_args
                payload = call_args.kwargs["json"]
                assert "sourceLanguageCode" not in payload

    def test_explicit_source_language_includes_source_code_in_payload(self):
        """Explicit source language sends sourceLanguageCode in API request."""
        with patch("proxy.services.translator.API_KEY", "fake_key"), \
             patch("proxy.services.translator.FOLDER_ID", "fake_folder"):

            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.text = '{"translations": [{"text": "тест", "detectedLanguageCode": "en"}]}'
            mock_response.json.return_value = {
                "translations": [{"text": "тест", "detectedLanguageCode": "en"}]
            }
            mock_response.raise_for_status.return_value = None

            with patch("proxy.services.translator.httpx.Client") as mock_client_class:
                mock_client = MagicMock()
                mock_client_class.return_value.__enter__.return_value = mock_client
                mock_client.post.return_value = mock_response

                result, detected, debug = _translate_sync("test", source_language="en")

                assert result == "тест"
                assert detected == "en"
                call_args = mock_client.post.call_args
                payload = call_args.kwargs["json"]
                assert payload["sourceLanguageCode"] == "en"

    def test_saves_to_cache(self):
        """Saves successful translation to cache."""
        with patch("proxy.services.translator.API_KEY", "fake_key"), \
             patch("proxy.services.translator.FOLDER_ID", "fake_folder"):

            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.text = '{"translations": [{"text": "кэш тест", "detectedLanguageCode": "en"}]}'
            mock_response.json.return_value = {
                "translations": [{"text": "кэш тест", "detectedLanguageCode": "en"}]
            }
            mock_response.raise_for_status.return_value = None

            with patch("proxy.services.translator.httpx.Client") as mock_client_class:
                mock_client = MagicMock()
                mock_client_class.return_value.__enter__.return_value = mock_client
                mock_client.post.return_value = mock_response

                _translate_sync("cache_test_word")

                # Verify it's in cache now (key includes source and target language)
                cached = translation_cache.get("en:ru:cache_test_word")
                assert cached == "кэш тест"

    def test_saves_to_cache_with_custom_target(self):
        """Cache key includes target language for non-default target."""
        with patch("proxy.services.translator.API_KEY", "fake_key"), \
             patch("proxy.services.translator.FOLDER_ID", "fake_folder"):

            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.text = '{"translations": [{"text": "Hallo", "detectedLanguageCode": "en"}]}'
            mock_response.json.return_value = {
                "translations": [{"text": "Hallo", "detectedLanguageCode": "en"}]
            }
            mock_response.raise_for_status.return_value = None

            with patch("proxy.services.translator.httpx.Client") as mock_client_class:
                mock_client = MagicMock()
                mock_client_class.return_value.__enter__.return_value = mock_client
                mock_client.post.return_value = mock_response

                _translate_sync("cache_test_word_de", target_language="de")

                cached = translation_cache.get("en:de:cache_test_word_de")
                assert cached == "Hallo"

    def test_network_error(self):
        """Handles network errors."""
        with patch("proxy.services.translator.API_KEY", "fake_key"), \
             patch("proxy.services.translator.FOLDER_ID", "fake_folder"):

            import httpx

            with patch("proxy.services.translator.httpx.Client") as mock_client_class:
                mock_client = MagicMock()
                mock_client_class.return_value.__enter__.return_value = mock_client
                mock_client.post.side_effect = httpx.RequestError("Network error")

                result, detected, debug = _translate_sync("test_word")

                assert result is None
                assert detected is None
                assert "Network" in debug or "network" in debug or "сеть" in debug.lower()

    def test_json_parse_error(self):
        """Handles JSON parse errors."""
        with patch("proxy.services.translator.API_KEY", "fake_key"), \
             patch("proxy.services.translator.FOLDER_ID", "fake_folder"):

            import json

            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.text = "not json"
            mock_response.json.side_effect = json.JSONDecodeError("Invalid JSON", "not json", 0)
            mock_response.raise_for_status.return_value = None

            with patch("proxy.services.translator.httpx.Client") as mock_client_class:
                mock_client = MagicMock()
                mock_client_class.return_value.__enter__.return_value = mock_client
                mock_client.post.return_value = mock_response

                result, detected, debug = _translate_sync("test_word")

                assert result is None
                assert detected is None
                assert "парсин" in debug.lower() or "parse" in debug.lower()


class TestGetLanguageName:
    """Tests for _get_language_name helper."""

    def test_known_language(self):
        """Returns English name for known language code."""
        assert _get_language_name("en") == "English"

    def test_unknown_language_falls_back_to_code(self):
        """Returns the code itself for unknown language."""
        assert _get_language_name("xx") == "xx"


class TestGetSupportedLanguages:
    """Tests for get_supported_languages function."""

    def test_no_api_key_returns_empty(self):
        """Returns empty dict when API key is missing."""
        with patch("proxy.services.translator.API_KEY", None):
            result = get_supported_languages()
            assert result == {}

    def test_successful_response(self):
        """Returns dict mapping language codes to [TARGET_LANG]."""
        with patch("proxy.services.translator.API_KEY", "fake_key"):
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.json.return_value = {
                "languages": [
                    {"code": "en", "name": "English"},
                    {"code": "de", "name": "German"},
                    {"code": "fr", "name": "French"},
                ]
            }
            mock_response.raise_for_status.return_value = None

            with patch("proxy.services.translator.httpx.Client") as mock_client_class:
                mock_client = MagicMock()
                mock_client_class.return_value.__enter__.return_value = mock_client
                mock_client.post.return_value = mock_response

                result = get_supported_languages()

                assert result == {"en": ["ru"], "de": ["ru"], "fr": ["ru"]}

    def test_api_error_returns_empty(self):
        """Returns empty dict on HTTP error status."""
        with patch("proxy.services.translator.API_KEY", "fake_key"):
            mock_response = MagicMock()
            mock_response.status_code = 403

            with patch("proxy.services.translator.httpx.Client") as mock_client_class:
                mock_client = MagicMock()
                mock_client_class.return_value.__enter__.return_value = mock_client
                mock_client.post.return_value = mock_response

                result = get_supported_languages()

                assert result == {}

    def test_network_error_returns_empty(self):
        """Returns empty dict on network error."""
        with patch("proxy.services.translator.API_KEY", "fake_key"):
            with patch("proxy.services.translator.httpx.Client") as mock_client_class:
                mock_client = MagicMock()
                mock_client_class.return_value.__enter__.return_value = mock_client
                mock_client.post.side_effect = httpx.RequestError("Network error")

                result = get_supported_languages()

                assert result == {}

    def test_language_without_code_is_skipped(self):
        """Languages without 'code' field are skipped."""
        with patch("proxy.services.translator.API_KEY", "fake_key"):
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.json.return_value = {
                "languages": [
                    {"code": "en", "name": "English"},
                    {"name": "Unknown"},  # no code
                    {"code": "de", "name": "German"},
                ]
            }
            mock_response.raise_for_status.return_value = None

            with patch("proxy.services.translator.httpx.Client") as mock_client_class:
                mock_client = MagicMock()
                mock_client_class.return_value.__enter__.return_value = mock_client
                mock_client.post.return_value = mock_response

                result = get_supported_languages()

                assert result == {"en": ["ru"], "de": ["ru"]}

    def test_empty_languages_list_returns_empty(self):
        """Returns empty dict when API returns no languages."""
        with patch("proxy.services.translator.API_KEY", "fake_key"):
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.json.return_value = {"languages": []}
            mock_response.raise_for_status.return_value = None

            with patch("proxy.services.translator.httpx.Client") as mock_client_class:
                mock_client = MagicMock()
                mock_client_class.return_value.__enter__.return_value = mock_client
                mock_client.post.return_value = mock_response

                result = get_supported_languages()

                assert result == {}


class TestGetApiLanguageNames:
    """Tests for get_api_language_names function."""

    def test_no_api_key_returns_empty(self):
        """Returns empty dict when API key is missing."""
        with patch("proxy.services.translator.API_KEY", None):
            result = get_api_language_names()
            assert result == {}

    def test_successful_response(self):
        """Returns dict mapping language codes to English names."""
        with patch("proxy.services.translator.API_KEY", "fake_key"):
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.json.return_value = {
                "languages": [
                    {"code": "en", "name": "English"},
                    {"code": "de", "name": "German"},
                    {"code": "fr", "name": "French"},
                ]
            }
            mock_response.raise_for_status.return_value = None

            with patch("proxy.services.translator.httpx.Client") as mock_client_class:
                mock_client = MagicMock()
                mock_client_class.return_value.__enter__.return_value = mock_client
                mock_client.post.return_value = mock_response

                result = get_api_language_names()

                assert result == {"en": "English", "de": "German", "fr": "French"}

    def test_api_error_returns_empty(self):
        """Returns empty dict on HTTP error status."""
        with patch("proxy.services.translator.API_KEY", "fake_key"):
            mock_response = MagicMock()
            mock_response.status_code = 403

            with patch("proxy.services.translator.httpx.Client") as mock_client_class:
                mock_client = MagicMock()
                mock_client_class.return_value.__enter__.return_value = mock_client
                mock_client.post.return_value = mock_response

                result = get_api_language_names()

                assert result == {}

    def test_network_error_returns_empty(self):
        """Returns empty dict on network error."""
        with patch("proxy.services.translator.API_KEY", "fake_key"):
            with patch("proxy.services.translator.httpx.Client") as mock_client_class:
                mock_client = MagicMock()
                mock_client_class.return_value.__enter__.return_value = mock_client
                mock_client.post.side_effect = httpx.RequestError("Network error")

                result = get_api_language_names()

                assert result == {}

    def test_language_without_name_is_skipped(self):
        """Languages without 'name' field are skipped."""
        with patch("proxy.services.translator.API_KEY", "fake_key"):
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.json.return_value = {
                "languages": [
                    {"code": "en", "name": "English"},
                    {"code": "xx"},  # no name
                    {"code": "de", "name": "German"},
                ]
            }
            mock_response.raise_for_status.return_value = None

            with patch("proxy.services.translator.httpx.Client") as mock_client_class:
                mock_client = MagicMock()
                mock_client_class.return_value.__enter__.return_value = mock_client
                mock_client.post.return_value = mock_response

                result = get_api_language_names()

                assert result == {"en": "English", "de": "German"}

    def test_empty_languages_list_returns_empty(self):
        """Returns empty dict when API returns no languages."""
        with patch("proxy.services.translator.API_KEY", "fake_key"):
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.json.return_value = {"languages": []}
            mock_response.raise_for_status.return_value = None

            with patch("proxy.services.translator.httpx.Client") as mock_client_class:
                mock_client = MagicMock()
                mock_client_class.return_value.__enter__.return_value = mock_client
                mock_client.post.return_value = mock_response

                result = get_api_language_names()

                assert result == {}


class TestTranslateWord:
    """Tests for async translate_word function."""

    @pytest.mark.anyio
    async def test_translate_word_calls_sync(self):
        """Async function calls sync version with source and target language."""
        with patch("proxy.services.translator._translate_sync") as mock_sync:
            mock_sync.return_value = ("тест", "en", "")

            result, detected = await translate_word("hello", "en")

            assert result == "тест"
            assert detected == "en"
            mock_sync.assert_called_once_with("hello", "en", "ru")

    @pytest.mark.anyio
    async def test_translate_word_default_source(self):
        """Async function uses default source language 'en' and target 'ru'."""
        with patch("proxy.services.translator._translate_sync") as mock_sync:
            mock_sync.return_value = ("тест", "en", "")

            result, detected = await translate_word("hello")

            assert result == "тест"
            assert detected == "en"
            mock_sync.assert_called_once_with("hello", "en", "ru")

    @pytest.mark.anyio
    async def test_translate_word_custom_target(self):
        """Async function passes custom target language to sync version."""
        with patch("proxy.services.translator._translate_sync") as mock_sync:
            mock_sync.return_value = ("Hallo", "en", "")

            result, detected = await translate_word("hello", "en", "de")

            assert result == "Hallo"
            assert detected == "en"
            mock_sync.assert_called_once_with("hello", "en", "de")

    @pytest.mark.anyio
    async def test_translate_word_none_result(self):
        """Async function handles None result."""
        with patch("proxy.services.translator._translate_sync") as mock_sync:
            mock_sync.return_value = (None, None, "error")

            result, detected = await translate_word("unknown")

            assert result is None
            assert detected is None

    @pytest.mark.anyio
    async def test_translate_word_uses_cache(self):
        """Async function benefits from cache."""
        # Cache key format: "{source}:{target}:{word}"
        translation_cache.set("en:ru:cached", "из кэша")

        result, detected = await translate_word("cached")

        assert result == "из кэша"
        assert detected is None  # Cache hits have no detected language

    @pytest.mark.anyio
    async def test_translate_word_auto_source(self):
        """Async function works with auto source language."""
        with patch("proxy.services.translator._translate_sync") as mock_sync:
            mock_sync.return_value = ("тест", "fr", "")

            result, detected = await translate_word("bonjour", "auto")

            assert result == "тест"
            assert detected == "fr"
            mock_sync.assert_called_once_with("bonjour", "auto", "ru")


class TestTranslationCache:
    """Tests specifically for translation cache integration."""

    def test_translation_cache_integration(self):
        """Cache works correctly with translation workflow."""
        # First call - not in cache
        translation_cache.set("word", "перевод")

        # Second call - should be in cache
        assert translation_cache.get("word") == "перевод"

        # Test TTL works with short-lived cache entry
        import time
        from proxy.services.cache import TranslationCache

        # Create a short-lived cache for testing
        short_cache = TranslationCache(ttl_seconds=1)
        short_cache.set("temp", "временный")
        time.sleep(1.1)
        assert short_cache.get("temp") is None
