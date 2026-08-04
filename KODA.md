# KODA.md — Контекст проекта Lex

## Обзор проекта
Lex — local-first приложение-переводчик и помощник для запоминания слов. Словарь, spaced repetition (SM-2) и настройки хранятся локально на устройстве (IndexedDB через Dexie.js). Интернет нужен только для перевода через тонкий proxy к Yandex Translate API. Распространение: PWA, Android (RuStore/AppGallery через Capacitor), Desktop (Tauri).

**Демо:** [lex.2-way.ru](https://lex.2-way.ru)

**Текущая версия:** 1.12.2

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
│  GET  /            GET  /cache/stats         │
│  GET  /tts/cache   GET  /dictionary/cache    │
│                                               │
│  Yandex Translate API + SpeechKit + Corpus   │
└─────────────────────────────────────────────┘
```

- **Client:** React 19 + TypeScript, Vite 7, Dexie.js (IndexedDB), Pico CSS, vite-plugin-pwa
- **Proxy:** FastAPI, порт 8004. Скрывает Yandex API key. Эндпоинты: POST `/translate`, GET `/languages`, POST `/tts`, GET `/`, GET `/cache/stats`, GET `/tts/cache/stats`, POST `/dictionary`, GET `/dictionary/cache/stats`

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
│   │   ├── data/              # db.ts (Dexie), wordRepository, settingsRepository
│   │   ├── domain/            # srs.ts (SM-2), stats.ts, validators.ts, dictionarySort.ts
│   │   ├── i18n/              # index.ts, languages.ts, en.json, ru.json
│   │   ├── pages/             # Home, Add, Review, Dictionary, Settings
│   │   ├── services/          # translateApi.ts (proxy client), ttsApi.ts, dictionaryApi.ts, theme.ts
│   │   ├── test/              # Component and service tests (Vitest)
│   │   ├── types/             # Word, LanguageSettings
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
│   ├── main.py                # /translate, /languages, /tts, /dictionary, /, /cache/stats, /tts/cache/stats, /dictionary/cache/stats
│   ├── languages.py           # Language metadata (names, native names)
│   ├── services/
│   │   ├── __init__.py
│   │   ├── translator.py      # Yandex Translate API client
│   │   ├── cache.py           # Translation cache (TTL)
│   │   ├── tts.py             # Speechkin TTS client
│   │   └── dictionary.py      # Yandex Dictionary corpus client
│   ├── security/
│   │   ├── __init__.py
│   │   └── rate_limiter.py    # Rate limiting
│   ├── Dockerfile
│   └── requirements.txt
├── tests/                     # Proxy tests (pytest)
│   ├── conftest.py
│   ├── test_proxy.py
│   ├── test_translator.py
│   ├── test_cache.py
│   ├── test_rate_limiter.py
│   ├── test_tts.py
│   └── test_dictionary.py
├── pyproject.toml             # Python project config (uv, ruff)
├── Makefile                   # Build/run scripts
├── docker-compose.yml         # Docker (proxy)
└── .env                       # YANDEX_API_KEY
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
- **VITE_PROXY_URL:** env var для proxy base URL (пустая строка = relative path).

### Proxy
- Скрывает Yandex API key. Rate limiting. Кэш переводов. TTS (text-to-speech).
- Эндпоинты: POST `/translate` (body: word, source_lang, target_lang), GET `/languages`, POST `/tts`, POST `/dictionary` (body: word, lang_pair), GET `/`, GET `/cache/stats`, GET `/tts/cache/stats`, GET `/dictionary/cache/stats`.
- Самодостаточный модуль: все зависимости внутри `proxy/` (services/, security/, languages.py).
- **Линтинг:** `uv run ruff check proxy/` — без ошибок.
- **Тестирование:** `uv run pytest tests/ -v`.
- **Комментарии:** на простом английском.

## Алгоритм повторений (SM-2)
- Упрощённая версия SM-2. Интервалы растут при правильных ответах, сбрасываются при ошибках.
- **Correct:** Interval grows (1 → 6 → interval × 2.5, capped at 30 days)
- **Wrong:** Interval and repetitions reset to 0.
- Выбор слова: взвешенный рандом, вес = 1 / (interval + 1) × (1 + RT_COEFF × normAvgTime). Меньший интервал и медленнее реакция = выше шанс.
  - RT_COEFF = 1.0 (Reaction Time Coefficient)
  - normAvgTime = clamp(avg_time / 10, 0, 1), null → 1.0 (новые слова — максимальный приоритет)
- Ранг слова (1–100): отображается в словаре вместо интервала. Вычисляется из веса: round(weight / 2.0 × 100), clamp [1, 100]. 100 = показывается чаще всего, 1 = реже всего.
- Статистика: know_count, forgot_count, best_time, avg_time для каждого слова.
- Таймер: потолок 10 сек. После 5 сек — оранжевый, после 10 — красный. Авто-ответ «Не помню» через 10 сек.
- Пауза: при 3 подряд авто-ответах или 30 сек бездействия.

## Дальнейшие планы
- Пагинация по словарю при росте
- CI для кросс-компиляции Tauri (Windows MSI/NSIS, macOS DMG)

---
**Последнее обновление:** 5 августа 2026
