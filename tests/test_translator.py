"""Tests for translator module."""

import pytest
import os
from unittest.mock import patch, MagicMock
from translator import translate_word, _translate_sync, translation_cache


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
        # Setup cache with source language in key
        translation_cache.set("en:cached_word", "кэшированный перевод")
        
        result, detected, debug = _translate_sync("cached_word")
        
        assert result == "кэшированный перевод"
        assert detected is None  # None means "from cache, no detected language"
        assert debug == ""  # Empty debug means cache hit

    def test_api_key_missing(self):
        """Returns error when API key is missing."""
        # Patch API_KEY to None to simulate missing key
        with patch("translator.API_KEY", None):
            result, detected, debug = _translate_sync("word_no_key_test_xyz")
            
            assert result is None
            assert detected is None
            assert "API_KEY" in debug

    def test_api_error_response(self):
        """Handles API error response."""
        with patch("translator.API_KEY", "fake_key"), \
             patch("translator.FOLDER_ID", "fake_folder"):
            
            mock_response = MagicMock()
            mock_response.status_code = 401
            mock_response.text = "Unauthorized"
            mock_response.raise_for_status.side_effect = Exception("HTTP Error")
            
            with patch("translator.httpx.Client") as mock_client_class:
                mock_client = MagicMock()
                mock_client_class.return_value.__enter__.return_value = mock_client
                mock_client.post.return_value = mock_response
                
                result, detected, debug = _translate_sync("test_word")
                
                assert result is None
                assert detected is None
                assert "HTTP" in debug or "401" in debug or "Unauthorized" in debug

    def test_empty_api_response(self):
        """Handles empty API response."""
        with patch("translator.API_KEY", "fake_key"), \
             patch("translator.FOLDER_ID", "fake_folder"):
            
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.text = '{"translations": []}'
            mock_response.json.return_value = {"translations": []}
            mock_response.raise_for_status.return_value = None
            
            with patch("translator.httpx.Client") as mock_client_class:
                mock_client = MagicMock()
                mock_client_class.return_value.__enter__.return_value = mock_client
                mock_client.post.return_value = mock_response
                
                result, detected, debug = _translate_sync("test_word")
                
                assert result is None
                assert detected is None
                assert "Пустой" in debug or "empty" in debug.lower() or "translations" in debug

    def test_successful_api_response(self):
        """Handles successful API response."""
        with patch("translator.API_KEY", "fake_key"), \
             patch("translator.FOLDER_ID", "fake_folder"):
            
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.text = '{"translations": [{"text": "тест", "detectedLanguageCode": "en"}]}'
            mock_response.json.return_value = {
                "translations": [{"text": "тест", "detectedLanguageCode": "en"}]
            }
            mock_response.raise_for_status.return_value = None
            
            with patch("translator.httpx.Client") as mock_client_class:
                mock_client = MagicMock()
                mock_client_class.return_value.__enter__.return_value = mock_client
                mock_client.post.return_value = mock_response
                
                result, detected, debug = _translate_sync("test")
                
                assert result == "тест"
                assert detected == "en"
                assert debug == ""

    def test_saves_to_cache(self):
        """Saves successful translation to cache."""
        with patch("translator.API_KEY", "fake_key"), \
             patch("translator.FOLDER_ID", "fake_folder"):
            
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.text = '{"translations": [{"text": "кэш тест", "detectedLanguageCode": "en"}]}'
            mock_response.json.return_value = {
                "translations": [{"text": "кэш тест", "detectedLanguageCode": "en"}]
            }
            mock_response.raise_for_status.return_value = None
            
            with patch("translator.httpx.Client") as mock_client_class:
                mock_client = MagicMock()
                mock_client_class.return_value.__enter__.return_value = mock_client
                mock_client.post.return_value = mock_response
                
                _translate_sync("cache_test_word")
                
                # Verify it's in cache now (key includes source language)
                cached = translation_cache.get("en:cache_test_word")
                assert cached == "кэш тест"

    def test_network_error(self):
        """Handles network errors."""
        with patch("translator.API_KEY", "fake_key"), \
             patch("translator.FOLDER_ID", "fake_folder"):
            
            import httpx
            
            with patch("translator.httpx.Client") as mock_client_class:
                mock_client = MagicMock()
                mock_client_class.return_value.__enter__.return_value = mock_client
                mock_client.post.side_effect = httpx.RequestError("Network error")
                
                result, detected, debug = _translate_sync("test_word")
                
                assert result is None
                assert detected is None
                assert "Network" in debug or "network" in debug or "сеть" in debug.lower()

    def test_json_parse_error(self):
        """Handles JSON parse errors."""
        with patch("translator.API_KEY", "fake_key"), \
             patch("translator.FOLDER_ID", "fake_folder"):
            
            import json
            
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.text = "not json"
            mock_response.json.side_effect = json.JSONDecodeError("Invalid JSON", "not json", 0)
            mock_response.raise_for_status.return_value = None
            
            with patch("translator.httpx.Client") as mock_client_class:
                mock_client = MagicMock()
                mock_client_class.return_value.__enter__.return_value = mock_client
                mock_client.post.return_value = mock_response
                
                result, detected, debug = _translate_sync("test_word")
                
                assert result is None
                assert detected is None
                assert "парсин" in debug.lower() or "parse" in debug.lower()


class TestTranslateWord:
    """Tests for async translate_word function."""

    @pytest.mark.anyio
    async def test_translate_word_calls_sync(self):
        """Async function calls sync version with source language."""
        with patch("translator._translate_sync") as mock_sync:
            mock_sync.return_value = ("тест", "en", "")
            
            result, detected = await translate_word("hello", "en")
            
            assert result == "тест"
            assert detected == "en"
            mock_sync.assert_called_once_with("hello", "en")

    @pytest.mark.anyio
    async def test_translate_word_default_source(self):
        """Async function uses default source language 'en'."""
        with patch("translator._translate_sync") as mock_sync:
            mock_sync.return_value = ("тест", "en", "")
            
            result, detected = await translate_word("hello")
            
            assert result == "тест"
            assert detected == "en"
            mock_sync.assert_called_once_with("hello", "en")

    @pytest.mark.anyio
    async def test_translate_word_none_result(self):
        """Async function handles None result."""
        with patch("translator._translate_sync") as mock_sync:
            mock_sync.return_value = (None, None, "error")
            
            result, detected = await translate_word("unknown")
            
            assert result is None
            assert detected is None

    @pytest.mark.anyio
    async def test_translate_word_uses_cache(self):
        """Async function benefits from cache."""
        # Pre-populate cache with source language in key
        translation_cache.set("en:cached", "из кэша")
        
        result, detected = await translate_word("cached")
        
        assert result == "из кэша"
        assert detected is None  # Cache hits have no detected language


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
        from cache import TranslationCache
        
        # Create a short-lived cache for testing
        short_cache = TranslationCache(ttl_seconds=1)
        short_cache.set("temp", "временный")
        time.sleep(1.1)
        assert short_cache.get("temp") is None