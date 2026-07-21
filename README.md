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
- **Import/Export** — Backup and transfer dictionary between devices as JSON

## Architecture

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
- **Proxy:** FastAPI, port 8004. Hides Yandex API key. Endpoints: POST `/translate`, GET `/languages`

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
- Hides Yandex API key, rate limiting, translation cache
- Endpoints: POST `/translate`, GET `/languages`

## Quick Start

### Prerequisites

- Node.js 22+ and npm
- Python 3.13+ with [uv](https://docs.astral.sh/uv/)
- (Optional) Rust + system libraries for [Tauri](https://tauri.app/start/prerequisites/)
- (Optional) Android SDK + JDK for Capacitor builds

### Local Development

Two terminals:

```bash
# Terminal 1: translate proxy (port 8004)
make proxy

# Terminal 2: client dev server (port 5173)
make client-dev
```

Open http://localhost:5173 — Vite proxies `/translate` and `/languages` to the proxy automatically.

### Production Deploy

On the server:

```bash
git pull origin master
make deploy          # builds client + rebuilds proxy Docker container
```

Nginx serves `client/dist/` as static files and proxies `/translate`, `/languages` to the Docker container on port 8004.

### Docker (proxy only)

```bash
make d-build         # build image
make d-run           # start container (detached)
make d-logs          # follow logs
make d-rebuild       # rebuild and restart
make d-down          # stop and remove
```

### Android (Capacitor)

```bash
make android-build   # builds client, syncs Capacitor, assembles release APK
# APK: client/android/app/build/outputs/apk/release/
```

### Desktop (Tauri)

```bash
make tauri-dev       # dev mode
make tauri-build     # production installers
# Bundles: client/src-tauri/target/release/bundle/
```

Requires Rust + system libraries (see [Tauri prerequisites](https://tauri.app/start/prerequisites/)).

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

### Transferring Dictionary Between Devices

Since Lex is local-first, each device has its own independent dictionary (stored in browser IndexedDB). To move your dictionary to another device:

1. Open **Dictionary** on the source device
2. Click **Export** — downloads `lex-dictionary.json`
3. Open **Dictionary** on the target device
4. Click **Import** and select the JSON file
5. Duplicates are automatically skipped, missing fields get defaults

## Spaced Repetition Algorithm

Simplified SM-2:
- **Correct:** Interval grows (1 → 6 → 15 → 30 days, capped at 30)
- **Wrong:** Interval resets to 0
- **Selection:** Weighted random — weight = 1 / (interval + 1)
- **Stats:** know_count, forgot_count, best_time, avg_time per word

## Development

### All Commands

All commands are run via `make`. Run `make help` to see the full list.

| Command | Description |
|---|---|
| `make proxy` | Start translate proxy (port 8004) |
| `make client-dev` | Start client dev server (port 5173) |
| `make client-build` | Build client for production |
| `make client-test` | Run client tests (vitest, 113 tests) |
| `make client-lint` | Lint client code (eslint) |
| `make client-typecheck` | Type-check client (tsc) |
| `make proxy-lint` | Lint proxy code (ruff) |
| `make proxy-test` | Run proxy tests (pytest) |
| `make check` | Run all checks (client + proxy) |
| `make android-build` | Build Android APK |
| `make tauri-dev` | Start Tauri desktop dev mode |
| `make tauri-build` | Build desktop installers |
| `make deploy` | Deploy: build client + rebuild proxy container |
| `make d-build` | Build Docker image |
| `make d-run` | Start Docker container |
| `make d-rebuild` | Rebuild and restart Docker container |
| `make clean` | Clean caches and coverage reports |

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
│   └── vite.config.ts         # Vite + PWA plugin + dev proxy
├── proxy/                     # Translate proxy (FastAPI, port 8004)
│   ├── main.py                # /translate, /languages
│   └── requirements.txt
├── tests/                     # Proxy tests (pytest)
├── pyproject.toml             # Python config (uv, ruff)
├── Makefile                   # All build/run/deploy commands
└── docker-compose.yml         # Docker (proxy only)
```

## License

This project may be used for personal or non-commercial purposes.
