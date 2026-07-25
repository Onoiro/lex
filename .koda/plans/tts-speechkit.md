# План: Озвучивание (TTS) в Переводчике и Повторе

## Контекст

Yandex SpeechKit TTS использует тот же API-ключ, что и Yandex Translate (`Authorization: Api-Key <key>`).
Сервисный аккаунт имеет роли: `ai.translate.user`, `ai.speechkit-tts.user`, `ai.speechkit-stt.user`.

### Yandex SpeechKit TTS API v1
- **URL:** `https://tts.api.cloud.yandex.net/speech/v1/tts:synthesize`
- **Метод:** POST, `application/x-www-form-urlencoded`
- **Параметры:** `text`, `lang` (например `en-US`, `ru-RU`), `voice` (например `alena`, `ermil`), `format=mp3`, `folderId`
- **Auth:** `Authorization: Api-Key {YANDEX_API_KEY}` (тот же ключ, что для Translate)
- **Ответ:** бинарные mp3-данные

### Требования
- **Режим Переводчик (Add.tsx):** кнопки 🔊 для исходного слова и для перевода
- **Режим Повтор (Review.tsx):** настройка вкл/выкл озвучку; при включении — авто-проигрывание слова при показе и перевода при показе перевода
- **Settings:** toggle для `tts_enabled` (по умолчанию `false`)

### Архитектурные решения
- Proxy скрывает API-ключ (как с Translate)
- In-memory кэш для аудио на стороне proxy (bytes) и клиента (Blob)
- Маппинг языковых кодов: Translate `en` → SpeechKit `en-US`, `ru` → `ru-RU`, и т.д.
- Тихий fail при ошибках TTS (не крашит UI)

### Ключевые файлы проекта (уже изучены)
- `proxy/main.py` — FastAPI, эндпоинты `/translate`, `/languages`, rate limiting
- `proxy/services/translator.py` — Yandex Translate клиент, auth через `Api-Key`
- `proxy/services/cache.py` — `TranslationCache` (TTL, thread-safe), паттерн для кэша TTS
- `proxy/security/rate_limiter.py` — `RateLimiter` класс, `get_client_ip()`
- `client/src/services/translateApi.ts` — `PROXY_URL`, `translateWord()`, `getLanguages()`
- `client/src/types/word.ts` — `LanguageSettings`, `DEFAULT_LANGUAGE_SETTINGS`, `Word`, `ReviewDirection`
- `client/src/data/db.ts` — Dexie, `LexDatabase`, `SettingsRow`, version 1
- `client/src/data/settingsRepository.ts` — `getSettings()`, `saveSettings(partial)` (merge)
- `client/src/pages/Add.tsx` — Переводчик: auto-translate с debounce, language bar, word input, translation textarea
- `client/src/pages/Review.tsx` — Повтор: phases (loading/empty/start/training/paused/done), timer, `currentView` с `direction`
- `client/src/pages/Settings.tsx` — настройки: fieldsets для app language и translate
- `client/src/i18n/en.json`, `client/src/i18n/ru.json` — все UI строки
- `client/src/i18n/languages.ts` — `LANGUAGE_NAMES_EN`, `LANGUAGE_NAMES_RU`, `getLanguageName()`

### Паттерны проекта
- Proxy: `httpx.Client`, `os.getenv()`, `load_dotenv()`, `JSONResponse` для ошибок
- Client: `PROXY_URL = import.meta.env.VITE_PROXY_URL ?? ""`, fetch API
- Settings: single-row table `id="app"`, `saveSettings` делает merge
- i18n: `t("key", { param: value })`, переводы в `en.json`/`ru.json`
- Тесты proxy: pytest, `tests/conftest.py`
- Тесты client: Vitest + fake-indexeddb

---

## План работ

1. [ ] **Proxy: сервис TTS (Yandex SpeechKit)**
    - Навыки: koda-coder
    - Файлы:
        - `proxy/services/tts.py` (новый)
        - `proxy/services/__init__.py`
    - Детали:
        - Функция `synthesize_speech(text, lang) -> bytes` — POST на `https://tts.api.cloud.yandex.net/speech/v1/tts:synthesize`
        - Auth: `Authorization: Api-Key {YANDEX_API_KEY}` (тот же ключ, что для Translate)
        - Параметры: `text`, `lang` (маппинг из кодов Translate `en`→`en-US`, `ru`→`ru-RU` и т.д.), `format=mp3`, `folderId`
        - Ответ: бинарные mp3-данные
        - Таблица маппинга языковых кодов Translate → SpeechKit
        - In-memory кэш для аудио (отдельный от кэша переводов, хранит bytes)

2. [ ] **Proxy: эндпоинт POST /tts**
    - Навыки: koda-coder
    - Файлы:
        - `proxy/main.py`
    - Детали:
        - Body: `{ text: str, lang: str }` (lang — код Translate, напр. `en`, `ru`)
        - Rate limiting: отдельный лимитер (30 запросов/мин)
        - Возвращает `Response(content=audio_bytes, media_type="audio/mpeg")`
        - Заголовки `Cache-Control` для браузерного кэширования

3. [ ] **Proxy: тесты TTS**
    - Навыки: koda-coder
    - Файлы:
        - `tests/test_tts.py` (новый)
    - Детали:
        - Тест маппинга языковых кодов
        - Тест успешного синтеза (mock httpx)
        - Тест кэширования
        - Тест эндпоинта `/tts` (через TestClient)
        - Тест rate limiting

4. [ ] **Client: сервис ttsApi.ts**
    - Навыки: koda-coder
    - Файлы:
        - `client/src/services/ttsApi.ts` (новый)
    - Детали:
        - `synthesizeSpeech(text, lang): Promise<Blob>` — fetch на `/tts`, возвращает Blob
        - In-memory кэш на стороне клиента (Map<string, Blob>) для повторных запросов
        - Graceful обработка ошибок (тихий fail, без краша UI)

5. [ ] **Client: обновление типов и настроек**
    - Навыки: koda-coder
    - Файлы:
        - `client/src/types/word.ts`
        - `client/src/data/db.ts`
    - Детали:
        - Добавить `tts_enabled: boolean` в `LanguageSettings` (по умолчанию `false`)
        - Dexie: schema version 2 (добавить поле в settings — single-row table, put-merge)

6. [ ] **Client: i18n строки для TTS**
    - Навыки: koda-coder
    - Файлы:
        - `client/src/i18n/en.json`
        - `client/src/i18n/ru.json`
    - Детали:
        - `tts.listen_word` / `tts.listen_translation` (tooltips для кнопок 🔊)
        - `settings.tts` / `settings.tts_review` / `settings.tts_description` (для настроек Повтора)

7. [ ] **Client: кнопки TTS в Переводчике (Add.tsx)**
    - Навыки: koda-coder
    - Файлы:
        - `client/src/pages/Add.tsx`
    - Детали:
        - Кнопка 🔊 рядом с полем ввода слова (озвучивает исходное слово)
        - Кнопка 🔊 рядом с полем перевода (озвучивает перевод)
        - Клик → `synthesizeSpeech(text, lang)` → `new Audio(URL.createObjectURL(blob)).play()`
        - Язык для слова: `settings.source_lang` (или detected), для перевода: `settings.target_lang`
        - Кнопка disabled во время загрузки аудио (спиннер/индикатор)

8. [ ] **Client: TTS в Повторе (Review.tsx)**
    - Навыки: koda-coder
    - Файлы:
        - `client/src/pages/Review.tsx`
    - Детали:
        - Чтение `tts_enabled` из настроек при старте
        - Если включено: авто-проигрывание слова при показе (после `startTimer`)
        - Если включено: авто-проигрывание перевода при `showTranslation`
        - Язык: `direction === "en_ru"` → слово на `source_lang`, перевод на `target_lang`; `ru_en` — наоборот
        - Тихий fail при ошибке (нет сети / язык не поддерживается)

9. [ ] **Client: настройка TTS в Settings.tsx**
    - Навыки: koda-coder
    - Файлы:
        - `client/src/pages/Settings.tsx`
    - Детали:
        - Новый fieldset «Озвучивание» с toggle/checkbox для `tts_enabled`
        - Сохранение в settings через `saveSettings({ tts_enabled })`

10. [ ] **Client: тесты TTS**
    - Навыки: koda-coder
    - Файлы:
        - `client/src/services/ttsApi.test.ts` (новый)
    - Детали:
        - Тест `synthesizeSpeech` (mock fetch)
        - Тест кэширования

11. [ ] **Проверка и линтинг**
    - Навыки: koda-coder
    - Файлы:
        - (без новых файлов)
    - Детали:
        - `uv run ruff check proxy/` — без ошибок
        - `uv run pytest tests/ -v` — все тесты проходят
        - `cd client && npx eslint .` — без ошибок
        - `cd client && npm run test` — все тесты проходят
        - `cd client && npx tsc --noEmit` — без ошибок типов
