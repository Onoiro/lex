# B-3. Минимальная версия клиента (client version gate)

## Зачем
Без version gate нельзя ни безопасно ротировать токены (APP_TOKENS), ни менять API,
ни заставить устаревшие клиенты обновиться. Старые APK без заголовка версии должны
получать понятный ответ «обновите приложение».

## Ключевые решения
- Клиент шлёт версию приложения в заголовке `X-App-Version` (semver, например `1.21.0`).
  Версия инжектится при сборке из `client/package.json` через `define` в vite.config.ts
  (`__APP_VERSION__`) — не нужно синхронизировать вручную.
- Прокси: env `MIN_APP_VERSION` (например `1.20.0`). Пустой/не заданный = проверка
  выключена (обратная совместимость, тот же паттерн, что у APP_TOKENS).
- Порядок выката: задеплоить прокси без MIN_APP_VERSION → выпустить клиент с
  заголовком → установить MIN_APP_VERSION на сервере.
- Ответ при устаревшей версии: `426 Upgrade Required`,
  `{"error": "update_required", "min_version": "1.21.0"}`.
- Сравнение версий — простая функция разбора semver в кортеж чисел
  (без внешних зависимостей; некорректная версия клиента трактуется как устаревшая).
- Клиент: при 426 показывается полноэкранная заглушка «Обновите приложение»
  (блокирует всё приложение). Реализация — модуль `updateGate.ts` с подпиской:
  сервисы вызывают `notifyUpdateRequired()`, App рендерит заглушку.
  PWA-клиенты и так обновляются через SW (autoUpdate), заглушка критична
  для APK и десктопа.

## Шаги

1. **Proxy: `proxy/security/version_gate.py`**
   - Класс `VersionGate(env_var="MIN_APP_VERSION")`: `reload()`, `enabled`,
     `is_supported(version: str | None) -> bool`.
   - Хелпер `parse_version(s) -> tuple[int, ...] | None` (строгий semver `x.y.z`,
     None при невалидной строке).
   - Правило: проверка выключена, если env пуст; версия клиента None/невалидная
     или < min → не поддерживается.

2. **Proxy: интеграция в `proxy/main.py`**
   - `version_gate = VersionGate()`; env `MIN_APP_VERSION` читается при старте
     (+ `reload()` доступен для тестов).
   - В существующую `app_token_middleware` (после проверки токена, до роутов):
     если gate включён и `X-App-Version` не поддерживается → 426
     `{"error": "update_required", "min_version": ...}`.
   - Исключения те же: `OPTIONS` preflight и `GET /` (health-check) — без проверки.
   - Добавить `X-App-Version` в `allow_headers` CORS.

3. **Proxy: `.env.example`** — добавить `MIN_APP_VERSION=` с комментарием
   (пусто = проверка выключена).

4. **Proxy: тесты `tests/test_version_gate.py`**
   - Unit: parse_version (валидные/невалидные), is_supported (выключен, равные,
     ниже, выше, None, мусор).
   - Integration: 426 при устаревшей версии; 200 при равной/новее; проверка
     выключена при пустом env; health-check и preflight без заголовка проходят;
     все защищённые эндпоинты проверяются.

5. **Client: `proxyClient.ts`**
   - `declare const __APP_VERSION__: string` (типизация в `vite-env.d.ts`).
   - `proxyHeaders()` добавляет `X-App-Version: __APP_VERSION__` (если задана).

6. **Client: `vite.config.ts`** — `define: { __APP_VERSION__: JSON.stringify(pkg.version) }`
   (версия читается из package.json).

7. **Client: `services/updateGate.ts`**
   - `notifyUpdateRequired()`, `isUpdateRequired()`, `onUpdateRequired(cb)` —
     простой listener-модуль (set подписчиков), идемпотентный.

8. **Client: обработка 426 в сервисах**
   - `translateApi.ts`, `ttsApi.ts`, `dictionaryApi.ts`, `feedbackApi.ts`:
     при `response.status === 426` вызывать `notifyUpdateRequired()` и
     прерывать обычную обработку (бросок/тихий выход как сейчас).

9. **Client: заглушка в `App.tsx`**
   - Подписка на `onUpdateRequired` в useEffect; при срабатывании рендер
     полноэкранного блока «Доступна новая версия. Обновите приложение»
     (i18n-ключи `update.title`, `update.message`, `update.hint` — ru/en).

10. **Client: тесты**
    - `proxyClient.test.ts`: заголовок `X-App-Version` присутствует.
    - `updateGate.test.ts`: подписка/уведомление/идемпотентность.
    - Тест сервиса: 426 → notifyUpdateRequired вызван (например для translateApi).

11. **Верификация**
    - `uv run pytest tests/ -v`, `uv run ruff check proxy/`
    - `npm run test`, `npm run lint`, `npm run build` (в client/)

12. **Документация + semver**
    - README.md: раздел про version gate (env, заголовок, порядок выката).
    - KODA.md: правила (заголовок, 426, env), структура, версия.
    - `.koda/backlog.md`: B-3 → done.
    - Semver: minor 1.20.0 → 1.21.0, versionCode 61 (все 4 файла + `uv lock`).

## Критерии готовности
- Старая версия клиента получает 426 с понятным кодом; клиент показывает экран обновления.
- Проверка отключена по умолчанию (пустой MIN_APP_VERSION) — совместимый выкат.
- Тесты proxy и client зелёные; lint/build без ошибок.
