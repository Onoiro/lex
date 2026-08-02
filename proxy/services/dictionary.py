"""Yandex Dictionary Corpus service.

Fetches example sentences from Yandex Dictionary corpus endpoint.
The queryCorpus endpoint does not require an API key.
"""

import json
import httpx
import asyncio

from proxy.services.cache import TranslationCache

CORPUS_URL = "https://dictionary.yandex.net/dicservice.json/queryCorpus"

# Examples change rarely — cache for 30 days
dictionary_cache = TranslationCache(ttl_seconds=86400 * 30)


def _clean_text(text: str) -> str:
    """Remove markup brackets (<word> → word) from corpus example text."""
    return text.replace("<", "").replace(">", "").strip()


def _extract_examples(api_response: dict) -> list[dict]:
    """Extract example sentences from queryCorpus API response.

    The response structure is:
        {"result": [{"examples": [{"src": "...", "dst": "..."}, ...]}]}

    Returns a list of {"text": str, "translation": str} dicts.
    """
    examples: list[dict] = []
    seen: set[str] = set()

    for group in api_response.get("result", []):
        for ex in group.get("examples", []):
            src_text = _clean_text(ex.get("src", ""))
            dst_text = _clean_text(ex.get("dst", ""))

            if not src_text or src_text in seen:
                continue
            seen.add(src_text)

            examples.append({
                "text": src_text,
                "translation": dst_text,
            })

    return examples


def _lookup_sync(text: str, lang_pair: str) -> list[dict] | None:
    """Sync lookup via Yandex Dictionary corpus endpoint.

    Args:
        text: The word to look up.
        lang_pair: Language pair, e.g. "en-ru".

    Returns:
        List of example dicts, or None on error.
    """
    cache_key = f"{lang_pair}:{text}"
    cached = dictionary_cache.get(cache_key)
    if cached is not None:
        return json.loads(cached)

    try:
        with httpx.Client(timeout=10.0) as client:
            response = client.get(
                CORPUS_URL,
                params={
                    "src": text,
                    "ui": "en",
                    "lang": lang_pair,
                    "flags": 7,
                },
            )
            response.raise_for_status()
            data = response.json()
            examples = _extract_examples(data)

            # Cache even empty results to avoid repeated API calls
            dictionary_cache.set(cache_key, json.dumps(examples))
            return examples
    except (httpx.HTTPStatusError, httpx.RequestError, KeyError, ValueError):
        return None


async def lookup_word(text: str, lang_pair: str) -> list[dict] | None:
    """Look up example sentences via Yandex Dictionary corpus endpoint.

    Args:
        text: The word to look up.
        lang_pair: Language pair, e.g. "en-ru".

    Returns:
        List of example dicts, or None on error.
    """
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, _lookup_sync, text, lang_pair)