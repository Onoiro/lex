# KODA.md — Контекст проекта Lex

## Обзор проекта
Lex — local-first приложение-переводчик и помощник для запоминания слов. Словарь, spaced repetition (SM-2) и настройки хранятся локально на устройстве (IndexedDB через Dexie.js). Интернет нужен только для перевода через тонкий proxy к Yandex Translate API. Распространение: PWA, Android (RuStore/AppGallery через Capacitor), Desktop (Tauri).

**Демо:** [lex.2-way.ru](https://lex.2-way.ru)

**Текущая версия:** 1.21.0

## Архитектура

```
┌──────────────────────────────────────────────────────┐
│                     Client (React)                    │
│  ┌──────────┐   ┌──────────┐   ┌──────────────────┐  │
│  │  Pages   │   │  Domain  │   │  Data (Dexie/IDB)│  │
│  │ (React)  │   │  (SRS)   │   │ wordRepo, settings│  │
│  └──┬───┬───┘   └──────────┘   └──────────────────┘  │
│     │   └──────────────┐                              │
│     ▼                  ▼                              │
│  ┌────────────┐   ┌──────────┐                       │
│  │translateApi│   │dictionaryApi│
│  │  ttsApi    │   │              │
│  └─────┬──────┘   └──────┬───────┘
│        │                 │
└────────┼─────────────────┼──────────────────────────────┘
         │                 │
         ▼                 ▼
┌─────────────────────────────────────────────┐
│        Proxy (FastAPI, port 8004)            │
│  POST /translate   POST /tts                │
│  GET  /languages   POST /dictionary          │
│  POST /feedback    GET  /cache/stats         │
│  GET  /            GET  /tts/cache           │
│  GET  /dictionary/cache                      │
│                                               │
│  Yandex Translate API + SpeechKit + Corpus   │
│  + Telegram Bot (feedback)                   │
└─────────────────────────────────────────────┘
```

- **Client:** React 19 + TypeScript, Vite 7, Dexie.js (IndexedDB), Pico CSS, vite-plugin-pwa
- **Proxy:** FastAPI, порт 8004. Скрывает Yandex API key. Эндпоинты: POST `/translate`, GET `/languages`, POST `/tts`, GET `/`, GET `/cache/stats`, GET `/tts/cache/stats`, POST `/dictionary`, GET `/dictionary/cache/stats`, POST `/feedback`

## Используемые технологии

### Client (`client/`)
- **Язык:** TypeScript (strict mode)
- **Фреймворк:** React 19
- **Сборка:** Vite 7
- **Хранилище:** Dexie.js (IndexedDB)
- **Стили:** Pico CSS (через npm, подход без классов)
- **PWA:** vite-plugin-pwa (service worker, web manifest, offline)
- **Тестирование:** Vitest + jsdom + fake-indexeddb
- **Линтинг:** ESLint 9 + typescript-eslint
- **Android:** Capacitor 8 (RuStore, AppGallery)
- **Desktop:** Tauri 2 (Windows MSI/NSIS, macOS DMG, Linux deb/AppImage)

### Proxy (`proxy/`)
- **Язык:** Python 3.13
- **Фреймворк:** FastAPI
- **Управление пакетами:** uv (pyproject.toml, uv.lock; requirements.txt для Docker)
- **Порт:** 8004

## Сборка и запуск

### Client (PWA)
```bash
cd client
npm install
npm run dev          # dev server на localhost:5173
npm run build        # production build → dist/
npm run test         # vitest
npm run lint         # eslint
```

### Proxy
```bash
cd proxy
pip install -r requirements.txt
uvicorn proxy.main:app --port 8004
```

### Android (Capacitor)
```bash
cd client
npm run build
npx cap sync android
cd android
./gradlew assembleRelease   # → app/build/outputs/apk/release/
```

### Desktop (Tauri)
```bash
cd client
npm run tauri:build    # → src-tauri/target/release/bundle/
npm run tauri:dev      # dev mode
```

### Docker (proxy)
```bash
make d-build  # docker compose build
make d-run    # docker compose up -d
```

## Структура проекта
```
.
├── client/                    # Local-first клиентское приложение
│   ├── src/
│   │   ├── components/        # Layout, OfflineIndicator
│   │   ├── data/              # db.ts (Dexie), wordRepository, settingsRepository, dailyStatsRepository
│   │   ├── domain/            # srs.ts (SM-2), stats.ts, validators.ts, dictionarySort.ts, dailyStats.ts
│   │   ├── i18n/              # index.ts, languages.ts, en.json, ru.json
│   │   ├── pages/             # Home, Add, Review, Dictionary, Settings
│   │   ├── services/          # translateApi.ts (proxy client), ttsApi.ts, dictionaryApi.ts, feedbackApi.ts, proxyClient.ts, theme.ts
│   │   ├── test/              # Component and service tests (Vitest)
│   │   └── types/             # Word, LanguageSettings, DailyStats
│   │   └── main.tsx           # App entry, SW registration, native plugins
│   ├── capacitor.config.ts    # Android config (ru.lex.app)
│   ├── src-tauri/             # Desktop (Tauri 2, Rust)
│   ├── android/               # Capacitor Android project
│   ├── public/                # PWA icons, favicon
│   ├── vite.config.ts         # Vite + PWA plugin
│   ├── eslint.config.js
│   └── package.json
├── proxy/                     # Translate proxy (FastAPI, порт 8004)
│   ├── __init__.py
│   ├── main.py                # /translate, /languages, /tts, /dictionary, /feedback, /, /cache/stats, /tts/cache/stats, /dictionary/cache/stats
│   ├── languages.py           # Language metadata (names, native names)
│   ├── services/
│   │   ├── __init__.py
│   │   ├── translator.py      # Yandex Translate API client
│   │   ├── cache.py           # SQLite-backed caches (SqliteCache/TextCache/TranslationCache)
│   │   ├── tts.py             # Speechkin TTS client
│   │   ├── dictionary.py      # Yandex Dictionary corpus client
│   │   └── feedback.py        # Telegram Bot feedback service
│   ├── security/
│   │   ├── rate_limiter.py    # Rate limiting
│   │   ├── quota.py           # Daily char quotas per IP + global budget (UTC day window)
│   │   └── token_auth.py      # X-App-Token check (APP_TOKENS env, empty = disabled)
│   │   └── version_gate.py    # X-App-Version check (MIN_APP_VERSION env, empty = disabled)
│   ├── Dockerfile
│   └── requirements.txt
├── tests/                     # Proxy tests (pytest)
│   ├── conftest.py
│   ├── test_proxy.py
│   ├── test_translator.py
│   ├── test_cache.py
│   ├── test_rate_limiter.py
│   ├── test_tts.py
│   ├── test_dictionary.py
│   └── test_feedback.py
├── pyproject.toml             # Python project config (uv, ruff)
├── Makefile                   # Build/run scripts
├── docker-compose.yml         # Docker (proxy)
└── .env                       # YANDEX_API_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
```

## Правила разработки

### Client
- **Импорты:** alias `@/` → `client/src/`
- **Тестирование:** Vitest + fake-indexeddb. Все новые функции покрываются тестами.
- **Линтинг:** `npx eslint .` — 0 ошибок. Предупреждения — некритичные (react-refresh, react-hooks/exhaustive-deps).
- **Комментарии:** на простом английском, понятном non-native speakers.
- **Стиль:** Pico CSS (без классов), Material Design принципы.
- **i18n:** все UI-строки через `t()` из `@/i18n`. Переводы в `en.json` и `ru.json`.
- **PWA:** vite-plugin-pwa генерирует SW. Runtime cache для `/translate`, `/languages` и `/dictionary` (NetworkFirst).
- **TTS:** `ttsApi.ts` — персистентный кеш аудио через Cache API (`lex-tts-audio`, ключи `tts:{lang}:{text}`, LRU-лимит ~50 МБ). Офлайн: пропускает запрос при `navigator.onLine === false`, ранее прослушанные слова озвучиваются из кеша. Ошибки лимитов (квота, длина) пробрасываются через опциональный callback `onError`.
- **Лимиты на клиенте:** `translateApi.ts` бросает `LimitError` с кодами `text_too_long` / `daily_quota_exceeded`. Add.tsx: при исчерпании дневной квоты автоперевод останавливается до конца дня (флаг в state, без спама 429), при вводе >500 символов — предупреждение и отказ от автоперевода. В Настройках — сворачиваемый раздел «Лимиты использования» (перед Feedback).
- **VITE_PROXY_URL:** env var для proxy base URL (пустая строка = relative path).
- **proxyClient.ts:** общий модуль прокси-клиента — `PROXY_URL`, `proxyHeaders()` (Content-Type + `X-App-Token`, когда задан `VITE_APP_TOKEN` + `X-App-Version` всегда). Все сервисы (translateApi, ttsApi, dictionaryApi, feedbackApi) используют `proxyHeaders()`. Токен вшивается при сборке через `VITE_APP_TOKEN` (build-time env, на сервер не попадает).
- **Ежедневная статистика:** таблица `dailyStats` (Dexie v6, ключ — локальная дата `YYYY-MM-DD`). Запись инкрементальная: `recordAnswer` после каждого ответа в Review, `incrementNewWords` после добавления слова в Add. Репозиторий: `dailyStatsRepository.ts` (`recordAnswer`, `incrementNewWords`, `getRecentDays`, `getStreak`, `todayKey`). UI на странице Повтор: блок «Сегодня» (повторения, точность, время, новые слова, streak) на стартовом экране, «Сегодня всего» на paused/done, сворачиваемая история за 14 дней. Streak — дни с `reviewed > 0` или `new_words > 0`; если сегодня пусто, серия считается от вчера.

### Proxy
- **Proxy:** FastAPI, порт 8004. Скрывает Yandex API key. Rate limiting. Дневные символьные квоты. Глобальный дневной бюджет. Проверка X-App-Token. CORS whitelist. Кэш переводов. TTS (text-to-speech). Feedback (Telegram Bot).
- Эндпоинты: POST `/translate` (body: word, source_lang, target_lang), GET `/languages`, POST `/tts`, POST `/dictionary` (body: word, lang_pair), POST `/feedback` (body: category, message, contact), GET `/`, GET `/cache/stats`, GET `/tts/cache/stats`, GET `/dictionary/cache/stats`.
- **Лимиты использования:** максимум 500 символов на запрос (`/translate`, `/tts`) — превышение → 400 `{"error": "text_too_long", "max_length": 500}`. Дневные квоты на IP: 500 символов перевода/день + 500 символов TTS/день (класс `DailyQuota` в `proxy/security/quota.py`, окно — календарный день UTC, in-memory, сброс при рестарте) — превышение → 429 `{"error": "daily_quota_exceeded"}`. Глобальный дневной бюджет на всех пользователей суммарно (translate + tts вместе): класс `GlobalBudget` в `proxy/security/quota.py`, лимит через env `GLOBAL_DAILY_CHAR_LIMIT` (дефолт 300 000 симв/день) — превышение → 503 `{"error": "service_overloaded"}`. Кэши (серверные и клиентский TTS Cache API) не расходуют квоты и глобальный бюджет — лимитируется только фактический вызов Yandex API (в `/translate` и `/tts` кэш проверяется до списания). `/dictionary` — бесплатный эндпоинт, без квот.
- **App token (X-App-Token):** все эндпоинты кроме `GET /` (health-check) требуют заголовок `X-App-Token` (класс `AppTokenAuth` в `proxy/security/token_auth.py`). Токены через env `APP_TOKENS` (список через запятую, для ротации). Пустой/не заданный `APP_TOKENS` = проверка выключена (обратная совместимость при выкате). Отсутствие/несовпадение токена → 403 `{"error": "unauthorized"}`. Токен — фильтр от скрипт-киди, не защита от целевой атаки (токен извлекается из APK); настоящая защита — квоты и бюджет.
- **Version gate (X-App-Version):** клиент шлёт версию приложения (semver) в заголовке `X-App-Version` — инжектится при сборке из `client/package.json` через `define` в `vite.config.ts` и `vitest.config.ts` (`__APP_VERSION__`). Прокси сравнивает с env `MIN_APP_VERSION` (класс `VersionGate` в `proxy/security/version_gate.py`). Пустой/не заданный `MIN_APP_VERSION` = проверка выключена (тот же паттерн выката, что у APP_TOKENS: прокси без проверки → релиз клиента с заголовком → включить проверку на сервере). Устаревшая/отсутствующая/невалидная версия → 426 `{"error": "update_required", "min_version": "..."}`. Клиент: при 426 все 4 сервиса вызывают `notifyUpdateRequired()` из `services/updateGate.ts`, App рендерит полноэкранную заглушку `components/UpdateScreen.tsx` — кнопка «Перезагрузить» (для PWA) + ссылка на магазин/загрузку в зависимости от платформы (Android: `VITE_RUSTORE_URL`, web/desktop: `VITE_DOWNLOAD_URL`; пустые env = ссылка скрыта; i18n-ключи `update.*`). Порядок проверки в middleware: токен → версия.
- **CORS whitelist:** env `ALLOWED_ORIGINS` (через запятую); если не задан — дефолт: `https://lex.2-way.ru`, `https://localhost` (Capacitor Android), `capacitor://localhost` (iOS), `http://tauri.localhost` (Tauri Win/Linux), `tauri://localhost` (Tauri macOS). Чужие origin не получают CORS-заголовков (браузер блокирует ответ). `allow_headers`: Content-Type, X-App-Token, X-Device-Id (задел под B-5). Порядок middleware: токен-мидлварь добавлена первой, CORS — второй (CORS вешает заголовки и на 403-ответы).
- **Персистентные кэши (SQLite):** все 3 серверных кэша хранятся в одной SQLite БД (путь через env `SQLITE_CACHE_PATH`, дефолт `data/cache.db`): переводы (TTL 7 дней, таблица `translations`), TTS-аудио (до 500 записей, eviction по времени вставки, таблица `tts_audio`), примеры словаря (TTL 30 дней, таблица `dictionary`). База переживает рестарт контейнера — повторный перевод того же слова не тратит квоту и бюджет. Классы в `proxy/services/cache.py`: `SqliteCache` (bytes), `TextCache` (UTF-8 текст), `TranslationCache` (совместимое имя, таблица переводов); `SpeechCache` в `tts.py` — подкласс `SqliteCache`. Соединение открывается лениво (при первом обращении), защищено отдельным локом инициализации; при недоступной БД кэш деградирует до промахов без исключений. В Docker БД лежит в volume `lex-cache` → `/app/data` (см. `docker-compose.yml`), каталог создаётся и передаётся пользователю `lex` в Dockerfile.
- Самодостаточный модуль: все зависимости внутри `proxy/` (services/, security/, languages.py).
- **Линтинг:** `uv run ruff check proxy/` — без ошибок.
- **Тестирование:** `uv run pytest tests/ -v`.
- **Комментарии:** на простом английском.

## Алгоритм повторений (SM-2)
- Упрощённая версия SM-2. Интервалы растут при правильных ответах, сбрасываются при ошибках.
- **Correct:** Interval grows (1 → 6 → interval × 2.5, capped at 30 days)
- **Correct with hint:** ответ с подсказкой («почти знал») засчитывается, но итоговый интервал вдвое меньше обычного (max(1, trunc(обычный/2))), repetitions НЕ инкрементируется, hint_count + 1.
- **Wrong:** Interval and repetitions reset to 0.
- **Подсказка и время:** при клике «Подсказка» таймер замораживается — в avg_time и daily stats идёт только время до клика; best_time при подсказке не обновляется (updateResponseTime(word, elapsed, recordBest=false)).
- **Языки на карточке:** на лицевой стороне карточки Повтора — бейдж языка показываемого слова в левом верхнем углу (`.flip-card-lang`, код языка, скрывается при `auto`) и подпись «Вспомните перевод на {язык}» с целевым языком (i18n-ключи `review.remember_to`, имя языка через `getLanguageName(code, "short")`). При `word_lang`/`translation_lang` = `auto` показывается старая подпись без языка.
- Выбор слова: взвешенный рандом, вес = 1 / (interval + 1) × (1 + RT_COEFF × normAvgTime). Меньший интервал и медленнее реакция = выше шанс.
  - RT_COEFF = 1.0 (Reaction Time Coefficient)
  - normAvgTime = clamp(avg_time / 10, 0, 1), null → 1.0 (новые слова — максимальный приоритет)
- Ранг слова (1–100): отображается в словаре вместо интервала. Вычисляется из веса: round(weight / 2.0 × 100), clamp [1, 100]. 100 = показывается чаще всего, 1 = реже всего.
- Статистика: know_count, forgot_count, hint_count, best_time, avg_time для каждого слова.
- Таймер: потолок 10 сек. После 5 сек — оранжевый, после 10 — красный. Авто-ответ «Не помню» через 10 сек (отменяется при открытии подсказки).
- Пауза: при 3 подряд авто-ответах или 30 сек бездействия.
- Справка: на стартовом экране Повтора — сворачиваемый блок «Как это работает?» с объяснением алгоритма простым языком (i18n-ключи review.how_it_works_*).

## Дальнейшие планы
- **Бэклог подготовки к маркетплейсам:** `.koda/backlog.md` — задачи P0–P3 (глобальный бюджет ✅, CORS+токен ✅, version gate ✅, SQLite-кэши ✅, device ID, биллинг RuStore, мониторинг). Брать задачи по порядку приоритета; перед реализацией — план в `.koda/plans/`.
- Пагинация по словарю при росте
- CI для кросс-компиляции Tauri (Windows MSI/NSIS, macOS DMG)
- График активности за 14 дней на странице Повтор (данные dailyStats уже есть)

---
**Последнее обновление:** 12 сентября 2026
