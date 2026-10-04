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

9. [x] Повторный smoke-тест на устройстве (действие пользователя)
       - Установка APK, проверка П-1…П-6, кнопка «Назад», поворот, тёмная тема, обновление поверх
       - При необходимости — отладка через make android-apk-debug + chrome://inspect
       - РЕЗУЛЬТАТ: APK 1.29.1 — П-1, П-2, П-3 остались, найдена П-8 (см. «Раунд 2»).
         APK 1.29.2 — все пункты подтверждены пользователем как исправленные.

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

---

# Раунд 2 — результаты smoke-теста 1.29.1 (2026-10-04)

Пользователь установил APK 1.29.1 на устройство. Часть проблем осталась, выявлена новая.

## П-1 (не исправлено). Нет отступа сверху, контент заходит под статус-бар

Контент обрезан сверху: верхнюю часть экрана занимает системная полоска (время, батарея,
связь), экран приложения заходит под неё. **Страница Повтор отображается с нормальным
отступом** — потому что у `.lex-start` есть собственный `padding: 2rem 1rem`.

Гипотеза: `padding-top: var(--safe-area-inset-top, env(safe-area-inset-top, 0px))` даёт 0.
Capacitor `SystemBars` инжектит `--safe-area-inset-top: 0px` (переменная определена →
fallback `env()` не используется), а реальный нативный padding на родителя WebView
ставится только при `SDK >= 34` (Android 15+) или при passthrough (WebView ≥ 140).
На Android < 15 с WebView < 140 не работает ни то, ни другое.

## П-2 (не исправлено). Нет офлайн-предупреждения в APK

В APK офлайн-предупреждения нет ни в Повторе, ни на Переводе. В браузере (lextr.ru,
stage.lextr.ru) — есть. Значит `navigator.onLine` в Capacitor WebView всегда `true`
(WebView не эмитит `offline`-событие так же, как браузер).

Дополнительно (решение пользователя): предупреждение на карточке во время тренировки
убрать — оно занимает несколько строк, перекрывается с маскотом. Оставить только на
стартовом экране Повтора, оформить как на странице Перевод — красная плашка
(`lex-alert lex-alert--error`) вверху, исчезает при старте тренировки.

## П-3 (не исправлено). Add: экран не скроллится до кнопки «Сохранить»

`android:windowSoftInputMode="adjustResize"` не помог: страница не скроллится до конца,
навбар перекрыт клавиатурой, нужно тапнуть по экрану, чтобы клавиатура скрылась.

## П-8 (новая). Кнопка «Назад» на Android сбрасывает приложение

На APK системная кнопка «Назад» закрывает приложение (пользователь попадает на пустой
экран телефона). В браузере «Назад» работает как history back (например, из
редактирования слова в Словаре возвращает к списку).

Причина: Capacitor `BridgeActivity` не переопределяет `onBackPressed` — по умолчанию
Activity завершается. Нужно перехватывать «Назад» и вызывать `window.history.back()`,
а если история пуста — сворачивать приложение (`moveTaskToBack`), а не закрывать.

## Порядок работ (раунд 2)

```
11. [x] П-1: отступ сверху
12. [x] П-2: офлайн-предупреждение в APK + перенос на стартовый экран
13. [x] П-3: скролл до кнопки «Сохранить» при открытой клавиатуре
14. [x] П-8: обработка системной кнопки «Назад»
15. [x] Проверки + пересборка APK + semver
```

## Результат раунда 2 (2026-10-04, v1.29.2)

**Проверено пользователем на устройстве: все пункты исправлены.** APK 1.29.2
(`/home/abo/lex-1.29.2.apk`, sha256 `53b259660a70423f51168ebb4839736521377a704ca75513d0ba2f840e8e085c`,
versionCode 82) установлен, П-1, П-2, П-3, П-8 подтверждены как рабочие.

Коммит `a7bc75e` смержен в `master` и запушен; `make deploy` выполнен на стейдже
(`stage.lextr.ru`) и на проде (`lextr.ru`).

**П-7 (DevTools на телефоне) — не блокер публикации.** Это инструмент отладки, а не
дефект приложения: в release-сборке WebView debugging отключён намеренно (иначе
отладочный порт открыт в проде). Цель `make android-apk-debug` уже есть — при
необходимости отладки собирается debug-APK и подключается `chrome://inspect`.
Отдельных работ не требует.

## Что сделано (раунд 2)

**П-1.** `client/capacitor.config.ts`: `StatusBar.overlaysWebView: false`. Дефолт `true`
ставил `FLAG_LAYOUT_FULLSCREEN` — WebView рисовался под статус-баром, а `SystemBars`
инжектит ненулевой `--safe-area-inset-top` только на Android 15+ / WebView ≥ 140.
На Android 15+ edge-to-edge принудительный, там по-прежнему работает safe-area.

**П-2.** Две части:
- `AndroidManifest.xml`: добавлено `ACCESS_NETWORK_STATE` — без него `navigator.onLine`
  в WebView всегда `true`, поэтому офлайн-предупреждений в APK не было.
- `Review.tsx`: предупреждение перенесено на стартовый экран и оформлено красной
  плашкой (`lex-alert lex-alert--error lex-alert--row` + маскот sleeping), как на
  странице Перевод; с карточки тренировки убрано (перекрывалось с маскотом).

**П-3.** Новый `client/src/services/keyboardInset.ts` — слушает `visualViewport` и пишет
высоту клавиатуры в `--lex-keyboard-inset` на `<html>`. Переменная добавлена в
`padding-bottom` у `main`, в `bottom` у `.bottom-nav` и у `.lex-save-bar`. Работает и в
APK (Android 15+ игнорирует `adjustResize`), и в PWA. `adjustResize` в манифесте
оставлен — нужен для Android < 15.

**П-8.** `MainActivity.java`: переопределён `onBackPressed()` — если WebView может идти
назад, вызывается `goBack()` (React Router history), иначе `moveTaskToBack(true)`
(сворачивание вместо закрытия).

Проверки: tsc чисто, eslint 0 ошибок (3 унаследованных warning), 358 vitest (новый
`keyboardInset.test.ts` — 4 теста), build OK.
