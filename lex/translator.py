import os
import httpx
import asyncio
from fastapi import HTTPException

API_KEY = os.getenv("YANDEX_API_KEY")
FOLDER_ID = os.getenv("YANDEX_FOLDER_ID", "b1gqq9rjega7119p3a2f")
API_URL = "https://translate.api.cloud.yandex.net/translate/v2/translate"
TARGET_LANG = "ru"


def _translate_sync(word: str) -> tuple[str | None, str]:
    """Синхронный перевод через Yandex Translate Cloud API v2.
    
    Возвращает (перевод, raw_response для отладки).
    """
    if not API_KEY:
        return None, "API_KEY не установлен"

    try:
        with httpx.Client(timeout=10.0) as client:
            response = client.post(
                API_URL,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Api-Key {API_KEY}",
                },
                json={
                    "folderId": FOLDER_ID,
                    "texts": [word],
                    "targetLanguageCode": TARGET_LANG,
                },
            )
            raw = response.text
            if response.status_code >= 400:
                return None, f"HTTP {response.status_code}: {raw}"
            response.raise_for_status()
            data = response.json()
            # Yandex v2: {"translations": [{"text": "...", "detectedLanguageCode": "..."}]}
            translations = data.get("translations", [])
            if translations and translations[0].get("text"):
                return translations[0]["text"], ""
            return None, f"Пустой ответ: {raw}"
    except httpx.HTTPStatusError as e:
        if e.response.status_code in (401, 403):
            raise HTTPException(
                500,
                "Ошибка Yandex Translate API. Проверьте API ключ.",
            )
        return None, f"HTTP {e.response.status_code}: {e.response.text}"
    except httpx.RequestError as e:
        return None, f"Ошибка сети: {e}"
    except (KeyError, IndexError, TypeError) as e:
        return None, f"Ошибка парсинга: {e}"


async def translate_word(word: str) -> str | None:
    """Перевести слово через Yandex Translate Cloud API v2."""
    loop = asyncio.get_running_loop()
    result, _ = await loop.run_in_executor(None, _translate_sync, word)
    return result
