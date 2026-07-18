# KODA.md — Контекст проекта Lex

## Обзор проекта
Lex — local-first приложение-переводчик и помощник для запоминания слов. Словарь, spaced repetition (SM-2) и настройки хранятся локально на устройстве (IndexedDB через Dexie.js). Интернет нужен только для перевода через тонкий proxy к Yandex Translate API. Распространение: PWA, Android (RuStore/AppGallery через Capacitor), Desktop (Tauri).

**Демо:** [lex.2-way.ru](https://lex.2-way.ru)

**Текущая версия:** 0.11.7

## Архитектура

```
┌─────────────────────────────────────────────────────┐
│                    Client (React)                    │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────┐  │
│  │   Pages   │  │  Domain  │  │  Data (Dexie/IDB) │  │
│  │  (React)  │  │  (SRS)   │  │  wordRepository   │  │
│  └────┬─────┘  └──────────┘  └───────────────────┘  │
│       │                                              │
│       ▼                                              │
│  ┌──────────────┐                                   │
│  │ translateApi │ ──── HTTP ────► Proxy (FastAPI)   │
│  └──────────────┘                (Yandex API key)   │
└─────────────────────────────────────────────────────┘
```

- **Client:** React 19 + TypeScript, Vite 7, Dexie.js (IndexedDB), Pico CSS, vite-plugin-pwa
- **Proxy:** FastAPI, порт 8004. Скрывает Yandex API key. Эндпоинты: POST `/translate`, GET `/languages`
- **Old server:** FastAPI + SQLAlchemy + Jinja2 (выводится из эксплуатации, остаётся только `/export` для миграции)

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
- **Управление пакетами:** pip (requirements.txt)
- **Порт:** 8004

### Old server (корень проекта)
- **Язык:** Python 3.13
- **Фреймворк:** FastAPI + SQLAlchemy 2.0 + Jinja2
- **База данных:** SQLite
- **Управление пакетами:** uv
- **Линтинг:** ruff
- **Тестирование:** pytest

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
uvicorn main:app --port 8004
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

### Old server (для миграции)
```bash
make run    # порт 8003
make lint   # ruff
make test   # pytest
```

### Docker (proxy + old server)
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
│   │   ├── domain/            # srs.ts (SM-2), stats.ts, validators.ts
│   │   ├── i18n/              # index.ts, languages.ts, en.json, ru.json
│   │   ├── pages/             # Home, Add, Review, Dictionary, Settings
│   │   ├── services/          # translateApi.ts (proxy client)
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
│   ├── main.py                # /translate, /languages
│   └── requirements.txt
├── main.py                    # Old server (выводится из эксплуатации)
├── database.py                # Old SQLAlchemy setup
├── models.py                  # Old Word model
├── security/                  # Old auth, CSRF, rate limiter, validators
├── services/                  # Old translator, cache
├── i18n/                      # Old server-side i18n
├── templates/                 # Old Jinja2 templates
├── tests/                     # Old server tests (pytest)
├── static/                    # Old static assets
├── pyproject.toml             # Python project config (uv, ruff)
├── Makefile                   # Build/run scripts
├── docker-compose.yml         # Docker (proxy + old server)
└── .env                       # YANDEX_API_KEY, auth config
```

## Правила разработки

### Client
- **Импорты:** alias `@/` → `client/src/`
- **Тестирование:** Vitest + fake-indexeddb. Все новые функции покрываются тестами.
- **Линтинг:** `npx eslint .` — 0 ошибок. Предупреждения — некритичные (react-refresh, react-hooks/exhaustive-deps).
- **Комментарии:** на простом английском, понятном non-native speakers.
- **Стиль:** Pico CSS (без классов), Material Design принципы.
- **i18n:** все UI-строки через `t()` из `@/i18n`. Переводы в `en.json` и `ru.json`.
- **PWA:** vite-plugin-pwa генерирует SW. Runtime cache для `/translate` и `/languages` (NetworkFirst).
- **VITE_PROXY_URL:** env var для proxy base URL (пустая строка = relative path).

### Proxy
- Скрывает Yandex API key. Rate limiting. Кэш переводов.
- Эндпоинты: POST `/translate` (body: word, source_lang, target_lang), GET `/languages`.

### Old server
- **Управление зависимостями:** только `uv`.
- **Линтинг:** `make lint` (ruff). Без ошибок.
- **Комментарии:** на простом английском.
- **База данных:** SQLite, не коммитить.
- **Версионирование:** `pyproject.toml`, семантическое версионирование 0.x.
- **Переменные окружения:** `.env` (YANDEX_API_KEY, auth).

## Алгоритм повторений (SM-2)
- Упрощённая версия SM-2. Интервалы растут при правильных ответах, сбрасываются при ошибках.
- Потолок интервала: 30 дней.
- Выбор слова: взвешенный рандом, вес = 1 / (интервал + 1). Меньший интервал = выше шанс.
- Статистика: know_count, forgot_count, best_time, avg_time для каждого слова.
- Таймер: потолок 10 сек. После 5 сек — оранжевый, после 10 — красный. Авто-ответ «Не помню» через 10 сек.
- Пауза: при 3 подряд авто-ответах или 30 сек бездействия.

## Миграция (old server → client)
1. GET `/export` на старом сервере (требует auth) → JSON-массив всех слов.
2. В клиенте: Dictionary → Import → загрузить JSON-файл.
3. Дубликаты пропускаются, недостающие поля заполняются значениями по умолчанию.

## Дальнейшие планы
- Вывести старый сервер из эксплуатации (оставить только proxy)
- Добавить тёмную тему (Pico CSS поддерживает)
- Пагинация и поиск по словарю при росте
- CI для кросс-компиляции Tauri (Windows MSI/NSIS, macOS DMG)

---
**Последнее обновление:** 17 июля 2026