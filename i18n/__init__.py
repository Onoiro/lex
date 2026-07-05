"""Internationalization (i18n) support for the Lex application.

Loads translation JSON files and provides a _t() filter for Jinja2 templates.
Default locale is English. Supported locales: en, ru.
"""

import json
from pathlib import Path

from i18n.languages import (
    LANGUAGE_NAMES_EN as LANGUAGE_NAMES_EN,
    LANGUAGE_NAMES_RU as LANGUAGE_NAMES_RU,
    NATIVE_NAMES as NATIVE_NAMES,
    get_language_name as get_language_name,
)

TRANSLATIONS_DIR = Path(__file__).parent
SUPPORTED_LOCALES = ["en", "ru"]

# Cache loaded translations: {"en": {...}, "ru": {...}}
_TRANSLATIONS_CACHE: dict[str, dict] = {}


def _load_translations(locale: str) -> dict:
    """Load translation file for the given locale.
    
    Args:
        locale: Locale code (e.g. 'en', 'ru').
        
    Returns:
        Dictionary of translation key-value pairs.
    """
    if locale in _TRANSLATIONS_CACHE:
        return _TRANSLATIONS_CACHE[locale]
    
    path = TRANSLATIONS_DIR / f"{locale}.json"
    if path.exists():
        with open(path, "r", encoding="utf-8") as f:
            _TRANSLATIONS_CACHE[locale] = json.load(f)
    else:
        _TRANSLATIONS_CACHE[locale] = {}
    
    return _TRANSLATIONS_CACHE[locale]


def _get_locale() -> str:
    """Internal locale getter. Used by _t()."""
    return _current_locale.get("en", "en")


def set_locale(locale: str) -> None:
    """Set the current locale for the request context.
    
    Args:
        locale: Locale code (e.g. 'en', 'ru').
    """
    if locale not in SUPPORTED_LOCALES:
        locale = "en"
    _current_locale["en"] = locale


def _t(key: str, **kwargs) -> str:
    """Translate a key to the current locale.
    
    Falls back to English, then to the key itself if not found.
    Supports simple string formatting with **kwargs.
    
    Args:
        key: Translation key (e.g. 'nav.translate').
        **kwargs: Values for string interpolation.
        
    Returns:
        Translated string.
    """
    locale = _get_locale()
    
    # Try current locale first
    translations = _load_translations(locale)
    value = translations.get(key)
    
    # Fallback to English
    if value is None:
        en_translations = _load_translations("en")
        value = en_translations.get(key)
    
    # Fallback to key itself
    if value is None:
        return key
    
    # Apply string formatting if kwargs provided
    if kwargs:
        try:
            value = value.format(**kwargs)
        except (KeyError, IndexError, ValueError):
            pass  # Return raw value if formatting fails
    
    return value


def get_supported_locales() -> list:
    """Return list of supported locale codes."""
    return SUPPORTED_LOCALES


# --- API language names cache ---

_api_language_names_cache: dict = {}


def _get_api_language_names() -> dict:
    """Get language names from Yandex API.
    
    Returns:
        Dict mapping language codes to English names.
    """
    return _api_language_names_cache


def set_api_language_names(names: dict) -> None:
    """Set the API language names cache.
    
    Args:
        names: Dict mapping language codes to English names.
    """
    global _api_language_names_cache
    _api_language_names_cache = names


# Simple context storage for current locale
_current_locale: dict = {"en": "en"}
