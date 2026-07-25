"""Yandex SpeechKit TTS service.

Synthesizes speech from text via Yandex SpeechKit API v1.
Uses the same API key as Yandex Translate.
"""

import os
import httpx
import asyncio
from threading import Lock
from typing import Optional

API_KEY = os.getenv("YANDEX_API_KEY")
FOLDER_ID = os.getenv("YANDEX_FOLDER_ID", "b1gqq9rjega7119p3a2f")
TTS_URL = "https://tts.api.cloud.yandex.net/speech/v1/tts:synthesize"

# Mapping from Yandex Translate language codes to SpeechKit TTS language codes.
# SpeechKit uses region-qualified codes (e.g. en-US, ru-RU).
LANG_MAP: dict[str, str] = {
    "en": "en-US",
    "ru": "ru-RU",
    "de": "de-DE",
    "fr": "fr-FR",
    "es": "es-ES",
    "it": "it-IT",
    "tr": "tr-TR",
    "uk": "uk-UA",
    "kk": "kk-KK",
    "uz": "uz-UZ",
    "pt": "pt-BR",
    "pl": "pl-PL",
    "nl": "nl-NL",
    "sv": "sv-SE",
    "fi": "fi-FI",
    "no": "nb-NO",
    "da": "da-DK",
    "cs": "cs-CZ",
    "el": "el-GR",
    "hu": "hu-HU",
    "he": "he-IL",
    "hi": "hi-IN",
    "ar": "ar-AR",
    "ja": "ja-JP",
    "ko": "ko-KR",
    "zh": "zh-CN",
    "th": "th-TH",
    "vi": "vi-VN",
    "id": "id-ID",
    "ms": "ms-MY",
    "bg": "bg-BG",
    "ro": "ro-RO",
    "hr": "hr-HR",
    "sk": "sk-SK",
    "sl": "sl-SI",
    "lt": "lt-LT",
    "lv": "lv-LV",
    "et": "et-EE",
    "ka": "ka-GE",
    "az": "az-AZ",
    "hy": "hy-AM",
    "sr": "sr-RS",
    "ta": "ta-IN",
    "te": "te-IN",
    "ml": "ml-IN",
    "mr": "mr-IN",
    "bn": "bn-IN",
    "gu": "gu-IN",
    "kn": "kn-IN",
    "pa": "pa-IN",
    "fa": "fa-IR",
    "be": "be-BY",
    "ky": "ky-KG",
    "tg": "tg-TJ",
    "tk": "tk-TM",
    "mn": "mn-MN",
    "km": "km-KH",
    "lo": "lo-LA",
    "my": "my-MM",
    "ne": "ne-NP",
    "si": "si-LK",
    "am": "am-ET",
    "ha": "ha-NG",
    "sw": "sw-KE",
    "af": "af-ZA",
    "sq": "sq-AL",
    "is": "is-IS",
    "ga": "ga-IE",
    "mt": "mt-MT",
    "cy": "cy-GB",
    "eo": "eo",
}


def map_language(lang_code: str) -> str:
    """Map a Translate language code to a SpeechKit TTS language code.

    Falls back to the original code if no mapping exists.
    """
    return LANG_MAP.get(lang_code, lang_code)


class SpeechCache:
    """In-memory cache for synthesized audio bytes.

    Thread-safe, with a size limit to avoid excessive memory usage.
    """

    def __init__(self, max_entries: int = 500):
        self._cache: dict[str, bytes] = {}
        self._max = max_entries
        self._lock = Lock()

    def _key(self, text: str, lang: str) -> str:
        return f"{lang}:{text}"

    def get(self, text: str, lang: str) -> Optional[bytes]:
        with self._lock:
            return self._cache.get(self._key(text, lang))

    def set(self, text: str, lang: str, audio: bytes) -> None:
        with self._lock:
            if len(self._cache) >= self._max:
                # Evict oldest entry (dict preserves insertion order in Python 3.7+)
                oldest = next(iter(self._cache))
                del self._cache[oldest]
            self._cache[self._key(text, lang)] = audio

    def clear(self) -> None:
        with self._lock:
            self._cache.clear()

    def size(self) -> int:
        with self._lock:
            return len(self._cache)


# Global cache instance
speech_cache = SpeechCache(max_entries=500)


def _synthesize_sync(text: str, lang: str) -> bytes | None:
    """Sync TTS synthesis via Yandex SpeechKit API v1.

    Args:
        text: Text to synthesize (max 5000 chars per Yandex limits).
        lang: Translate language code (e.g. 'en', 'ru') — will be mapped to SpeechKit code.

    Returns:
        MP3 audio bytes, or None on error.
    """
    cache_key_lang = lang
    cached = speech_cache.get(text, cache_key_lang)
    if cached is not None:
        return cached

    if not API_KEY:
        return None

    speechkit_lang = map_language(lang)

    try:
        with httpx.Client(timeout=10.0) as client:
            response = client.post(
                TTS_URL,
                headers={
                    "Authorization": f"Api-Key {API_KEY}",
                },
                data={
                    "text": text,
                    "lang": speechkit_lang,
                    "format": "mp3",
                    "folderId": FOLDER_ID,
                },
            )
            response.raise_for_status()
            audio = response.content
            speech_cache.set(text, cache_key_lang, audio)
            return audio
    except (httpx.HTTPStatusError, httpx.RequestError):
        return None


async def synthesize_speech(text: str, lang: str) -> bytes | None:
    """Synthesize speech from text via Yandex SpeechKit.

    Args:
        text: Text to synthesize.
        lang: Translate language code (e.g. 'en', 'ru').

    Returns:
        MP3 audio bytes, or None on error.
    """
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, _synthesize_sync, text, lang)
