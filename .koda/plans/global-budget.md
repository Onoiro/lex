# План: B-1. Глобальный дневной бюджет прокси (финансовый предохранитель)

## Задача
Единственная гарантированная остановка трат Yandex API: глобальный счётчик
символов/день на ВСЕХ пользователей суммарно (translate + tts вместе).
При превышении → 503 `{"error": "service_overloaded"}`.

## Решения
- Новый класс `GlobalBudget` в `proxy/security/quota.py` — тонкая обёртка над
  `DailyQuota` с единственным ключом `"global"` (переиспользуем логику
  UTC-окна, потокобезопасность, rollover).
- Один общий бюджет на translate + tts (проще и надёжнее, чем раздельные).
- Лимит через env var `GLOBAL_DAILY_CHAR_LIMIT`, дефолт **300 000** символов/день
  (~390 ₽/день при ~1.3 ₽/1000 симв — верхняя граница оценки 300–500 ₽ из бэклога).
- Кэшированные ответы не расходуют глобальный бюджет: перед списанием в
  эндпоинте проверяется серверный кэш (для translate — новый хелпер
  `get_cached_translation` в translator.py, чтобы не дублировать ключ кэша).
- Per-IP квоты не меняются (существующее поведение сохраняется).
- Клиент не трогаем: 503 уже обрабатывается как обычная ошибка перевода/TTS.

## Шаги
1. `proxy/security/quota.py`: класс `GlobalBudget` → тесты в `tests/test_quota.py`.
2. `proxy/services/translator.py`: хелпер `get_cached_translation(word, src, tgt)`
   (+ общая функция ключа кэша, используется в `_translate_sync`).
3. `proxy/main.py`: `global_budget` из env; в `/translate` и `/tts` порядок
   проверок: rate limit → длина → **кэш** → глобальный бюджет (503) → per-IP (429).
4. `.env.example`: `GLOBAL_DAILY_CHAR_LIMIT=300000`.
5. Тесты `tests/test_proxy.py`: 503 при исчерпании бюджета; кэш-хит не списывает
   бюджет; сброс в fixture.
6. Верификация: `uv run pytest tests/ -v`, `uv run ruff check proxy/`.
7. Документация: KODA.md (лимиты), `.koda/backlog.md` (статус B-1), semver-checker.
