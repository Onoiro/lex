# План: исправление проблем П-1…П-7 (тестирование APK на устройстве)

**Статус:** шаги 1–8 выполнены 2026-10-03 (v1.29.1, APK собран). Осталось: шаг 9 (smoke-тест на устройстве, пользователь), шаг 10 (docs — выполнено)
**Ветка:** `feature/android-release` (текущая, HEAD `3ebdaed`, v1.29.0)
**Источник:** `.koda/plans/android-release.md`, раздел «Результаты тестирования на устройстве»
**Цель:** устранить блокеры публикации (П-1, П-3, П-4, П-5, П-6), вернуть офлайн-предупреждение (П-2),
дать инструмент отладки (П-7), пересобрать APK и повторить smoke-тест.

---

## Уточнения к исходным гипотезам (проверено по коду)

| Пункт | Гипотеза в android-release.md | Фактическое состояние |
|---|---|---|
| П-1 | `safe-area-inset-top` нигде не используется | Подтверждено. Дополнительно: Capacitor 8 `SystemBars` инжектит `--safe-area-inset-top` в `documentElement` и включает passthrough при `viewport-fit=cover` + WebView ≥ 140 |
| П-2 | `OfflineIndicator` подключён только в Add.tsx | **Устарело.** В `Review.tsx:658` предупреждение `review.tts_offline` есть, но только в фазе `training` (на карточке). На стартовом экране его нет |
| П-3 | `windowSoftInputMode` не задан | Подтверждено. Capacitor `SystemBars` сам обрабатывает IME-insets только на Android 15+ (passthrough); на Android < 15 нужен `adjustResize` |
| П-4 | Telegram недоступен с прода | Подтверждено повторно: прод → `000` (таймаут), **стейдж → `302` (Telegram доступен)** |
| П-5 | `max-width: 5rem` + ellipsis | Точнее: `5rem` (80px) больше доступной ширины пункта (~48px на 360px экране), подпись выходит за границы item и визуально стыкуется с соседней |
| П-6 | `clear: left` только на `p.lex-hint` | Подтверждено. `<h1>` обтекает float и при нехватке ширины уходит под маскот |
| П-7 | WebView debugging отключён в release | Подтверждено. Capacitor включает debugging автоматически для debug-сборок (`CapConf.isDebug`) — нужна только Makefile-цель |

---

## План

```
1. [x] П-4: поддержка TELEGRAM_PROXY в прокси (feedback + алерты + отчёт)
       - Навыки: koda-coder
       - proxy/services/feedback.py: читать TELEGRAM_PROXY, передавать в httpx.Client(proxy=...)
       - proxy/services/notifier.py: то же (report.py использует notifier.send_alert — покрыт)
       - .env.example: TELEGRAM_PROXY с комментарием (пусто = без прокси)
       - Тесты: tests/test_feedback.py + tests/test_notifier.py — прокси передаётся/не передаётся
       - Проверка: uv run pytest tests/ -v (в т.ч. YANDEX_API_KEY= uv run pytest tests/)
       - Файлы: proxy/services/feedback.py, proxy/services/notifier.py, .env.example,
                tests/test_feedback.py, tests/test_notifier.py
       - Действия на серверах (пользователь): поднять HTTP-прокси на стейдже
         (89.125.130.69, ssh taskman-stage), ограничить доступ по IP прода,
         на проде (45.155.204.194, ssh taskman-prod) задать TELEGRAM_PROXY в .env
       - Проверка на сервере: curl -x <proxy> https://api.telegram.org/ с прода → не 000

2. [x] П-1 + П-3: safe-area сверху и клавиатура (Android-манифест + layout)
       - Навыки: koda-coder
       - client/src/index.css: main → padding-top через
         var(--safe-area-inset-top, env(safe-area-inset-top, 0px));
         padding-bottom — та же цепочка для --safe-area-inset-bottom
       - client/android/app/src/main/AndroidManifest.xml:
         android:windowSoftInputMode="adjustResize" у MainActivity
       - Проверка: npm run build; визуально в браузере (DevTools, узкое окно) — отступ не появился
         (env() = 0); на устройстве — контент не под статус-баром, клавиатура не перекрывает Save
       - Файлы: client/src/index.css, client/android/app/src/main/AndroidManifest.xml

3. [x] П-5: подписи мобильного навбара
       - Навыки: koda-coder
       - client/src/styles/components.css: .bottom-nav-label → display: block; width: 100%;
         max-width: 100%; text-align: center (устраняет «слипание»)
       - client/src/i18n/ru.json: короткие подписи для навбара (решение пользователя:
         «Переводчик» → «Перевод», «Настройки» → «Ещё»)
       - Проверка: npm run test (Layout.test.tsx — en-подписи не меняются), визуально на устройстве
       - Файлы: client/src/styles/components.css, client/src/i18n/ru.json

4. [x] П-6: заголовок Home рядом с маскотом на мобильном
       - Навыки: koda-coder
       - client/src/index.css (@media max-width: 576px): .home-hero hgroup h1 → display: flow-root
         (BFC: заголовок остаётся в своей колонке рядом с float-маскотом, описание — под маскотом)
       - Проверка: npm run test (Home.test.tsx), визуально в браузере (en + ru, узкое окно)
       - Файлы: client/src/index.css

5. [x] П-2: офлайн-предупреждение на стартовом экране Review
       - Навыки: koda-coder
       - client/src/pages/Review.tsx: в фазе start показывать review.tts_offline при
         settings?.tts_enabled && isOffline (на карточке предупреждение уже есть —
         решение пользователя: оставить в обоих местах)
       - Тесты: Review.test.tsx — предупреждение на стартовом экране.
         Мок офлайна БЕЗ Object.defineProperty(navigator, "onLine") (прошлые flaky-тесты):
         вынести проверку в функцию и мокать её, либо vi.stubGlobal с восстановлением в afterEach
       - Проверка: npm run test (полный прогон, не только файл)
       - Файлы: client/src/pages/Review.tsx, client/src/test/Review.test.tsx

6. [x] П-7: debug-сборка APK для отладки
       - Навыки: koda-coder
       - Makefile: цель android-apk-debug (assembleDebug, без keystore, WebView debugging включён)
       - Проверка: make -n android-apk-debug; grep -nP '^ +\S' Makefile (табы не съедены)
       - Файлы: Makefile

7. [x] Проверка: lint / typecheck / тесты / сборка
       - Навыки: koda-coder
       - cd client && npx tsc --noEmit && npm run lint && npm run test
       - uv run --frozen ruff check proxy/ && uv run --frozen pytest tests/ -v
       - YANDEX_API_KEY= uv run --frozen pytest tests/ (симуляция CI)
       - cd client && npm run build

8. [x] Пересборка APK + semver
       - Навыки: semver-checker
       - Бамп 1.29.0 → 1.29.1 (patch), versionCode 80 → 81 во всех файлах + lock-файлы
       - make android-apk; apksigner verify; aapt2 dump badging (ориентация, versionCode)
       - Артефакт: /home/abo/lex-1.29.1.apk
       - Файлы: pyproject.toml, client/package.json, client/src-tauri/tauri.conf.json,
                client/src-tauri/Cargo.toml, client/android/app/build.gradle, KODA.md,
                uv.lock, client/package-lock.json, client/src-tauri/Cargo.lock

9. [ ] Повторный smoke-тест на устройстве (действие пользователя)
       - Установка APK, проверка П-1…П-6, кнопка «Назад», поворот, тёмная тема, обновление поверх
       - При необходимости — отладка через make android-apk-debug + chrome://inspect

10. [x] Документация
       - Навыки: docs-update
       - README, KODA.md (правила safe-area / windowSoftInputMode / TELEGRAM_PROXY),
         .koda/plans/android-release.md (отметить П-1…П-7), .koda/backlog.md при необходимости
```

---

## Решения пользователя (2026-10-03)

1. **П-4 — прокси для Telegram:** поднять HTTP-прокси на **стейдж-сервере** (89.125.130.69,
   `ssh taskman-stage`), ограничить доступ по IP прода, на проде задать
   `TELEGRAM_PROXY=http://89.125.130.69:PORT`. Проверить `curl -x <proxy> https://api.telegram.org/`
   с прода до включения в `.env`.
2. **П-5 — сокращение русских подписей:** «Переводчик» → «Перевод», «Настройки» → «Ещё».
3. **П-2 — место предупреждения:** и на стартовом экране Review, и на карточке (на карточке уже есть).

---

## Открытые вопросы (закрыты)

1. ~~П-4 — прокси для Telegram.~~ → решение 1 выше.
2. ~~П-5 — сокращение русских подписей.~~ → решение 2 выше.
3. ~~П-2 — где показывать предупреждение.~~ → решение 3 выше.

---

## Риски

1. **`env()` внутри `var()` fallback** не поддерживается очень старыми WebView — свойство
   становится невалидным и `padding-top` = 0 (как сейчас). Деградация безопасная.
2. **`adjustResize` на Android 15+** не ресайзит окно — там работает IME-insets Capacitor.
   Проверять нужно на обеих версиях Android.
3. **Тесты офлайна** — прошлый flaky-инцидент с `Object.defineProperty(navigator, "onLine")`
   при полном прогоне. Мок только через `vi.stubGlobal` + восстановление, прогонять весь набор.
4. **Правки Makefile** — `replace` вставляет пробелы вместо табов; проверять `grep -nP '^ +\S' Makefile`.
5. **Прокси для Telegram** может не заработать с первого раза (ТСПУ фильтрует по SNI) —
   проверять `curl -x <proxy> https://api.telegram.org/` с прода до включения в `.env`.
