[![CI](https://github.com/Onoiro/lex/actions/workflows/ci.yml/badge.svg)](https://github.com/Onoiro/lex/actions/workflows/ci.yml)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=Onoiro_lex&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=Onoiro_lex)
[![Coverage](https://sonarcloud.io/api/project_badges/measure?project=Onoiro_lex&metric=coverage)](https://sonarcloud.io/summary/new_code?id=Onoiro_lex)
[![Maintainability Rating](https://sonarcloud.io/api/project_badges/measure?project=Onoiro_lex&metric=sqale_rating)](https://sonarcloud.io/summary/new_code?id=Onoiro_lex)
[![Security Rating](https://sonarcloud.io/api/project_badges/measure?project=Onoiro_lex&metric=security_rating)](https://sonarcloud.io/summary/new_code?id=Onoiro_lex)
[![Reliability Rating](https://sonarcloud.io/api/project_badges/measure?project=Onoiro_lex&metric=reliability_rating)](https://sonarcloud.io/summary/new_code?id=Onoiro_lex)

# Lex

Lex is a local-first translator and vocabulary trainer. Your dictionary, spaced repetition, and settings are stored locally on your device — no account needed, no server required. Internet is only needed for translation via a thin proxy to Yandex Translate API.

**Try it live:** [lex.2-way.ru](https://lex.2-way.ru)

## Features

- **Local-first** — Dictionary, SRS, and settings stored in IndexedDB (Dexie.js). Works offline.
- **Translate words** — Auto-translate from 100+ languages via Yandex Translate API (through proxy)
- **Spaced repetition (SM-2)** — Words you forget more often appear more frequently in reviews
- **Response time tracking** — Best/average times, live timer with color thresholds
- **Auto-answer & pause** — Auto-records "Forgot" after 10s, pauses after 3 consecutive auto-answers or 30s inactivity
- **PWA** — Installable, offline-capable via service worker
- **Android** — Native app via Capacitor (RuStore, AppGallery)
- **Desktop** — Native installers via Tauri (Windows MSI/NSIS, macOS DMG, Linux deb/AppImage)
- **i18n** — English and Russian UI
- **Import/Export** — Migrate dictionary from old server or backup as JSON

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Client (React)                   │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────┐  │
│  │   Pages   │ │  Domain  │  │  Data (Dexie/IDB) │  │
│  │  (React)  │ │  (SRS)   │  │  wordRepository   │  │
│  └────┬─────┘  └──────────┘  └───────────────────┘  │
│       │                                             │
│       ▼                                             │
│  ┌──────────────┐                                   │
│  │ translateApi │ ──── HTTP ────► Proxy (FastAPI)   │
│  └──────────────┘                (Yandex API key)   │
└─────────────────────────────────────────────────────┘
```

## Tech Stack

### Client (`client/`)
- React 19, TypeScript (strict), Vite 7
- Dexie.js (IndexedDB) for local storage
- Pico CSS for styling
- vite-plugin-pwa for offline support
- Capacitor 8 for Android
- Tauri 2 for Desktop
- Vitest + fake-indexeddb for testing

### Proxy (`proxy/`)
- Python 3.13, FastAPI
- Hides Yandex API key
- Endpoints: POST `/translate`, GET `/languages`
- Rate limiting, translation cache

### Old server (root, being decommissioned)
- Python 3.13, FastAPI, SQLAlchemy, Jinja2
- SQLite database
- `/export` endpoint for migration to local-first client

## Quick Start

### Client (PWA)

```bash
cd client
npm install
npm run dev          # http://localhost:5173
npm run build        # production build → dist/
npm run test         # vitest (73 tests)
npm run lint         # eslint
```

### Proxy

```bash
cd proxy
pip install -r requirements.txt
uvicorn main:app --port 8004
```

Set `VITE_PROXY_URL` in `client/.env` if proxy runs on a different origin.

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

Requires Rust + system libraries (see [Tauri prerequisites](https://tauri.app/start/prerequisites/)).

### Old server (for migration only)

```bash
make run    # http://localhost:8003
make lint   # ruff
make test   # pytest
```

### Docker

```bash
make d-build  # docker compose build
make d-run    # docker compose up -d
```

## Migration (old server → local-first client)

1. Start the old server and go to `/export` (requires authentication)
2. Save the JSON response as a file
3. Open the client app → Dictionary → Import
4. Select the JSON file — duplicates are skipped, missing fields get defaults

## Usage

### Adding Words

1. Go to **Translate** page
2. Enter a word (language auto-detected, configurable in Settings)
3. Click **Translate** to get auto-translation, or enter manually
4. Click **Save to dictionary**

### Reviewing Words

1. Go to **Review** page → click **Start training**
2. A word appears — try to recall the translation
3. Click **I know** or **I don't remember**
4. Timer: green (record), orange (5s), red (10s). Auto-answer after 10s.
5. Training pauses after 3 consecutive auto-answers or 30s inactivity.

### Dictionary

- View all words with stats (known/forgotten, best/avg time, interval, success rate)
- Search, delete, export, and import words

## Spaced Repetition Algorithm

Simplified SM-2:
- **Correct:** Interval grows (1 → 6 → 15 → 30 days, capped at 30)
- **Wrong:** Interval resets to 0
- **Selection:** Weighted random — weight = 1 / (interval + 1)
- **Stats:** know_count, forgot_count, best_time, avg_time per word

## Development

### Client commands

```bash
cd client
npx tsc --noEmit      # type-check
npm run build         # vite build
npm run lint          # eslint
npm run test          # vitest
```

### Server commands

```bash
make run              # dev server (port 8003)
make lint             # ruff
make test             # pytest
make test-cov         # coverage (XML + HTML)
```

### Project Structure

```
.
├── client/                    # Local-first client app
│   ├── src/
│   │   ├── components/        # Layout, OfflineIndicator
│   │   ├── data/              # db.ts, wordRepository, settingsRepository
│   │   ├── domain/            # srs.ts, stats.ts, validators.ts
│   │   ├── i18n/              # index.ts, languages.ts, en/ru.json
│   │   ├── pages/             # Home, Add, Review, Dictionary, Settings
│   │   ├── services/          # translateApi.ts
│   │   └── types/             # Word, LanguageSettings
│   ├── capacitor.config.ts    # Android config
│   ├── src-tauri/             # Desktop (Tauri 2)
│   ├── android/               # Capacitor Android project
│   └── vite.config.ts         # Vite + PWA plugin
├── proxy/                     # Translate proxy (FastAPI, port 8004)
├── main.py                    # Old server (decommissioning)
├── tests/                     # Old server tests
├── pyproject.toml             # Python config (uv, ruff)
├── Makefile                   # Build/run scripts
└── docker-compose.yml         # Docker (proxy + old server)
```

## License

This project may be used for personal or non-commercial purposes.