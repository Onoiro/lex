"""Tests for dictionary module and endpoint."""

import json
import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

from proxy.services.dictionary import (
    lookup_word,
    _lookup_sync,
    _extract_examples,
    _clean_text,
    dictionary_cache,
)
from proxy.main import app, dictionary_limiter


@pytest.fixture(autouse=True)
def clear_cache_and_env():
    """Clear dictionary cache and rate limiter before and after each test."""
    dictionary_cache.clear()
    dictionary_limiter._requests.clear()
    yield
    dictionary_cache.clear()
    dictionary_limiter._requests.clear()


class TestCleanText:
    """Tests for _clean_text helper."""

    def test_removes_angle_bracket_tags(self):
        assert _clean_text("I'll have to be led like a <dog>, anyhow.") == "I'll have to be led like a dog, anyhow."

    def test_removes_closing_tags(self):
        assert _clean_text("Меня как <собаку> придется вести.") == "Меня как собаку придется вести."

    def test_no_tags(self):
        assert _clean_text("Plain text") == "Plain text"

    def test_empty_string(self):
        assert _clean_text("") == ""


class TestExtractExamples:
    """Tests for _extract_examples."""

    def test_typical_response(self):
        api_response = {
            "result": [
                {
                    "examples": [
                        {
                            "src": "I'll have to be led like a <dog>, anyhow.",
                            "dst": "Меня как <собаку> придется вести.",
                        }
                    ]
                }
            ]
        }
        result = _extract_examples(api_response)
        assert result == [
            {"text": "I'll have to be led like a dog, anyhow.", "translation": "Меня как собаку придется вести."}
        ]

    def test_multiple_examples(self):
        api_response = {
            "result": [
                {
                    "examples": [
                        {"src": "First <example>.", "dst": "Первый <пример>."},
                        {"src": "Second <example>.", "dst": "Второй <пример>."},
                    ]
                }
            ]
        }
        result = _extract_examples(api_response)
        assert len(result) == 2
        assert result[0]["text"] == "First example."
        assert result[1]["text"] == "Second example."

    def test_no_examples(self):
        api_response = {"result": [{"examples": []}]}
        result = _extract_examples(api_response)
        assert result == []

    def test_empty_response(self):
        result = _extract_examples({})
        assert result == []

    def test_no_translation(self):
        api_response = {
            "result": [
                {
                    "examples": [
                        {"src": "Example without dst."},
                    ]
                }
            ]
        }
        result = _extract_examples(api_response)
        assert result == [{"text": "Example without dst.", "translation": ""}]

    def test_duplicate_examples_deduplicated(self):
        api_response = {
            "result": [
                {
                    "examples": [
                        {"src": "Duplicate.", "dst": "Дубликат."},
                        {"src": "Duplicate.", "dst": "Дубликат."},
                    ]
                }
            ]
        }
        result = _extract_examples(api_response)
        assert len(result) == 1

    def test_empty_src_skipped(self):
        api_response = {
            "result": [
                {
                    "examples": [
                        {"src": "", "dst": ""},
                        {"src": "Valid.", "dst": "Валидный."},
                    ]
                }
            ]
        }
        result = _extract_examples(api_response)
        assert len(result) == 1
        assert result[0]["text"] == "Valid."


class TestLookupSync:
    """Tests for _lookup_sync function."""

    def test_cache_hit(self):
        examples = [{"text": "Cached example.", "translation": "Кэш пример."}]
        dictionary_cache.set("en-ru:cached_word", json.dumps(examples))

        result = _lookup_sync("cached_word", "en-ru")
        assert result == examples

    def test_successful_lookup(self):
        api_response = {
            "result": [
                {
                    "examples": [
                        {
                            "src": "Hello <world> example.",
                            "dst": "Пример <мира> привет.",
                        }
                    ]
                }
            ]
        }
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = api_response
        mock_response.raise_for_status.return_value = None

        with patch("proxy.services.dictionary.httpx.Client") as mock_client_cls:
            mock_client = MagicMock()
            mock_client_cls.return_value.__enter__.return_value = mock_client
            mock_client.get.return_value = mock_response

            result = _lookup_sync("hello", "en-ru")

            assert result == [
                {"text": "Hello world example.", "translation": "Пример мира привет."}
            ]
            # Verify API call params
            mock_client.get.assert_called_once_with(
                "https://dictionary.yandex.net/dicservice.json/queryCorpus",
                params={"src": "hello", "ui": "en", "lang": "en-ru", "flags": 7},
            )

    def test_saves_to_cache(self):
        api_response = {
            "result": [
                {
                    "examples": [
                        {
                            "src": "Cache <test>.",
                            "dst": "Тест <кэша>.",
                        }
                    ]
                }
            ]
        }
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = api_response
        mock_response.raise_for_status.return_value = None

        with patch("proxy.services.dictionary.httpx.Client") as mock_client_cls:
            mock_client = MagicMock()
            mock_client_cls.return_value.__enter__.return_value = mock_client
            mock_client.get.return_value = mock_response

            _lookup_sync("cache_test", "en-ru")

            # Verify it's in cache
            cached = dictionary_cache.get("en-ru:cache_test")
            assert cached is not None
            assert json.loads(cached) == [
                {"text": "Cache test.", "translation": "Тест кэша."}
            ]

    def test_caches_empty_result(self):
        api_response = {"result": []}
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = api_response
        mock_response.raise_for_status.return_value = None

        with patch("proxy.services.dictionary.httpx.Client") as mock_client_cls:
            mock_client = MagicMock()
            mock_client_cls.return_value.__enter__.return_value = mock_client
            mock_client.get.return_value = mock_response

            result = _lookup_sync("no_examples", "en-ru")
            assert result == []

            cached = dictionary_cache.get("en-ru:no_examples")
            assert cached is not None
            assert json.loads(cached) == []

    def test_http_error_returns_none(self):
        mock_response = MagicMock()
        mock_response.raise_for_status.side_effect = __import__("httpx").HTTPStatusError(
            "error", request=MagicMock(), response=MagicMock(status_code=500)
        )

        with patch("proxy.services.dictionary.httpx.Client") as mock_client_cls:
            mock_client = MagicMock()
            mock_client_cls.return_value.__enter__.return_value = mock_client
            mock_client.get.return_value = mock_response

            result = _lookup_sync("word", "en-ru")
            assert result is None

    def test_network_error_returns_none(self):
        with patch("proxy.services.dictionary.httpx.Client") as mock_client_cls:
            mock_client = MagicMock()
            mock_client_cls.return_value.__enter__.return_value = mock_client
            mock_client.get.side_effect = __import__("httpx").RequestError("network error")

            result = _lookup_sync("word", "en-ru")
            assert result is None


class TestLookupAsync:
    """Tests for async lookup_word function."""

    @pytest.mark.anyio
    async def test_calls_sync(self):
        with patch("proxy.services.dictionary._lookup_sync") as mock_sync:
            mock_sync.return_value = [{"text": "Example.", "translation": "Пример."}]

            result = await lookup_word("hello", "en-ru")

            assert result == [{"text": "Example.", "translation": "Пример."}]
            mock_sync.assert_called_once_with("hello", "en-ru")

    @pytest.mark.anyio
    async def test_returns_none(self):
        with patch("proxy.services.dictionary._lookup_sync") as mock_sync:
            mock_sync.return_value = None

            result = await lookup_word("unknown", "en-ru")
            assert result is None

    @pytest.mark.anyio
    async def test_uses_cache(self):
        examples = [{"text": "Cached.", "translation": "Кэш."}]
        dictionary_cache.set("en-ru:cached_word", json.dumps(examples))

        result = await lookup_word("cached_word", "en-ru")
        assert result == examples


class TestDictionaryEndpoint:
    """Tests for POST /dictionary endpoint via TestClient."""

    def test_successful_lookup(self):
        client = TestClient(app)
        with patch("proxy.main.lookup_word") as mock_lookup:
            mock_lookup.return_value = [
                {"text": "Example.", "translation": "Пример."}
            ]

            resp = client.post("/dictionary", json={
                "word": "hello",
                "lang_pair": "en-ru",
            })

            assert resp.status_code == 200
            data = resp.json()
            assert data["examples"] == [{"text": "Example.", "translation": "Пример."}]

    def test_empty_word_returns_400(self):
        client = TestClient(app)
        resp = client.post("/dictionary", json={"word": "  ", "lang_pair": "en-ru"})
        assert resp.status_code == 400

    def test_empty_lang_pair_returns_400(self):
        client = TestClient(app)
        resp = client.post("/dictionary", json={"word": "hello", "lang_pair": "  "})
        assert resp.status_code == 400

    def test_lookup_failure_returns_502(self):
        client = TestClient(app)
        with patch("proxy.main.lookup_word", return_value=None):
            resp = client.post("/dictionary", json={
                "word": "hello",
                "lang_pair": "en-ru",
            })
            assert resp.status_code == 502

    def test_rate_limit_exceeded(self):
        client = TestClient(app)
        with patch("proxy.main.lookup_word", return_value=[]):
            for _ in range(30):
                resp = client.post("/dictionary", json={"word": "test", "lang_pair": "en-ru"})
                assert resp.status_code == 200

            # 31st should be rate limited
            resp = client.post("/dictionary", json={"word": "test", "lang_pair": "en-ru"})
            assert resp.status_code == 429

    def test_cache_stats_endpoint(self):
        client = TestClient(app)
        resp = client.get("/dictionary/cache/stats")
        assert resp.status_code == 200
        data = resp.json()
        assert "size" in data
