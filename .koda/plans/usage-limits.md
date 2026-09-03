# План: лимиты длины запросов и дневные символьные квоты (free, до системы оплаты)

## Контекст

- Дата создания: 3 сентября 2026
- Ветка: master (создать feature-ветку при старте реализации, например `usage-limits`)
- Текущая версия: 1.17.2 (после коммита 1853894)
- Проблема: `/translate` и `/tts` на прокси не проверяют длину текста и не имеют дневных квот.
  Пользователь может вставить большой текст (сотни слов), перевести и озвучить его —
  это реальная статья затрат (Yandex Translate ~500,4 ₽/1M симв., SpeechKit API v1 ~0,0009 ₽/симв.).
  Rate limit 30 запросов/мин на IP не защищает от длинных текстов.
- Валидация `validateWord()` (100 символов) на клиенте срабатывает только при сохранении в словарь,
  НЕ при автопереводе (debounce 1 сек) и НЕ при озвучке.
- Словарь/примеры (`/dictionary`) — бесплатный эндпоинт (queryCorpus без ключа), НЕ трогаем.

## Ключевые решения (подтверждены пользователем)

- Лимит длины запроса: **500 символов** на `/translate` и `/tts` — проверка на сервере.
- Дневная квота (free): **500 символов перевода/день + 500 символов TTS/день**, учёт по IP
  (как у RateLimiter), окно — календарный день UTC.
- Хранение квот: в памяти (по образцу `proxy/security/rate_limiter.py`), без БД,
  сбрасывается при рестарте. Персистентность и device ID — следующий этап (вместе с биллингом).
- Превышение длины: 400 `{"error": "text_too_long", "max_length": 500}`.
- Превышение квоты: 429 `{"error": "daily_quota_exceeded"}` — клиент показывает понятное
  сообщение и прекращает автоперевод до конца дня (не спамить 429).
- Кэши (серверные и клиентский TTS Cache API) не расходуют квоту — лимитируется только
  фактический вызов Yandex API.
- Объяснение пользователю: сворачиваемый раздел «Лимиты использования» в Настройках
  (по образцу Feedback / Danger zone) + сообщение при достижении лимита.

## Шаги

1. [ ] **Proxy: ограничение длины запроса 500 символов на /translate и /tts**
   - Проверка len(text) на сервере, ошибка 400 `{"error": "text_too_long", "max_length": 500}`
   - Навыки: koda-coder
   - Файлы:
     - proxy/main.py
     - tests/test_proxy.py (новые тесты длины)
     - tests/test_tts.py (новые тесты длины)

2. [ ] **Proxy: дневные символьные квоты (500 translate + 500 tts в день на IP)**
   - Новый класс DailyQuota в proxy/security/quota.py (по образцу RateLimiter,
     окно — календарный день UTC, учёт символов, а не запросов)
   - Интеграция в /translate и /tts: превышение → 429 `{"error": "daily_quota_exceeded"}`
   - Фикстуры сброса квоты в тестах (по образцу reset_rate_limiter)
   - Навыки: koda-coder
   - Файлы:
     - proxy/security/quota.py (новый)
     - proxy/main.py
     - tests/test_quota.py (новый)
     - tests/test_proxy.py

3. [ ] **Client: обработка ошибок лимитов в сервисах и Add.tsx**
   - translateApi/ttsApi: пробрасывать тип ошибки (text_too_long / daily_quota_exceeded)
   - Add.tsx: при превышении квоты — сообщение «Дневной лимит… обновится завтра»,
     флаг для прекращения автоперевода до конца дня (не спамить 429)
   - Предупреждение при вводе >500 символов в поле слова (подсказка + отказ от автоперевода)
   - Навыки: koda-coder
   - Файлы:
     - client/src/services/translateApi.ts
     - client/src/services/ttsApi.ts
     - client/src/pages/Add.tsx

4. [ ] **Client: i18n-ключи для всех лимитных сообщений (ru/en)**
   - Навыки: koda-coder
   - Файлы:
     - client/src/i18n/ru.json
     - client/src/i18n/en.json

5. [ ] **Client: раздел «Лимиты использования» в Настройках**
   - Сворачиваемый `<details>` (по образцу Feedback / Danger zone):
     500 символов на запрос, 500 символов/день перевод, 500/день озвучка,
     сброс в полночь UTC, объяснение «почему» (бесплатный сервис, кэш не расходует лимит)
   - Навыки: koda-coder
   - Файлы:
     - client/src/pages/Settings.tsx

6. [ ] **Тесты клиента (Vitest): обработка 429/400 в Add и сервисах**
   - Навыки: koda-coder
   - Файлы:
     - client/src/test/ (тесты Add.tsx, translateApi/ttsApi)

7. [ ] **Верификация: pytest, ruff, vitest, eslint, build**
   - `uv run pytest tests/ -v`; `uv run ruff check proxy/`
   - `cd client && npm run test && npm run lint && npm run build`
   - Навыки: koda-coder

8. [ ] **Документация + semver (через навыки docs-update и semver-checker)**
   - README.md, KODA.md: новые лимиты и квоты
   - Бамп версии (minor, новая функциональность) в 4 файлах:
     pyproject.toml, client/package.json, client/src-tauri/tauri.conf.json,
     client/android/app/build.gradle (+ uv.lock sync)
   - Навыки: docs-update, semver-checker
   - Файлы:
     - README.md
     - KODA.md
     - pyproject.toml, client/package.json, client/src-tauri/tauri.conf.json, client/android/app/build.gradle

## Технические заметки

- RateLimiter находится в `proxy/security/rate_limiter.py` — DailyQuota делаем рядом,
  тот же стиль (threading.Lock, docstrings на простом английском).
- В `proxy/main.py` лимитеры создаются как глобальные экземпляры
  (`translate_limiter = RateLimiter(...)`), квоты — аналогично
  (`translate_quota = DailyQuota(...)`, `tts_quota = DailyQuota(...)`).
- Тесты прокси: фикстура `reset_rate_limiter` в test_proxy.py чистит состояние лимитера —
  добавить аналогичную для квот.
- Клиент: `translateApi.ts` сейчас бросает `Error(body.error)` — можно парсить
  код ошибки из body.error (строки "text_too_long" / "daily_quota_exceeded").
- `ttsApi.ts` сейчас молча проглатывает ошибки (`if (!response.ok) return;`) —
  нужно пробросить причину в Add.tsx (например, через callback или возврат статуса).
- Add.tsx: автоперевод в useEffect с debounce 1000 мс (`_debounceMs`, переопределяется
  в тестах через `setDebounceMs`). Флаг остановки автоперевода при исчерпании квоты —
  в state компонента.
- i18n: все строки через `t()` из `@/i18n`, ключи в ru.json и en.json.
- Settings.tsx: разделы Feedback и Danger zone — сворачиваемые `<details>`, новый раздел
  «Лимиты» делаем в том же стиле, разместить перед Feedback.
- Тест-гоча из прошлого опыта: `vi.useFakeTimers()` full-mode ломает fake-indexeddb —
  использовать `vi.useFakeTimers({ toFake: ["Date"] })`, если понадобятся фейковые даты.

## Экономическое обоснование (для KODA.md / README)

- Free: 500 симв. перевода/день ≈ 0,25 ₽/день макс. затрат; 500 симв. TTS/день ≈ 0,45 ₽/день.
  Худший случай ~0,7 ₽/день на пользователя, реальный (с кэшами) — копейки.
- Защита от абота: rate limit 30/мин + дневная квота 500 симв. = макс ~21 ₽/день/IP
  при полном исчерпании обеих квот.
