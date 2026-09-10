[![CI](https://github.com/Onoiro/lex/actions/workflows/ci.yml/badge.svg)](https://github.com/Onoiro/lex/actions/workflows/ci.yml)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=Onoiro_lex&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=Onoiro_lex)
[![Coverage](https://sonarcloud.io/api/project_badges/measure?project=Onoiro_lex&metric=coverage)](https://sonarcloud.io/summary/new_code?id=Onoiro_lex)
[![Maintainability Rating](https://sonarcloud.io/api/project_badges/measure?project=Onoiro_lex&metric=sqale_rating)](https://sonarcloud.io/summary/new_code?id=Onoiro_lex)
[![Security Rating](https://sonarcloud.io/api/project_badges/measure?project=Onoiro_lex&metric=security_rating)](https://sonarcloud.io/summary/new_code?id=Onoiro_lex)
[![Reliability Rating](https://sonarcloud.io/api/project_badges/measure?project=Onoiro_lex&metric=reliability_rating)](https://sonarcloud.io/summary/new_code?id=Onoiro_lex)

# Lex

Lex is a translator and vocabulary trainer. Your dictionary, spaced repetition, and settings are stored locally on your device - no account needed, no server required. Internet is only needed for translation via a thin proxy to Yandex Translate API.

**Try it live:** [lex.2-way.ru](https://lex.2-way.ru)

## Features

- **Local-first** - Dictionary, SRS, and settings stored in IndexedDB (Dexie.js). Works offline.
- **Translate words** - Auto-translate from 100+ languages via Yandex Translate API (through proxy)
- **Spaced repetition (SM-2)** - Words you forget more often appear more frequently in reviews
- **Daily stats** - Review results and new words are saved per day: today's progress, day streak, and 14-day history on the Review page
- **Response time tracking** - Best/average times, live timer with color thresholds
- **Auto-answer & pause** - Auto-records "Forgot" after 10s, pauses after 3 consecutive auto-answers or 30s inactivity
- **TTS** - Text-to-speech for words and translations via Yandex SpeechKit
- **Usage limits** - 500 chars per request, 500 chars/day translation and TTS quotas per IP (resets at midnight UTC); repeated requests are served from cache and do not count against the quota
- **API protection** - CORS origin whitelist + shared app token (`X-App-Token` header) on all proxy endpoints; global daily char budget as a financial safety net
- **Example sentences** - Load corpus examples from Yandex Dictionary into the note field on the Translate page
- **PWA** - Installable, offline-capable via service worker
- **Android** - Native app via Capacitor (RuStore, AppGallery)
- **Desktop** - Native installers via Tauri (Windows MSI/NSIS, macOS DMG, Linux deb/AppImage)
- **i18n** - English and Russian UI
- **Import/Export** - Backup and transfer dictionary between devices as JSON
- **Dictionary sorting** - Sort by date added, word, review count, response time, rank, or success rate (ascending/descending), with contextual descriptions
- **Reset all data** - Permanently delete all words and settings from the device (with double confirmation)
- **Feedback** - Send bug reports, ideas, or messages to the developer directly from Settings (via Telegram Bot)

## Architecture

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
- **Proxy:** FastAPI, port 8004. Hides Yandex API key. Endpoints: POST `/translate`, GET `/languages`, POST `/tts`, GET `/`, GET `/cache/stats`, GET `/tts/cache`, POST `/dictionary`, GET `/dictionary/cache`, POST `/feedback`

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
- Hides Yandex API key, rate limiting, daily usage quotas, global daily budget, app token check, CORS whitelist, translation cache, TTS (text-to-speech), dictionary examples (Yandex Corpus), feedback (Telegram Bot)
- Endpoints: POST `/translate`, GET `/languages`, POST `/tts`, GET `/`, GET `/cache/stats`, GET `/tts/cache/stats`, POST `/dictionary`, GET `/dictionary/cache/stats`, POST `/feedback`

### API Protection (proxy)

Layers of protection (see `.env.example` for configuration):

- **App token** — clients send a shared secret in the `X-App-Token` header (baked in at build time via `VITE_APP_TOKEN`). The proxy validates it against `APP_TOKENS` (comma-separated list for rotation). Unset `APP_TOKENS` disables the check (backward compatibility during rollout). Missing/invalid token → `403 {"error": "unauthorized"}`. `GET /` (health check) stays open.
- **Client version gate** — clients send their app version in the `X-App-Version` header (injected at build time from `package.json`). The proxy compares it against `MIN_APP_VERSION` (semver). Unset `MIN_APP_VERSION` disables the check (same rollout pattern as the app token: deploy proxy → release clients → enable on server). Outdated/missing/unparseable version → `426 {"error": "update_required", "min_version": "..."}`; the client then shows a full-screen "update the app" screen. `GET /` and preflight stay open.
- **CORS whitelist** — only client app origins are allowed (`ALLOWED_ORIGINS` env var, defaults: `https://lex.2-way.ru`, `https://localhost` (Capacitor Android), `capacitor://localhost` (iOS), `http://tauri.localhost` / `tauri://localhost` (Tauri)). Requests from other origins get no CORS headers, so browsers block them.
- **Rate limiting** — 30 req/min per endpoint per IP, feedback 3/hour.
- **Daily quotas** — 500 chars/day translation + 500 chars/day TTS per IP → `429 {"error": "daily_quota_exceeded"}`.
- **Global daily budget** — hard stop for all users combined (`GLOBAL_DAILY_CHAR_LIMIT`, default 300 000 chars/day) → `503 {"error": "service_overloaded"}`.
- **Max text length** — 500 chars per request → `400 {"error": "text_too_long"}`.

Cache hits (server-side and client TTS cache) never consume quotas or the budget.

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

Open http://localhost:5173 - Vite proxies `/translate` and `/languages` to the proxy automatically.

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
3. Change source/target languages for this session if needed - changes are temporary and do not affect global Settings. A banner appears when languages differ from the default, with a link to save them in Settings
4. Click **Translate** to get auto-translation, or enter manually
5. Click **Save to dictionary**
6. (Optional) Click **Load example** to fetch an example sentence from Yandex Dictionary corpus into the note field

### Reviewing Words

1. Go to **Review** page → click **Start training**
2. A word appears - try to recall the translation
3. Click **I know** or **I don't remember**
4. Timer: green (record), orange (5s), red (10s). Auto-answer after 10s.
5. Training pauses after 3 consecutive auto-answers or 30s inactivity.
6. Before training: today's stats (reviews, accuracy, new words, day streak), a collapsible 14-day history, and a "How does it work?" help block explaining the algorithm in plain language. Every answer is saved into daily stats immediately.

### Dictionary

- View all words with stats (known/forgotten, best/avg time, rank, success rate)
- Search, delete, export, and import words

### Transferring Dictionary Between Devices

Since Lex is local-first, each device has its own independent dictionary (stored in browser IndexedDB). To move your dictionary to another device:

1. Open **Dictionary** on the source device
2. Click **Export** - downloads `lex-dictionary.json`
3. Open **Dictionary** on the target device
4. Click **Import** and select the JSON file
5. Duplicates are automatically skipped, missing fields get defaults

## Spaced Repetition Algorithm

Simplified SM-2:
- **Correct:** Interval grows (1 → 6 → interval × 2.5, capped at 30 days)
- **Correct with hint:** Answer counts, but the interval is half the usual value and repetitions do not advance (hint_count is tracked per word)
- **Wrong:** Interval resets to 0
- **Selection:** Weighted random - weight = 1 / (interval + 1) × (1 + RT_COEFF × normAvgTime)
  - RT_COEFF = 1.0 (Reaction Time Coefficient) - slower recall increases review frequency
  - normAvgTime = clamp(avg_time / 10, 0, 1), null → 1.0 (new words get max priority)
- **Hint timing:** When a hint is opened, the timer freezes - only the time before the hint counts toward avg_time and daily stats; best_time is not updated
- **Rank:** Each word has a rank (1-100) shown in the dictionary, computed from its weight. 100 = shown most often, 1 = shown least often.
- **Stats:** know_count, forgot_count, hint_count, best_time, avg_time per word

## Development

### All Commands

All commands are run via `make`. Run `make help` to see the full list.

| Command | Description |
|---|---|
| `make proxy` | Start translate proxy (port 8004) |
| `make client-dev` | Start client dev server (port 5173) |
| `make client-build` | Build client for production |
| `make client-test` | Run client tests (vitest, 299 tests) |
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
│   │   ├── data/              # db.ts, wordRepository, settingsRepository, dailyStatsRepository
│   │   ├── domain/            # srs.ts, stats.ts, validators.ts, dictionarySort.ts, dailyStats.ts
│   │   ├── i18n/              # index.ts, languages.ts, en/ru.json
│   │   ├── pages/             # Home, Add, Review, Dictionary, Settings, Privacy, Terms
│   │   ├── services/          # proxyClient.ts, translateApi.ts, ttsApi.ts, dictionaryApi.ts, feedbackApi.ts, updateGate.ts, theme.ts
│   │   ├── test/              # Component and service tests (Vitest)
│   │   └── types/             # Word, LanguageSettings, DailyStats
│   ├── capacitor.config.ts    # Android config
│   ├── src-tauri/             # Desktop (Tauri 2)
│   ├── android/               # Capacitor Android project
│   └── vite.config.ts         # Vite + PWA plugin + dev proxy
├── proxy/                     # Translate proxy (FastAPI, port 8004)
│   ├── main.py                # /translate, /languages, /tts, /dictionary, /feedback, /cache/stats, /tts/cache/stats, /dictionary/cache/stats
│   ├── languages.py           # Language metadata
│   ├── services/
│   │   ├── translator.py      # Yandex Translate API client
│   │   ├── cache.py           # Translation cache (TTL)
│   │   ├── tts.py             # Yandex SpeechKit TTS client
│   │   ├── dictionary.py      # Yandex Dictionary corpus client
│   │   └── feedback.py        # Telegram Bot feedback service
│   ├── security/
│   │   ├── rate_limiter.py    # Rate limiting
│   │   ├── quota.py           # Daily char quotas per IP + global budget
│   │   ├── token_auth.py      # X-App-Token check
│   │   └── version_gate.py    # X-App-Version check (min client version)
│   ├── Dockerfile
│   └── requirements.txt
├── tests/                     # Proxy tests (pytest)
├── pyproject.toml             # Python config (uv, ruff)
├── Makefile                   # All build/run/deploy commands
└── docker-compose.yml         # Docker (proxy only)
```

## License

This project may be used for personal or non-commercial purposes.

## Contact

Questions or feedback? Email: donoriono@gmail.com
