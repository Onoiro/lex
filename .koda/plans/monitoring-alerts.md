# План: мониторинг, алерты и ежедневный отчёт (Telegram)

## Контекст

Подготовка к размещению в маркетплейсах: нужен контроль и мониторинг прокси.
Сейчас в прокси нет логирования и метрик — только HTTP-ответы. Решение:
лёгкий слой наблюдаемости без внешних зависимостей (Sentry/Grafana не нужны):
счётчики в памяти + дневная персистентность в существующую SQLite БД +
алерты и ежедневный отчёт через уже подключённого Telegram-бота
(`TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID`, как в `feedback.py`).

Только proxy, клиент не затрагивается.

## Ключевые решения

- **Не логировать контент запросов** (слова пользователей) — только длины,
  языки, коды ответов. Privacy: в Политике конфиденциальности логирование
  контента не обещано.
- **Метрики — агрегаты, не логи**: счётчики в памяти (dict + Lock, копейки
  на запрос) + инкрементальная запись в SQLite-таблицы в той же БД
  (`SQLITE_CACHE_PATH`), чтобы отчёт переживал рестарт контейнера.
- **Алерты с анти-флаппингом**: каждый алерт срабатывает один раз на ключ
  (бюджет: один раз на порог в день; всплески: один раз на часовой бакет;
  SQLite-fallback: один раз в день). Иначе Telegram замусорится.
- **Алерты fire-and-forget**: сбой отправки не влияет на ответ пользователю
  (паттерн как в `feedback.py`: sync httpx через run_in_executor).
- **Личные квоты пользователей (500/день) не алертим** — их исчерпание
  норма. Алертим только глобальный бюджет (деньги) и аномалии.
- **Ежедневный отчёт** — asyncio background task в lifespan FastAPI:
  спит до 00:05 UTC, читает вчерашние метрики из SQLite, шлёт отчёт, цикл.
  Не запускается, если Telegram не настроен.
- **Пороги через env** — тот же паттерн, что у всех настроек прокси.

## Алерты (немедленные)

| Событие | Условие | Дедуп |
|---|---|---|
| Бюджет 80% | used ≥ 80% `GLOBAL_DAILY_CHAR_LIMIT` после списания | 1 раз на порог в день |
| Бюджет 100% | `try_consume` вернул False (503) | 1 раз в день |
| Всплеск 502 | ≥ 5 за текущий часовой бакет UTC | 1 раз на бакет |
| Всплеск 403 | ≥ 100 за час | 1 раз на бакет |
| Всплеск 426 | ≥ 50 за час | 1 раз на бакет |
| Всплеск 429 | ≥ 100 за час | 1 раз на бакет |
| SQLite fallback | `_init_failed` в кэше/квотах | 1 раз в день |

Env: `ALERT_BUDGET_WARN_PERCENT=80`, `ALERT_HOURLY_502=5`, `ALERT_HOURLY_403=100`,
`ALERT_HOURLY_426=50`, `ALERT_HOURLY_429=100`.

## Ежедневный отчёт (00:05 UTC, за прошедший день UTC)

- Потрачено символов: translate / TTS отдельно, % глобального бюджета,
  сравнение с позавчера (↑/↓)
- Уникальные device ID, уникальные IP
- Запросы по эндпоинтам (translate/tts/dictionary/languages/quota/feedback)
- Cache hit rate: переводы, TTS (сколько денег сэкономил кэш)
- Ошибки за день: 400/403/426/429/502/503
- Feedback-сообщений получено

## Шаги

1. [ ] **`proxy/services/metrics.py` — счётчики и дневная персистентность**
    - Класс `Metrics` (синглтон `metrics`):
      - in-memory счётчики: `inc(key, n=1)` — dict + Lock;
      - часовые бакеты для всплесков: `inc_hourly(key)` — ключ
        `(час UTC "YYYY-MM-DDTHH", key)`, `get_hourly(key, hour)`;
      - уникальные устройства/IP: in-memory set на день + `INSERT OR IGNORE`
        в SQLite только при первом появлении в процессе (запись в БД только
        для новых — не на каждый запрос); `count_uniques(kind, day)`;
      - дневная персистентность: таблица `metrics_daily (day, key, value,
        PK(day, key))`, атомарный UPSERT-инкремент `bump_daily(day, key, n)`;
        таблица `metrics_uniques (day, kind, ident, PK(day, kind, ident))`;
      - graceful degradation при сбое БД — как в `SqliteCache`
        (ленивое соединение, `_init_lock`, `_init_failed`, без исключений);
      - `get_day(day) -> dict[key, value]` для отчёта и `/metrics`.
    - Использует `_resolve_db_path()` из `proxy/services/cache.py`
      (та же БД, тот же volume `lex-cache`).
    - Навыки: koda-coder
    - Файлы:
        - proxy/services/metrics.py

2. [ ] **`proxy/services/notifier.py` — Telegram-алерты**
    - `is_configured()` — оба env заданы (как `feedback.py`);
    - `send_alert(text, dedup_key, cooldown_hours)` — async, sync httpx
      через `run_in_executor` (паттерн `feedback.py`);
    - анти-флаппинг: in-memory map `dedup_key -> время последней отправки`,
      отправка только если ключ не отправлялся в течение cooldown;
    - `notify(text, dedup_key, cooldown_hours)` — fire-and-forget обёртка
      (создаёт задачу, проглатывает исключения) для вызовов из хендлеров.
    - Навыки: koda-coder
    - Файлы:
        - proxy/services/notifier.py

3. [ ] **Интеграция метрик и алертов в `proxy/main.py` + хук SQLite-fallback**
    - Инкременты во всех ветках ответов: коды статусов
      (`status_200/400/403/426/429/502/503` — 403/426 в middleware),
      запросы по эндпоинтам, cache hits (`translate_cached`, `tts_cached`),
      потраченные символы (`chars_translate`, `chars_tts`), uniques
      (device_id/ip), `feedback_received`;
    - алерт бюджета: после `global_budget.try_consume` (успех) — проверка
      процента used, порог `ALERT_BUDGET_WARN_PERCENT` (дедуп
      `budget:80:{day}`); при False (503) — алерт `budget:100:{day}`;
    - алерты всплесков: после инкремента часового бакета 502/403/426/429 —
      проверка порога env (дедуп — сам бакет + ключ);
    - SQLite-fallback: в `SqliteCache._connect` и
      `PersistentQuotaStore._connect` при переходе в `_init_failed` —
      вызов `metrics.note_db_fallback()` (лёгкий хук, без импорта notifier
      в cache.py — алерт шлёт main.py-уровень/сам metrics через notifier);
      дедуп `sqlite_fallback:{day}`;
    - счётчики не должны влиять на ответы: все вызовы — простые dict-операции.
    - Навыки: koda-coder
    - Файлы:
        - proxy/main.py
        - proxy/services/cache.py
        - proxy/security/quota.py
        - proxy/services/metrics.py

4. [ ] **`proxy/services/report.py` + фоновая задача ежедневного отчёта**
    - `build_report_text(day, prev_day)` — чистая функция: читает
      `metrics.get_day(day)` и `get_day(prev_day)`, формирует текст отчёта
      (emoji-заголовки, сравнение ↑/↓, проценты, hit rate);
    - `seconds_until_next_report(now)` — чистая функция: до 00:05 UTC;
    - lifespan в `main.py` (FastAPI `lifespan`): при старте, если
      `notifier.is_configured()`, запускает asyncio-задачу: sleep до 00:05
      UTC → `build_report_text(вчера, позавчера)` → `send_alert` → цикл;
    - задача не стартует без Telegram-конфигурации (и в тестах — см. шаг 6).
    - Навыки: koda-coder
    - Файлы:
        - proxy/services/report.py
        - proxy/main.py

5. [ ] **`GET /metrics` эндпоинт (token-protected)**
    - Возвращает счётчики за сегодня UTC (запросы, символы, ошибки, uniques,
      cache hits) — для отладки и внешнего мониторинга curl-ом;
    - защищён существующей token-мiddleware (все эндпоинты кроме `GET /`);
      `GET /` не меняем (не светим метрики наружу).
    - Навыки: koda-coder
    - Файлы:
        - proxy/main.py

6. [ ] **`.env.example` + `tests/conftest.py`**
    - `.env.example`: задокументировать `ALERT_*` и поведение
      (пустые TELEGRAM_* = алерты и отчёт выключены);
    - conftest: в `clear_env_vars` добавить удаление `TELEGRAM_BOT_TOKEN` и
      `TELEGRAM_CHAT_ID` — иначе локальные тесты с реальным `.env` шлют
      настоящие алерты в Telegram (тот же класс проблемы, что с
      YANDEX_API_KEY из готчи f49f393).
    - Навыки: koda-coder
    - Файлы:
        - .env.example
        - tests/conftest.py

7. [ ] **Тесты (pytest)**
    - `test_metrics.py`: инкременты, часовые бакеты, дневная персистентность
      (переживает пересоздание объекта — читает из той же БД), uniques
      (дедуп, count), graceful degradation (битый путь БД);
    - `test_notifier.py`: is_configured, дедуп/cooldown (мок httpx —
      отправка ровно один раз на ключ), fire-and-forget не бросает исключений;
    - `test_alerts.py`: бюджет 80% → один алерт на день (второе пересечение
      молчит), 503 → алерт budget:100, всплеск 502 (5 штук за час → алерт,
      6-я молчит), 403/426/429 аналогично, SQLite-fallback → один алерт/день;
      мок `notifier`/httpx, никаких реальных отправок;
    - `test_report.py`: `build_report_text` (все секции, сравнение с
      позавчера, деление на ноль при пустом позавчера), 
      `seconds_until_next_report` (границы полуночи);
    - готча-проверка: `YANDEX_API_KEY= uv run pytest tests/` — симуляция CI.
    - Навыки: koda-coder
    - Файлы:
        - tests/test_metrics.py
        - tests/test_notifier.py
        - tests/test_alerts.py
        - tests/test_report.py

8. [ ] **Верификация**
    - `uv run pytest tests/ -v` (и с `YANDEX_API_KEY=` для симуляции CI);
    - `uv run ruff check proxy/ tests/`;
    - ручная проверка: локальный запуск с реальным Telegram-токеном,
      искусственное исчерпание бюджета (маленький `GLOBAL_DAILY_CHAR_LIMIT`)
      → приходят алерты 80%/100%.
    - Навыки: koda-coder
    - Файлы:
        - (без новых файлов)

9. [ ] **Документация + semver**
    - README: раздел мониторинга (алерты, отчёт, env-переменные, `/metrics`);
    - KODA.md: архитектура (metrics/notifier/report в структуре, новые
      таблицы SQLite, эндпоинт `/metrics`), правила разработки;
    - semver: minor bump 1.25.0 → 1.26.0 (новая функциональность) во всех
      4 файлах (pyproject.toml, client/package.json,
      client/src-tauri/tauri.conf.json, client/android/app/build.gradle)
      + `uv lock` синхронизация; навык semver-checker перед коммитом.
    - Навыки: docs-update, semver-checker
    - Файлы:
        - README.md
        - KODA.md
        - pyproject.toml
        - client/package.json
        - client/src-tauri/tauri.conf.json
        - client/android/app/build.gradle
        - uv.lock

## Риски и готчи

- **Реальные отправки в тестах**: `load_dotenv()` в main.py подхватывает
  `.env` с реальным токеном → conftest обязан чистить `TELEGRAM_*` (шаг 6),
  иначе каждый локальный прогон тестов шлёт алерты разработчику.
- **Lifespan в TestClient**: фоновая задача отчёта стартует при
  `TestClient(app)` — спит до 00:05 UTC,无害, но при отсутствии
  Telegram-конфигурации (conftest чистит) вообще не стартует.
- **Производительность**: uniques пишутся в SQLite только при первом
  появлении устройства/IP в процессе — не на каждый запрос; счётчики —
  dict-операции под Lock.
- **Рестарт контейнера**: дневные счётчики в SQLite переживают; часовые
  бакеты и дедуп-ключи алертов — in-memory (после рестарта алерт может
  сработать повторно — приемлемо и даже полезно).
- **Деплой**: без изменений инфраструктуры — таблицы создаются в той же
  БД в volume `lex-cache`; новые env-переменные опциональны (дефолты).
