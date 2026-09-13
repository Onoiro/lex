# План: B-6 — эндпоинт остатка квоты + UI-индикатор

Дата: 2026-09-13. Ветка: создать feature-ветку при старте (например `quota-indicator`).
Текущая версия: 1.23.0. Бэклог: B-6 (P1).

## Цель
Пользователь видит остаток дневных лимитов (перевод и озвучка) до их исчерпания —
прозрачность снижает раздражение; база для биллинга (B-8: тариф и остаток).

## Ключевые решения (обсуждены с пользователем)

- **Где показывать:**
  1. Страница «Перевод» (Add.tsx) — компактная строка мелким шрифтом под языковой
     панелью: «Перевод: 437/500 · Озвучка: 500/500». Translate-квота расходуется
     только здесь; TTS — здесь и в Повторе.
  2. Настройки → существующий сворачиваемый раздел «Лимиты использования» —
     живые цифры вместо чисто статичного текста.
  3. Повтор — БЕЗ индикатора (TTS фоновый, не перегружаем тренировочный экран;
     при исчерпании уже есть сообщение об ошибке).
- **Точность:** серверный кэш не расходует квоту → сервер возвращает признак кэша:
  `/translate` добавляет `"cached": bool` в JSON-ответ, `/tts` — заголовок `X-Cached: 1`
  (только для кэш-попаданий). Клиент вычитает символы только для некэшированных ответов.
- **Реальный остаток с device ID** = min(device-квота, IP-квота) — IP-квота (антибот)
  тоже может исчерпаться раньше device-квоты. Без device ID — anon-квота по IP.
- **Обновление на клиенте:** загрузка при монтировании Add/Settings; оптимистичный
  декремент после каждого успешного некэшированного перевода/озвучки; при 429 —
  остаток в 0; при ошибке сети — индикатор просто не показывается (не мешает).
- **Эндпоинт требует токен** автоматически (middleware; GET /quota не в списке
  исключений). Формат ответа:
  ```json
  {
    "translate": {"used": 63, "limit": 500, "remaining": 437},
    "tts": {"used": 0, "limit": 500, "remaining": 500}
  }
  ```
  `used` вычисляется как `limit - remaining` (учитывает min с IP-квотой).

## Шаги

1. [ ] **Proxy: GET /quota**
   - В `proxy/main.py`: эндпоинт читает `X-Device-Id` (strip) и IP
     (`get_client_ip`). С device ID: `min(device.remaining(id), ip.remaining(ip))`
     для translate и tts отдельно. Без: `anon.remaining(ip)`.
   - Ответ: `{"translate": {"used", "limit", "remaining"}, "tts": {...}}`,
     где limit — соответствующий env-лимит (DEVICE_DAILY_CHAR_LIMIT или
     ANON_DAILY_CHAR_LIMIT).
   - Обновить docstring модуля (список эндпоинтов).
   - Файлы: proxy/main.py

2. [ ] **Proxy: признак кэша в ответах**
   - `/translate`: кэш-попадание → `{"translation": ..., "detected_language": "",
     "cached": True}`; свежий перевод → `"cached": False`.
   - `/tts`: кэш-попадание → заголовок `X-Cached: 1` (в дополнение к
     Cache-Control); свежий синтез — без заголовка.
   - Файлы: proxy/main.py

3. [ ] **Proxy-тесты**
   - GET /quota: с device ID (полный лимит до списания); после списания через
     /translate (остаток уменьшился, used = списанному); min с IP-квотой
     (исчерпать IP-квоту → remaining 0); без device ID → anon-лимит;
     без токена → 403 (middleware).
   - Признак кэша: повторный /translate того же слова → `"cached": true`;
     повторный /tts → заголовок X-Cached: 1.
   - Гоча (из KODA.md): любые тесты, бьющие в /translate и /tts, обязаны мокать
     `proxy.main.translate_word` / `synthesize_speech`, даже если проверяют
     квоту/заголовки. Проверять локально с `YANDEX_API_KEY= uv run pytest tests/`.
   - Файлы: tests/test_proxy.py (или новый tests/test_quota_endpoint.py)

4. [ ] **Client: сервис quotaApi.ts**
   - Тип `QuotaInfo { translate: {used, limit, remaining}, tts: {...} }`.
   - `getQuota(): Promise<QuotaInfo>` — GET `${PROXY_URL}/quota` с `proxyHeaders()`;
     426 → notifyUpdateRequired; сетевые ошибки пробрасывать.
   - Файлы: client/src/services/quotaApi.ts

5. [ ] **Client: индикатор на странице Перевод (Add.tsx)**
   - State: `quota` (QuotaInfo | null). Загрузка при монтировании (тихо, при
     ошибке — null, индикатор скрыт).
   - Рендер: если quota !== null — строка `data-testid="quota-indicator"` под
     языковой панелью, мелкий шрифт, muted-цвет:
     `t("quota.translate_line", {used, limit})` + ` · ` + `t("quota.tts_line", ...)`.
   - После успешного автоперевода: если `result.cached === false` — декремент
     `translate.remaining/used += len(word)`; при `cached: true` — без изменений.
   - После TTS-озвучки (оба обработчика onError-путей): учесть аналогично через
     признак кэша (ttsApi должен сообщить, был ли кэш — см. шаг 6).
   - При `LimitError("daily_quota_exceeded")` (translate) и коде
     `daily_quota_exceeded` в TTS-callback: остаток соответствующей квоты → 0.
   - translateApi: добавить `cached: boolean` в TranslateResult.
   - Файлы: client/src/pages/Add.tsx, client/src/services/translateApi.ts

6. [ ] **Client: ttsApi сообщает о кэше**
   - `synthesizeSpeech` расширяется: onError-колбэк получает коды как сейчас;
     добавить опциональный второй механизм — например, возврат
     `{played: boolean, cached: boolean}` вместо void (обратная совместимость:
     существующие вызовы в Review игнорируют возвращаемое значение).
   - Кэш-попадание (локальный Cache API) → `cached: true` (квота не расходуется —
     запрос вообще не делается); ответ сервера с `X-Cached: 1` → `cached: true`;
     свежий синтез → `cached: false`; офлайн/ошибка → `played: false`.
   - Файлы: client/src/services/ttsApi.ts

7. [ ] **Client: живые счётчики в Настройках (Settings.tsx)**
   - В разделе «Лимиты использования» (details): при монтировании загрузить
     getQuota(); если успешно — показать строки «Сегодня: перевод X/500,
     озвучка Y/500» + существующий статичный текст лимитов оставить.
     При ошибке — только статичный текст (как сейчас).
   - Файлы: client/src/pages/Settings.tsx

8. [ ] **i18n-ключи (ru/en)**
   - `quota.translate_line`: «Перевод: {used}/{limit}» / "Translate: {used}/{limit}"
   - `quota.tts_line`: «Озвучка: {used}/{limit}» / "Speech: {used}/{limit}"
   - `settings.limits_today`: «Сегодня использовано: перевод {translate_used}/{translate_limit}, озвучка {tts_used}/{tts_limit}.»
   - Файлы: client/src/i18n/ru.json, client/src/i18n/en.json

9. [ ] **Тесты клиента (Vitest)**
   - `quotaApi.test.ts`: успешный ответ, 426, сетевая ошибка; заголовки через
     objectContaining (гоча: VITE_APP_TOKEN из .env.local утекает в тесты).
   - `Add.test.tsx`: индикатор отображается после загрузки квоты; декремент после
     некэшированного перевода; отсутствие декремента при cached: true; остаток 0
     при 429.
   - `Settings.test.tsx`: живые цифры в разделе «Лимиты» (замокать getQuota).
   - `ttsApi.test.ts` (новый файл): возврат cached/played для кэша, X-Cached,
     свежего синтеза (мокать fetch и Cache API по образцу существующих тестов).
   - Файлы: client/src/test/

10. [ ] **Верификация**
    - `uv run pytest tests/ -v` (и с `YANDEX_API_KEY=` для симуляции CI),
      `uv run ruff check proxy/`
    - `cd client && npm run test && npx eslint . && npm run build`

11. [ ] **Документация**
    - README.md: эндпоинт /quota, индикаторы.
    - KODA.md: архитектура (эндпоинт), правила (квоты + индикатор), версия.
    - .koda/backlog.md: B-6 → done (дата, коммит).

12. [ ] **Semver (навык semver-checker перед коммитом)**
    - Minor: 1.23.0 → 1.24.0 (versionCode 65) в 4 файлах:
      pyproject.toml, client/package.json, client/src-tauri/tauri.conf.json,
      client/android/app/build.gradle (+ uv.lock sync через `uv lock`).
    - В сообщении коммита: «Bump version: 1.23.0 → 1.24.0 (minor)».

## Технические заметки

- `PersistentDailyQuota.remaining(ident)` уже существует; для used:
  `limit - remaining` (не читать get_used напрямую — он не учитывает min с IP).
- IP-квота для device-запросов списывается всегда (consume_daily_quota), поэтому
  min(device, ip) корректен. Для anon-запросов IP-квота не списывается —
  остаток = anon.remaining(ip).
- Эндпоинт /quota НЕ списывает ничего и не трогает rate limiter (лёгкий запрос;
  rate limiter на IP и так есть на /translate и /tts — можно не дублировать;
  если захотим — отдельный лимитер, но не обязательно).
- В тестах прокси фикстура reset_rate_limiter уже сбрасывает все квоты —
  новые тесты её переиспользуют.
- Add.tsx: индикатор не должен ломать существующие тесты (они не мокают
  /quota → fetch упадёт → quota останется null → индикатор скрыт). В новых
  тестах мокать fetch или quotaApi.
- i18n: все строки через t(), ключи в обоих файлах.
- Тест-гоча из прошлого: vi.useFakeTimers({ toFake: ["Date"] }) при необходимости
  фейковых дат; полный fake-timers ломает fake-indexeddb.

## Критерии готовности
- GET /quota возвращает корректный остаток (device, anon, min с IP-квотой).
- Кэш-ответы не уменьшают индикатор (cached-признак работает).
- Пользователь видит остаток на странице Перевод и в Настройках до исчерпания.
- При исчерпании — индикатор показывает 0/500, поведение ошибок не меняется.
- Все тесты/линтеры/сборка зелёные; документация и версия обновлены.
