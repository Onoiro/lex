"""Business services: translation and caching."""

from services.translator import (
    translate_word,
    get_supported_languages,
    get_api_language_names,
    SUPPORTED_LANGUAGES,
)
from services.cache import translation_cache, TranslationCache

__all__ = [
    "translate_word",
    "get_supported_languages",
    "get_api_language_names",
    "SUPPORTED_LANGUAGES",
    "translation_cache",
    "TranslationCache",
]
