# B-4: SQLite-кэши + Docker volume (персистентность)

## Задача
Заменить 3 in-memory кэша прокси на SQLite-backed (один файл БД, три таблицы),
добавить volume в docker-compose. Цель: рестарт контейнера не сбрасывает кэш —
слово «hello» переводится через API Яндекса 1 раз за историю сервера.

## Текущее состояние
- `proxy/services/cache.py` — `TranslationCache` (dict + Lock, TTL 7д), используется
  для переводов и (с другим TTL) для словаря в `dictionary.py`.
- `proxy/services/tts.py` — `SpeechCache` (dict, max 500 записей, eviction по вставке).
- `docker-compose.yml` — без volumes.
- Все кэши: интерфейс `get/set/clear/size` — сохраняем, чтобы не трогать main.py.

## Решение
- Новый класс `SqliteCache` в `proxy/services/cache.py`: SQLite-таблица
  `(key TEXT PK, value BLOB, expires_at REAL, created_at REAL)`,
  потокобезопасность (Lock + одно соединение `check_same_thread=False`),
  WAL-режим, TTL-чистка при `set`, опциональный `max_entries` (eviction по
  `created_at`), graceful degradation (ошибка SQLite → cache miss, без падения).
- Путь БД: env `SQLITE_CACHE_PATH`, дефолт `data/cache.db`.
- `TranslationCache` — подкласс `SqliteCache` (table=`translations`, TTL 7д) —
  имя и интерфейс сохранены для совместимости.
- `dictionary.py`: `dictionary_cache = SqliteCache(table="dictionary", ttl=30д)`.
- `tts.py`: `SpeechCache(SqliteCache)` (table=`tts_audio`, max 500, без TTL —
  как сейчас).
- `CacheEntry` удаляется (не нужен при SQLite).

## Шаги
1. План (этот файл).
2. `proxy/services/cache.py` — `SqliteCache`, `TranslationCache` как подкласс.
3. `proxy/services/tts.py` — `SpeechCache` на SQLite; `dictionary.py` — своя таблица.
4. `tests/conftest.py` — env `SQLITE_CACHE_PATH` → tmp-каталог ДО импортов proxy
   (глобальные кэши в тестах не пишут в реальный `data/cache.db`).
5. Тесты: новый `tests/test_sqlite_cache.py` (персистентность между экземплярами
   = «рестарт не сбрасывает кэш», TTL, max_entries eviction, bytes, изоляция
   таблиц, деградация при недоступном пути); обновить `tests/test_cache.py`
   (tmp_path, убрать TestCacheEntry).
6. `docker-compose.yml` — named volume `lex-cache:/app/data`; Dockerfile —
   `mkdir /app/data`; `.env.example` — `SQLITE_CACHE_PATH`.
7. Проверка: `ruff check proxy/`, `pytest tests/ -v` (все, в т.ч. существующие
   test_proxy/test_tts/test_dictionary — интерфейс не изменился).
8. Docs (README, KODA.md) + semver minor 1.21.1 → 1.22.0 (versionCode 63).

## Критерии готовности
- Рестарт контейнера не сбрасывает кэш (тест на персистентность между экземплярами).
- Все существующие тесты проходят без изменения логики.
- Размер БД контролируется (TTL-чистка + лимит 500 TTS-записей).
- TTS-кэш на сервере остаётся (нужен для переустановок/новых устройств/веб).
