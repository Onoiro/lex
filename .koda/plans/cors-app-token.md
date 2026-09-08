# План: B-2 — CORS whitelist + X-App-Token

**Задача из бэклога:** B-2 (P0). Статус: todo.
**Дата:** 2026-09-08

## Цель

1. Ограничить CORS прокси списком доверенных origin (вместо `allow_origins=["*"]`),
   чтобы сайты-третьи лица не могли использовать браузеры своих посетителей для
   сжигания квот и глобального бюджета.
2. Добавить проверку секретного токена `X-App-Token` на всех API-эндпоинтах
   (кроме health-check `GET /`) — отсечь скрипт-киди и «слепой» сканинг.

## Ключевые решения

- **Токены:** env var `APP_TOKENS=token1,token2` (список через запятую, для ротации).
  Если `APP_TOKENS` не задан/пуст — проверка токена **отключена** (обратная
  совместимость: старые клиенты работают, пока токен не включён на сервере).
- **CORS:** env var `ALLOWED_ORIGINS` (через запятую). Если не задан — дефолтный
  прод-список:
  - `https://lex.2-way.ru` — веб (на случай кросс-доменного вызова прокси)
  - `https://localhost` — Capacitor Android (`androidScheme: "https"`)
  - `capacitor://localhost` — Capacitor iOS (на будущее)
  - `http://tauri.localhost` — Tauri 2 Windows/Linux (WebView2/webkitgtk)
  - `tauri://localhost` — Tauri 2 macOS
  - Dev-origin (`http://localhost:5173` и live-reload хосты) добавляются через
    `ALLOWED_ORIGINS` по мере надобности. В dev-режиме CORS обычно не нужен:
    vite-прокси делает запросы same-origin.
- **Какие эндпоинты защищает токен:** все, кроме `GET /` (health-check для
  UptimeRobot/мониторинга). Т.е. `/translate`, `/tts`, `/dictionary`,
  `/languages`, `/feedback`, `*/cache/stats`.
- **Ответ без токена:** `403 {"error": "unauthorized"}`.
- **OPTIONS (preflight)** токен-проверка не фильтрует — их обрабатывает
  CORSMiddleware.
- **Порядок middleware:** токен-мидлварь добавляется первой, CORS — второй
  (CORS оказывается внешним и вешает заголовки в т.ч. на 403-ответы).
- **allow_headers:** явно `Content-Type`, `X-App-Token` (+ `X-Device-Id` — задел
  под B-5). `max_age=86400` для кеширования preflight.
- **Клиент:** токен вшивается при сборке через `VITE_APP_TOKEN` (build-time env,
  на сервер не попадает и из него не читается). Если пуст — заголовок не шлётся
  (локальная разработка без прокси-токена).

## Порядок выката (важно!)

1. Задеплоить прокси с новым CORS, **без** `APP_TOKENS` → проверка токена
   выключена, все клиенты работают.
2. Выпустить клиент с `VITE_APP_TOKEN` (веб + RuStore + Tauri).
3. Включить `APP_TOKENS` на сервере → клиенты без токена получают 403.
   Старые установки (APK без обновления) сломаются — до B-3 (version gate)
   это осознанный компромисс: включать после того, как большинство обновится.
- **Ротация:** новый релиз = новый токен в конец списка `APP_TOKENS`;
  старый удаляется, когда доля старых версий упадёт.

## Шаги

### 1. Proxy: `proxy/security/token_auth.py`
- Класс `AppTokenAuth`:
  - `__init__` читает `APP_TOKENS` (split по запятой, strip, пустые отбрасываются).
  - `enabled` → `bool(tokens)`.
  - `is_valid(token: str | None) -> bool`.
- Комментарии на простом английском.

### 2. Proxy: `proxy/main.py`
- `token_auth = AppTokenAuth()` + http-middleware:
  - skip `OPTIONS` и `GET /`;
  - если `enabled` и заголовок `X-App-Token` не валиден → 403
    `{"error": "unauthorized"}`.
- CORS: `allow_origins` из `ALLOWED_ORIGINS` (env) либо дефолтный прод-список;
  `allow_methods=["GET", "POST", "OPTIONS"]`; `allow_headers` явно;
  `max_age=86400`.
- Обновить docstring модуля (сейчас там «No auth»).

### 3. Env-документация
- `.env.example`: добавить `APP_TOKENS` и `ALLOWED_ORIGINS` с комментариями
  (docker-compose уже прокидывает `./.env` через `env_file` — изменений не требует).

### 4. Proxy-тесты
- `tests/test_token_auth.py`:
  - `APP_TOKENS` задан: без токена → 403; с верным токеном → 200 (мок translate_word);
    с неверным → 403; `GET /` доступен без токена; OPTIONS preflight не требует токен.
  - `APP_TOKENS` не задан: запрос без токена → 200 (обратная совместимость).
  - Список из нескольких токенов: каждый из них валиден.
- CORS-тесты (в том же файле или `test_cors.py`):
  - preflight с разрешённого origin → 200 + `access-control-allow-origin`;
  - простой запрос с чужим origin → в ответе НЕТ `access-control-allow-origin`
    (браузер такой ответ блокирует);
  - `ALLOWED_ORIGINS` env расширяет/заменяет список.
- `tests/conftest.py`: очищать `APP_TOKENS`/`ALLOWED_ORIGINS` перед тестами
  (monkeypatch), конфигурация читается на уровне модуля — в тестах патчить
  атрибуты инстансов (`proxy.main.token_auth`, список origins) с восстановлением.

### 5. Client: общий модуль прокси-заголовков
- Новый `client/src/services/proxyClient.ts`:
  - `PROXY_URL` (перенос из сервисов), `APP_TOKEN = import.meta.env.VITE_APP_TOKEN ?? ""`;
  - `proxyHeaders()` → `{ "Content-Type": "application/json", "X-App-Token": ... }`
    (заголовок токена добавляется только если токен непустой).
- Рефакторинг 4 сервисов на `proxyHeaders()`: `translateApi.ts`, `ttsApi.ts`,
  `dictionaryApi.ts`, `feedbackApi.ts`.

### 6. Client: env-документация
- `client/.env.example`: `VITE_PROXY_URL`, `VITE_APP_TOKEN` с комментариями
  (для каких платформ какой прокси-URL).

### 7. Client-тесты
- Проверить существующие тесты сервисов (`client/src/test/`) — если где-то
  ассертятся заголовки запроса, обновить.
- Новый тест: заголовок `X-App-Token` отправляется, когда `VITE_APP_TOKEN`
  задан (`vi.stubEnv` + `vi.resetModules()` + динамический import модуля,
  т.к. env читается на уровне модуля); и не отправляется, когда пуст.

### 8. Верификация
- `uv run pytest tests/ -v` — все зелёные.
- `uv run ruff check proxy/` — 0 ошибок.
- `cd client && npm run lint && npm run test && npm run build`.

### 9. Документация
- `README.md`: env-переменные прокси (`APP_TOKENS`, `ALLOWED_ORIGINS`),
  клиентская (`VITE_APP_TOKEN`), краткий раздел о защите API.
- `KODA.md`: правила Proxy (токен, CORS, коды ошибок 403), Client (proxyClient.ts,
  VITE_APP_TOKEN), структура (token_auth.py, proxyClient.ts), версия.
- `.koda/backlog.md`: B-2 → done (дата, коммит).

### 10. semver-checker + коммит
- Minor bump: 1.19.2 → 1.20.0 (новая функциональность), versionCode 60.
- 4 файла: `pyproject.toml`, `client/package.json`,
  `client/src-tauri/tauri.conf.json`, `client/android/app/build.gradle` + `uv.lock`.
- Сообщение коммита с указанием бампа версии.

## Критерии готовности (из бэклога)
- Запрос без токена (при включённой проверке) → 403. ✅ тестами
- Запрос с чужого Origin → нет CORS-заголовков (браузер блокирует). ✅ тестами
- Клиент работает на всех 3 платформах (веб/Capacitor/Tauri — origin'ы в whitelist). ✅
- Тесты, линт, сборка зелёные. ✅
