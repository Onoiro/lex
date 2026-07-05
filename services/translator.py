import os
import httpx
import asyncio
from fastapi import HTTPException

from services.cache import translation_cache
from i18n.languages import LANGUAGE_NAMES_EN

API_KEY = os.getenv("YANDEX_API_KEY")
FOLDER_ID = os.getenv("YANDEX_FOLDER_ID", "b1gqq9rjega7119p3a2f")
API_URL = "https://translate.api.cloud.yandex.net/translate/v2/translate"
LANGUAGES_URL = "https://translate.api.cloud.yandex.net/translate/v2/languages"
TARGET_LANG = "ru"

# Cached list of supported languages: {source_code: target_codes}
# Populated on startup via get_supported_languages().
SUPPORTED_LANGUAGES: dict[str, list[str]] = {}


def get_supported_languages() -> dict[str, list[str]]:
    """Fetch supported source languages from Yandex Translate API.
    
    Returns a dict mapping source language codes to lists of target language codes.
    For example: {"en": ["ru"], "de": ["ru"], "fr": ["ru"]}
    
    Returns an empty dict on any error (API key missing, network issue, etc.).
    """
    if not API_KEY:
        return {}

    try:
        with httpx.Client(timeout=10.0) as client:
            response = client.post(
                LANGUAGES_URL,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Api-Key {API_KEY}",
                },
                json={},
            )
            if response.status_code >= 400:
                return {}
            data = response.json()
            # Yandex v2: {"languages": [{"code": "en", "name": "English"}, ...]}
            languages = data.get("languages", [])
            result: dict[str, list[str]] = {}
            for lang in languages:
                code = lang.get("code")
                if code:
                    result[code] = [TARGET_LANG]
            return result
    except (httpx.RequestError, httpx.HTTPStatusError, KeyError, ValueError):
        return {}


def get_api_language_names() -> dict[str, str]:
    """Fetch language names from Yandex Translate API.
    
    Returns a dict mapping language codes to English names.
    Returns an empty dict on any error.
    """
    if not API_KEY:
        return {}

    try:
        with httpx.Client(timeout=10.0) as client:
            response = client.post(
                LANGUAGES_URL,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Api-Key {API_KEY}",
                },
                json={},
            )
            if response.status_code >= 400:
                return {}
            data = response.json()
            languages = data.get("languages", [])
            names: dict[str, str] = {}
            for lang in languages:
                code = lang.get("code")
                name = lang.get("name")
                if code and name:
                    names[code] = name
            return names
    except (httpx.RequestError, httpx.HTTPStatusError, KeyError, ValueError):
        return {}


def _get_language_name(code: str) -> str:
    """Return a human-readable name for a language code.
    
    Falls back to the code itself if unknown.
    """
    return LANGUAGE_NAMES_EN.get(code, code)


def _translate_sync(
    word: str, source_language: str = "en", target_language: str = "ru"
) -> tuple[str | None, str | None, str]:
    """Sync translation via Yandex Translate Cloud API v2.
    
    Args:
        word: The word to translate.
        source_language: Source language code (e.g. 'en', 'de', 'fr') or 'auto' for auto-detection.
        target_language: Target language code (e.g. 'ru', 'en', 'de').
    
    Returns (translation, detected_language_code, raw_response_for_debug).
    """
    # Check cache first — key includes source and target to avoid cross-language collisions
    cache_key = f"{source_language}:{target_language}:{word}"
    cached = translation_cache.get(cache_key)
    if cached:
        return cached, None, ""  # None means "from cache, no detected language"

    if not API_KEY:
        return None, None, "API_KEY not set"

    try:
        with httpx.Client(timeout=10.0) as client:
            payload = {
                "folderId": FOLDER_ID,
                "texts": [word],
                "targetLanguageCode": target_language,
            }
            # Only send sourceLanguageCode if not auto-detect
            if source_language != "auto":
                payload["sourceLanguageCode"] = source_language
            
            response = client.post(
                API_URL,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Api-Key {API_KEY}",
                },
                json=payload,
            )
            raw = response.text
            if response.status_code >= 400:
                return None, None, f"HTTP {response.status_code}: {raw}"
            response.raise_for_status()
            data = response.json()
            # Yandex v2: {"translations": [{"text": "...", "detectedLanguageCode": "..."}]}
            translations = data.get("translations", [])
            if translations and translations[0].get("text"):
                translation = translations[0]["text"]
                detected = translations[0].get("detectedLanguageCode")
                # Save to cache with source and target language in key
                translation_cache.set(cache_key, translation)
                return translation, detected, ""
            return None, None, f"Empty response: {raw}"
    except httpx.HTTPStatusError as e:
        if e.response.status_code in (401, 403):
            raise HTTPException(
                500,
                "Yandex Translate API error. Check your API key.",
            )
        return None, None, f"HTTP {e.response.status_code}: {e.response.text}"
    except httpx.RequestError as e:
        return None, None, f"Network error: {e}"
    except (KeyError, IndexError, TypeError, ValueError) as e:
        return None, None, f"Parse error: {e}"


async def translate_word(
    word: str, source_language: str = "en", target_language: str = "ru"
) -> tuple[str | None, str | None]:
    """Translate a word via Yandex Translate Cloud API v2.
    
    Args:
        word: The word to translate.
        source_language: Source language code (e.g. 'en', 'de', 'fr').
        target_language: Target language code (e.g. 'ru', 'en', 'de').
    
    Returns (translation, detected_language_code).
    """
    loop = asyncio.get_running_loop()
    result, detected, _ = await loop.run_in_executor(
        None, _translate_sync, word, source_language, target_language
    )
    return result, detected
