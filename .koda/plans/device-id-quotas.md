# План: B-5 — Device ID + персистентные квоты на устройство

Дата: 2026-09-12. Ветка: `device-id-quotas` (от store-ready-B-4 / текущей master).

## Цель
Квота следует за устройством (X-Device-Id), а не за IP (справедливость за CGNAT).
Квоты персистентные (SQLite, вместе с B-4). IP-лимит остаётся как антибот-слой.
Отсутствие device ID → сильно урезанная квота на IP. Device ID описан в политике.

## Ключевые решения
- **Заголовок `X-Device-Id`:** UUID v4, генерируется на клиенте один раз, хранится
  в localStorage (`lex_device_id`), шлётся во всех запросах через `proxyHeaders()`.
  Пустой/отсутствующий = анонимный клиент.
- **Три уровня квот на /translate и /tts (независимые для translate и tts):**
  1. Device-квота: 500 симв/день на device ID (основная, только при наличии заголовка).
  2. IP-квота (антибот): 3000 симв/день на IP, списывается у ВСЕХ запросов с device ID.
     Дефолт = 6 устройств по 500 одновременно: семья/офис за одним NAT не блокируются,
     бот с десятками device ID упирается почти сразу. Тюнинг по телеметрии (B-12).
  3. Anon-квота: 100 симв/день на IP для запросов БЕЗ device ID (стимул обновиться,
     старые клиенты не убиваются полностью).
- **Лимиты через env** (по паттерну GLOBAL_DAILY_CHAR_LIMIT):
  `DEVICE_DAILY_CHAR_LIMIT` (500), `IP_DAILY_CHAR_LIMIT` (3000),
  `ANON_DAILY_CHAR_LIMIT` (100). Плавный выкат: на переходный период можно поставить
  `ANON_DAILY_CHAR_LIMIT=500`, пока все клиенты не обновятся.
- **Персистентность:** одна таблица `quota_usage (key TEXT PRIMARY KEY, day TEXT,
  used INTEGER)` в общей SQLite БД (SQLITE_CACHE_PATH). Ключ = `{scope}:{ident}`,
  scope: `tr:dev`, `tr:ip`, `tr:anon`, `tts:dev`, `tts:ip`, `tts:anon`.
- **Атомарность:** инкремент одним условным UPSERT-ом в транзакции
  (`BEGIN IMMEDIATE` + `ON CONFLICT DO UPDATE ... WHERE used + chars <= limit`),
  успех = `rowcount == 1`. Смена дня: `UPDATE ... SET used = 0 WHERE day != today`
  перед инкрементом; устаревшие дни чистятся `DELETE WHERE day < today`.
- **Graceful degradation:** при недоступной БД — fallback на in-memory DailyQuota
  (квота работает, просто не переживает рестарт). Никогда не блокируем пользователей
  из-за сбоя хранилища.
- **Порядок проверок в эндпоинте** (после кэша, как сейчас): global budget →
  device-квота → IP-квота (или anon-квота). Rate limiter остаётся на IP без изменений.
- **Порядок выката:** прокси с персистентными квотами обратно совместим по API;
  старые клиенты без X-Device-Id попадут под anon-квоту — на переходный период
  поднять ANON_DAILY_CHAR_LIMIT=500 (или включить MIN_APP_VERSION для принудительного
  обновления).

## Шаги

1. **Прокси — персистентное хранилище квот** (`proxy/security/quota.py`):
   класс `PersistentQuotaStore` (ленивое соединение, лок, таблица `quota_usage`,
   атомарный `try_consume(key, day, chars, limit)`, `get_used`, `clear`,
   graceful degradation) + класс `PersistentDailyQuota(max_chars_per_day, scope,
   store)` с интерфейсом как у `DailyQuota` (`try_consume(ident, chars)`,
   `remaining(ident)`, `reset()`), внутри — store + in-memory fallback.

2. **Прокси — main.py:** env-лимиты; замена `translate_quota`/`tts_quota` на
   6 экземпляров `PersistentDailyQuota` (device/ip/anon × translate/tts);
   чтение `X-Device-Id` (strip, пустой = аноним) в `/translate` и `/tts`;
   логика списания по уровням. Обновить docstring модуля.

3. **Прокси-тесты:**
   - `tests/test_quota.py`: персистентность между экземплярами store, смена дня,
     атомарность (точная граница лимита), graceful degradation (битый путь БД →
     in-memory fallback), изоляция scope.
   - `tests/test_proxy.py`: фикстура `client` с дефолтным `X-Device-Id`;
     обновить существующие квота-тесты; новые: два устройства с одного IP имеют
     независимые квоты; IP-лимит срабатывает при множестве device; запрос без
     device ID → anon-квота; сброс состояния новых квот в фикстуре.

4. **Клиент — device ID:** `client/src/services/deviceId.ts`
   (`getDeviceId()`: localStorage `lex_device_id`, `crypto.randomUUID()`,
   try/catch → пустая строка при недоступном localStorage);
   `proxyClient.ts`: `proxyHeaders()` добавляет `X-Device-Id`, когда id есть.

5. **Клиент-тесты:** `deviceId.test.ts` (генерация, переиспользование,
   недоступный localStorage); прогон существующих тестов сервисов
   (заголовки проверяются через objectContaining — ломаться не должны).

6. **i18n + Privacy + Settings:**
   - `ru.json`/`en.json`: ключи `privacy.device_id`, `privacy.device_id_text`;
     уточнить тексты `settings.limits_*` (лимит привязан к устройству, а не к IP).
   - `Privacy.tsx`: новая секция «Идентификатор устройства» (после `ip_address`).
   - `Settings.tsx`: правка текстов раздела «Лимиты использования» (без структуры).

7. **Верификация:** `uv run pytest tests/ -v`, `uv run ruff check proxy/`,
   `npm run test`, `npx eslint .`, `npm run build` (в client/).

8. **Документация:** README (лимиты, заголовок), KODA.md (квоты, структура,
   версия), `.koda/backlog.md` (B-5 → done).

9. **Semver:** навык semver-checker перед коммитом: minor 1.22.0 → 1.23.0
   (versionCode 64) в 4 файлах + uv.lock.

- Device ID в localStorage: при очистке данных сайта устройство становится «новым»,
  квота сбрасывается. Для Free-тарифа это приемлемый компромисс; биллинг (B-8)
  привяжет Pro к server-side валидации покупок, а не только к device ID.
- Активных пользователей сейчас нет (кроме разработчика) — лимиты 500/3000/100
  безопасная стартовая точка, тюнинг по телеметрии (B-12).

## Критерии готовности
- Квота следует за устройством, а не за IP (тест: 2 устройства, 1 IP — полные квоты).
- Антибот: много device ID с одного IP упираются в IP-квоту.
- Без device ID — урезанная anon-квота.
- Квоты переживают рестарт (SQLite), при сбое БД — in-memory fallback.
- Политика конфиденциальности упоминает device ID.
- Все тесты/линтеры/сборка зелёные.
