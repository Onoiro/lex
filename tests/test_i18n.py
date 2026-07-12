"""Tests for the i18n module."""

import pytest

from i18n import (
    _TRANSLATIONS_CACHE,
    _current_locale,
    _load_translations,
    _t,
    get_supported_locales,
    set_api_language_names,
    set_locale,
)


@pytest.fixture(autouse=True)
def reset_i18n_state():
    """Reset i18n module state before each test."""
    _TRANSLATIONS_CACHE.clear()
    _current_locale["en"] = "en"
    set_api_language_names({})
    yield
    _TRANSLATIONS_CACHE.clear()
    _current_locale["en"] = "en"
    set_api_language_names({})


class TestLoadTranslations:
    """Tests for _load_translations."""

    def test_load_existing_locale(self):
        """Loading an existing locale returns translations dict."""
        result = _load_translations("en")
        assert isinstance(result, dict)
        assert len(result) > 0

    def test_load_caches_result(self):
        """Second call returns the same cached object."""
        first = _load_translations("en")
        second = _load_translations("en")
        assert first is second

    def test_load_missing_locale_returns_empty_dict(self):
        """Loading a locale without a translation file returns empty dict."""
        result = _load_translations("fr")
        assert result == {}


class TestSetLocale:
    """Tests for set_locale."""

    def test_set_valid_locale(self):
        """Setting a valid locale updates current locale."""
        set_locale("ru")
        assert _current_locale["en"] == "ru"

    def test_set_invalid_locale_falls_back_to_en(self):
        """Setting an unsupported locale falls back to 'en'."""
        set_locale("invalid")
        assert _current_locale["en"] == "en"


class TestTranslate:
    """Tests for _t function."""

    def test_translate_existing_key(self):
        """Translating an existing key returns the translated value."""
        result = _t("nav.home")
        assert result == "Lex"

    def test_translate_with_kwargs(self):
        """Translating with kwargs applies string formatting."""
        result = _t("review.queue", total_due=5)
        assert "5" in result

    def test_translate_fallback_to_english(self):
        """Key missing in current locale but present in English falls back to English."""
        _TRANSLATIONS_CACHE["ru"] = {}
        _TRANSLATIONS_CACHE["en"] = {"test.key": "English value"}
        set_locale("ru")
        result = _t("test.key")
        assert result == "English value"

    def test_translate_fallback_to_key(self):
        """Key not found in any locale returns the key itself."""
        result = _t("nonexistent.key")
        assert result == "nonexistent.key"

    def test_translate_format_error_returns_raw_value(self):
        """Formatting error (missing placeholder) returns raw value."""
        _TRANSLATIONS_CACHE["en"] = {"test.key": "Hello {name}"}
        set_locale("en")
        result = _t("test.key", wrong_kw="value")
        assert result == "Hello {name}"


class TestGetSupportedLocales:
    """Tests for get_supported_locales."""

    def test_returns_supported_locales(self):
        """Returns the list of supported locale codes."""
        result = get_supported_locales()
        assert result == ["en", "ru"]


class TestApiLanguageNamesCache:
    """Tests for API language names cache."""

    def test_set_and_get_api_language_names(self):
        """Setting and getting API language names cache."""
        names = {"en": "English", "ru": "Russian"}
        set_api_language_names(names)
        from i18n import _get_api_language_names
        assert _get_api_language_names() == names

    def test_get_api_language_names_default_empty(self):
        """Default API language names cache is empty."""
        from i18n import _get_api_language_names

        assert _get_api_language_names() == {}
