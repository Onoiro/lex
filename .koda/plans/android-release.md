# План: сборка APK и публикация Lex в RuStore и AppGallery

**Статус:** шаги 1–6 закрыты (2026-10-04, v1.29.2). Осталось: шаги 7–8 (публикация
в RuStore и AppGallery) и шаг 9 (пост-релиз) — в новой сессии.
**Ветка:** `master` (работа велась в `feature/android-release` и `fix-apk-issues`,
обе смержены)

---

## Контекст и решения

### Задача
Собрать **нативный** APK (Capacitor) и опубликовать Lex в RuStore и AppGallery.

### Почему не PWABuilder
PWABuilder генерирует **TWA** — обёртку вокруг Chrome Custom Tabs. Требует установленного
Chrome, нет доступа к нативным API, и RuStore прямо называет такие приложения «калькой
сайта» (частая причина отказа в модерации). TaskMan собирался через PWABuilder — для Lex
этот путь **не используем**.

В проекте уже настроен **Capacitor 8** — настоящая нативная сборка: собственный WebView
(Chrome не нужен), нативные плагины, нативные иконки/заставка, в перспективе — RuStore
Billing SDK (B-8).

### Решения пользователя (2026-10-02)
1. **Способ сборки:** Docker (JDK + Android SDK в контейнере). Систему не засоряем,
   сборка воспроизводима, легко вынести в CI.
2. **Keystore:** новый, отдельный для Lex (не переиспользуем TaskMan-овский).
3. **Ориентация:** зафиксировать `portrait` (консистентно с PWA-манифестом).
4. **Формат:** только APK (AAB не нужен — RuStore и AppGallery принимают APK).
5. Аккаунты разработчика в обоих маркетплейсах уже есть (TaskMan опубликован).

### Текущее состояние (проверено 2026-10-02)

| Что | Состояние |
|---|---|
| `client/android/` | ✅ готов: `appId ru.lex.app`, `versionCode 79`, `versionName 1.28.5` |
| `minSdk / targetSdk / compileSdk` | 23 / 35 / 35 |
| Gradle wrapper | 8.11.1 |
| Блок подписи в `app/build.gradle` | ✅ есть, читает `app/keystore.properties` |
| `keystore.properties` / `.jks` | ❌ отсутствуют |
| `Makefile: android-build` | ✅ есть (`build` → `cap sync` → `gradlew assembleRelease`) |
| JDK / Android SDK локально | ❌ нет ни того, ни другого |
| Docker | ✅ 29.6.1, 400 ГБ свободно, 26 ГБ RAM |
| Node / npm | ✅ v20.20.2 / 10.8.2 |
| `client/.env.local` (VITE_APP_TOKEN) | ✅ есть (gitignored) |
| Страницы `/privacy`, `/terms` | ✅ реализованы (B-7 фактически закрыт) |
| Регистрация Service Worker | ⚠️ **безусловная** — в Capacitor ломает обновления |
| `.gitignore` для keystore | ⚠️ `*.jks` / `*.keystore` закомментированы |
| `google-services.json` | отсутствует (GMS не используется — плюс для AppGallery) |

### Уточнение порядка относительно устного варианта плана
Semver-бамп выполняется **ДО сборки APK** (шаг 2), а не после: `versionName`/`versionCode`
вшиваются в APK при сборке, поэтому версия должна быть финальной к моменту `gradlew
assembleRelease`. В шаге 9 остаётся только документация и финальная сверка.

---

## План

```
1. [x] Инфраструктура сборки APK (Docker)
       - Навыки: koda-coder
       - Dockerfile: eclipse-temurin JDK (21 — проверить требование Capacitor 8 / AGP 8.x),
         Android cmdline-tools, platform-35, build-tools 35.0.0, принятые лицензии
       - Makefile-цель android-apk: docker run с volume-кэшами Gradle/SDK,
         монтирование client/, запуск от $(id -u):$(id -g) (иначе артефакты от root)
       - Проверка: контейнер собирается, `sdkmanager --list` видит platform-35
       - Файлы:
           - docker/android/Dockerfile
           - Makefile
           - .dockerignore
       - РЕЗУЛЬТАТ: сделано. Образ `lex-android-builder` (JDK 21 Temurin + cmdline-tools
         11076708 + platform-36 + build-tools 36.0.0). Цели `make android-builder` и
         `make android-apk`. Кэш Gradle — `.gradle-docker/` (в .gitignore), автофикс прав
         через одноразовый контейнер (sudo не нужен). Keystore монтируется read-only
         из `$(HOME)/lex-keystore`.

2. [x] Правки Android-проекта + semver-бамп перед сборкой
       - Навыки: koda-coder, semver-checker
       - Отключить регистрацию Service Worker на нативной платформе
         (Capacitor.isNativePlatform() — иначе SW отдаёт старый бандл после обновления APK)
       - Зафиксировать portrait: android:screenOrientation="portrait" в AndroidManifest.xml
       - Ревизия манифеста: allowBackup, dataExtractionRules, permissions, exported
       - Semver-бамп 1.28.5 → 1.29.0 (minor), versionCode 79 → 80
         во всех файлах: pyproject.toml, client/package.json, client/src-tauri/tauri.conf.json,
         client/src-tauri/Cargo.toml, client/android/app/build.gradle, KODA.md
         + lock-файлы: uv.lock, client/package-lock.json, client/src-tauri/Cargo.lock
       - Проверка: `make check` (tsc, eslint, vitest, ruff, pytest) — всё зелёное
       - Файлы:
           - client/src/main.tsx
           - client/android/app/src/main/AndroidManifest.xml
           - pyproject.toml, client/package.json, client/src-tauri/tauri.conf.json,
             client/src-tauri/Cargo.toml, client/android/app/build.gradle, KODA.md
           - uv.lock, client/package-lock.json, client/src-tauri/Cargo.lock
       - РЕЗУЛЬТАТ: сделано, но с двумя незапланированными находками:
         (а) КОНФЛИКТ CAPACITOR 7/8. `client/android/` был сгенерирован CLI 7.x, а
             библиотеки стояли 8.x. Сборка падала с `Duplicate class kotlin.*`
             (kotlin-stdlib 1.6.21 из cordova-android 10.1.1 против 1.8.22 из Capacitor 8).
             Исправлено: `variables.gradle` приведён к шаблону Capacitor 8
             (minSdk 24, compileSdk 36, targetSdk 35, cordovaAndroidVersion 14.0.1,
             androidx* по шаблону), AGP 8.7.2 → 8.13.0, Gradle 8.11.1 → 8.14.3.
             ВАЖНО: `@capacitor/cli` остался 7.x — CLI 8 требует Node ≥ 22 (у нас 20.20.2).
             `cap sync` регенерирует `capacitor-cordova-android-plugins/` из шаблона CLI 7,
             но `variables.gradle` НЕ перезаписывается и перекрывает дефолты — поэтому
             сборка стабильна. Обновление Node до 22 — отдельная задача.
         (б) SW РЕГИСТРИРОВАЛСЯ БЕЗУСЛОВНО. Правки в `main.tsx` было недостаточно:
             `vite-plugin-pwa` инжектит `registerSW.js` в `index.html` в обход кода.
             Исправлено через `injectRegister: null` в `client/vite.config.ts` —
             теперь регистрация только из `main.tsx` с проверкой `isNativePlatform()`.
             Проверено: `registerSW.js` отсутствует в dist и в APK.
         Также: `android/**` добавлен в ignores `client/eslint.config.js` (eslint ругался
         на сгенерированные файлы сборки).

3. [x] Подпись release-сборки
       - Навыки: koda-coder
       - Сгенерировать keystore (в Docker, JDK локально не нужен):
           keytool -genkeypair -v -keystore lex.jks -alias lex -keyalg RSA \
             -keysize 4096 -validity 10000 -storetype PKCS12
       - Создать client/android/app/keystore.properties (storeFile=lex.jks, ...)
       - Раскомментировать *.jks / *.keystore в client/android/.gitignore,
         добавить keystore.properties
       - Проверить, что signingConfig реально применяется к buildTypes.release
         (сейчас блок создаётся внутри `release {}` — валидировать на сборке)
       - ⚠️ Пароли сохранить в менеджере паролей. Потеря ключа = невозможность
         обновлять приложение (смена подписи только через поддержку RuStore)
       - Файлы:
           - client/android/app/lex.jks (gitignored)
           - client/android/app/keystore.properties (gitignored)
           - client/android/.gitignore
           - client/android/app/build.gradle
       - РЕЗУЛЬТАТ: сделано. Keystore лежит ВНЕ репозитория: `~/lex-keystore/lex.jks`
         (решение пользователя — переживает `git clean -xdf` и переустановку системы).
         `keystore.properties` содержит абсолютный путь, gitignored, chmod 600.
         Сертификат: CN=Lex, O=Andrey Bogatyrev, C=RU; RSA 4096; SHA384withRSA;
         срок до 2054-02-17. SHA-256 отпечаток: 97eedca620b6a2d24c72efb17958759e
         0d2d4ce1fdcfe28d878b3afa15002e19. Пароль сгенерирован случайно (32 символа),
         передан пользователю один раз, временные файлы удалены.
         signingConfig применяется корректно (проверено apksigner).

4. [x] Сборка и проверка APK
       - Навыки: koda-coder
       - make android-apk → подписанный APK
       - apksigner verify --print-certs (подпись + отпечаток сертификата)
       - aapt2 dump badging (versionCode, versionName, targetSdk, permissions, ориентация)
       - Проверить, что в APK нет ссылок на Google Play
       - Артефакт: client/android/app/build/outputs/apk/release/app-release.apk
       - РЕЗУЛЬТАТ: сделано. APK 4.9 МБ, скопирован в `/home/abo/lex-1.29.0.apk`
         (sha256 46e789679627775dee3686ee85a4aed50fd959038f0a5096da964ffed3ade906).
         package ru.lex.app, versionCode 80, versionName 1.29.0, minSdk 24,
         targetSdk 35, compileSdk 36. Разрешения: только INTERNET (+ служебное
         DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION). Ориентация portrait подтверждена
         в манифесте APK. Ссылок на Google Play и классов com.google.android.gms
         в dex нет. Прокси-URL https://lextr.ru вшит в бандл, VITE_APP_TOKEN вшит.
         В Dockerfile добавлен build-tools в PATH (apksigner/aapt2 доступны).

5. [x] Проверка прод-конфигурации прокси
       - Навыки: koda-coder
       - ALLOWED_ORIGINS содержит https://localhost (origin Capacitor WebView)
       - APP_TOKENS на сервере совпадает с VITE_APP_TOKEN из client/.env.local
       - MIN_APP_VERSION не выше 1.29.0 (иначе свежий APK сразу получит 426)
       - Проверить, что политика конфиденциальности упоминает Яндекс (передача данных
         третьим лицам) — требование модерации
       - Файлы: (сервер) /home/abo/lex/.env, client/.env.local, client/src/pages/Privacy.tsx
       - РЕЗУЛЬТАТ: всё проверено на проде (lextr.ru, ssh taskman-prod):
         APP_TOKENS задан (1 токен), его sha256 совпадает с VITE_APP_TOKEN из
         client/.env.local (53f34aa69001ec62) — токен в APK рабочий.
         MIN_APP_VERSION не задан → 426 не грозит. ALLOWED_ORIGINS не задан →
         работает дефолт из proxy/main.py, включающий https://localhost.
         CORS preflight с Origin: https://localhost → 200, разрешены
         X-App-Token / X-App-Version / X-Device-Id. GET /quota с заголовками APK → 200,
         без токена → 403. /privacy и /terms → 200. Политика конфиденциальности
         упоминает Яндекс (Translate, SpeechKit, Dictionary) и Telegram.

6. [x] Тестирование на устройстве
       - Навыки: —
       - Установка APK (adb install / вручную), smoke-тест: перевод, TTS, словарь, повторения
       - Офлайн-режим (словарь и повторения без сети)
       - Кнопка «Назад» (не выходит в пустую историю)
       - Поворот экрана (должен остаться portrait), тёмная тема, статус-бар
       - Обновление поверх предыдущей версии (проверка versionCode)
       - Проверить, что SW не регистрируется (DevTools → Application → Service Workers)
       - РЕЗУЛЬТАТ: APK установлен на реальное устройство. Найдено 7 проблем
         (см. раздел «Результаты тестирования на устройстве» ниже). Пункт не закрыт —
         требуется исправление и повторная проверка.
       - ЗАКРЫТО (2026-10-04): после двух раундов исправлений (v1.29.1, v1.29.2)
         пользователь подтвердил на устройстве, что все проблемы устранены.
         Коммит a7bc75e (v1.29.2) смержен в master, запушен, задеплоен на стейдж
         и прод. П-7 (DevTools) — не дефект, а инструмент отладки: в release
         WebView debugging отключён намеренно, для отладки есть `make android-apk-debug`.

7. [ ] Публикация в RuStore
       - Навыки: —
       - Загрузка APK, карточка, скриншоты, политика, рейтинг
       - Модерация (от нескольких часов до нескольких дней)
       - Действия пользователя (чек-лист будет подготовлен)

8. [ ] Публикация в AppGallery
       - Навыки: —
       - Аналогично; проверить отсутствие зависимостей от Google Play Services
       - Действия пользователя (чек-лист будет подготовлен)

9. [ ] Пост-релиз
       - Навыки: semver-checker, docs-update
       - VITE_RUSTORE_URL = ссылка на карточку → пересборка APK (следующий релиз)
       - Обновить README, KODA.md, .koda/backlog.md (B-7 → done)
       - Финальная сверка версии во всех файлах
```

---

## Результаты тестирования на устройстве (2026-10-02, v1.29.0)

Пользователь установил APK на реальный телефон. Найдено 7 проблем. Ниже — каждая
с гипотезой о причине (проверено по коду) и предлагаемым направлением решения.
**Публикация в маркетплейсах блокируется до исправления пунктов 1, 3, 4, 5, 6.**

> **Статус (2026-10-03, v1.29.1):** П-1…П-7 исправлены в ветке `feature/android-release`
> (план `.koda/plans/android-device-fixes.md`). П-4 — поддержка `TELEGRAM_PROXY` в
> `feedback.py`/`notifier.py` (прокси поднимается на стейдже, задаётся на проде);
> П-1+П-3 — `--safe-area-inset-top` в `main` + `windowSoftInputMode="adjustResize"`;
> П-5 — короткие подписи навбара (`nav.translate_short`/`nav.settings_short`) и
> `.bottom-nav-label` как block; П-6 — `display: flow-root` для `h1` в мобильном
> `.home-hero`; П-2 — предупреждение `review.tts_offline` на стартовом экране Review;
> П-7 — цель `make android-apk-debug`. Осталось: smoke-тест на устройстве (шаг 9 плана).

> **Статус (2026-10-04, v1.29.2):** повторный smoke-тест показал, что П-1, П-2, П-3
> остались, и выявил новую проблему П-8 (кнопка «Назад» закрывала приложение).
> Настоящие причины оказались другими:
> - **П-1** — `StatusBar.overlaysWebView` по умолчанию `true` (WebView под статус-баром),
>   а `SystemBars` инжектит ненулевой `--safe-area-inset-top` только на Android 15+ /
>   WebView ≥ 140. Исправлено: `overlaysWebView: false` в `capacitor.config.ts`.
> - **П-2** — в манифесте не было `ACCESS_NETWORK_STATE`, поэтому `navigator.onLine`
>   в WebView всегда `true`. Плюс предупреждение перенесено на стартовый экран Review
>   красной плашкой и убрано с карточки тренировки (решение пользователя).
> - **П-3** — на Android 15+ edge-to-edge принудительный, `adjustResize` игнорируется.
>   Исправлено через `visualViewport` → `--lex-keyboard-inset` (`services/keyboardInset.ts`).
> - **П-8** — `MainActivity.onBackPressed()`: `goBack()` при непустой истории, иначе
>   `moveTaskToBack(true)`.
> Подробности — в `.koda/plans/android-device-fixes.md`, раздел «Раунд 2».

> **ИТОГ (2026-10-04, v1.29.2):** пользователь проверил APK 1.29.2 на устройстве —
> **все проблемы устранены**. Коммит `a7bc75e` смержен в `master`, запушен,
> `make deploy` выполнен на стейдже и на проде. Шаг 6 (тестирование на устройстве)
> закрыт. **П-7 (DevTools) — не блокер:** это инструмент отладки, а не дефект;
> в release-сборке WebView debugging отключён намеренно, для отладки есть
> `make android-apk-debug` + `chrome://inspect`. Блокеров публикации не осталось —
> можно переходить к шагам 7–8 (RuStore, AppGallery).

### П-1. Нет отступа от верхней части экрана (контент обрезан)
**Симптом:** контент приложения упирается в верхнюю кромку экрана, местами обрезан.
**Причина (гипотеза, высокая уверенность):** в `client/index.html` включён
`viewport-fit=cover`, но `safe-area-inset-top` нигде не используется
(`grep safe-area-inset-top client/src/` — пусто). В браузере это не проявляется
(там есть адресная строка), а в нативном WebView контент уходит под статус-бар.
`android:windowSoftInputMode` в манифесте не задан.
**Направление решения:** добавить `padding-top: env(safe-area-inset-top)` для
`main`/`.container` (по аналогии с существующим `padding-bottom` для bottom-nav),
либо отключить `viewport-fit=cover` для нативной платформы. Проверить на устройстве
с «вырезом» и без.

### П-2. В Review офлайн нет предупреждения про озвучку
**Симптом:** офлайн в режиме Повтор нет сообщения, что не все слова будут озвучены.
**Причина (гипотеза, высокая уверенность):** `OfflineIndicator` подключён ТОЛЬКО
в `Add.tsx` (строка 454). В `Review.tsx` его нет. Ранее (коммит 0dfbdd3) в Review
добавлялось предупреждение об офлайн-TTS, но, судя по всему, оно было откачено
вместе с тестами (см. заметку в KODA.md про flaky-тесты с `navigator.onLine`).
**Направление решения:** вернуть предупреждение в Review — либо переиспользовать
`OfflineIndicator`, либо отдельный текст про TTS из кеша. Учесть прошлую проблему
с тестами: `Object.defineProperty(navigator, "onLine")` в jsdom даёт flaky-тесты
при полном прогоне — нужен другой способ мока (например, `vi.stubGlobal` с
восстановлением, или вынести проверку в отдельную функцию и мокать её).

### П-3. Add: экран не скроллится до кнопки «Сохранить», навбар перекрыт клавиатурой
**Симптом:** после перевода экран не скроллится вниз до кнопки «Сохранить в словарь»;
навбар перекрыт всплывающей клавиатурой. В мобильном браузере скроллится нормально.
Закрытие клавиатуры тапом по экрану решает проблему.
**Причина (гипотеза, средняя уверенность):** `android:windowSoftInputMode` не задан
в `AndroidManifest.xml` → Android использует дефолт (`adjustResize`/`adjustPan`
зависит от версии и темы). При `adjustPan` окно не ресайзится, а панорамируется —
поэтому нижняя часть (кнопка, навбар) остаётся за клавиатурой и скролл не помогает.
**Направление решения:** задать `android:windowSoftInputMode="adjustResize"` для
`MainActivity` в манифесте. Дополнительно проверить, что `main` имеет достаточный
`padding-bottom` и что кнопка «Сохранить» не перекрывается `.bottom-nav`
(floating pill). Возможно, потребуется `scrollIntoView` после успешного перевода.

### П-4. Feedback не отправляется («failed to send»)
**Симптом:** на экране Настроек отправка обратной связи падает с ошибкой.
**Причина (УСТАНОВЛЕНА, не гипотеза):** Telegram Bot API недоступен с прод-сервера.
Проверено на `taskman-prod`: `curl https://api.telegram.org/` → код `000`
(таймаут 7.7 с). В логах прокси: `POST /feedback` → `502 Bad Gateway` (и `429`
от собственного троттлинга при повторных попытках). Это та же блокировка ТСПУ,
что наблюдалась локально (см. заметку в KODA.md про TaskMan).
**Направление решения:** добавить поддержку `TELEGRAM_PROXY` в
`proxy/services/feedback.py` (и в `notifier.py`/`report.py` — они используют тот же
Telegram API, значит алерты и ежедневный отчёт тоже НЕ работают на проде!).
Прокси задаётся env-переменной, `urllib`/`httpx` подхватывают её. Это отдельная
задача, но она блокирует и feedback, и мониторинг.
**ВАЖНО:** проверить, работает ли Telegram с прода через прокси вообще, и есть ли
у пользователя подходящий прокси-сервер.

### П-5. Русский интерфейс: подписи навбара сливаются
**Симптом:** «ГлавнаяПереводчикПовтор СловарьНастройки» — текст подписей сливается
друг с другом. На английском нормально.
**Причина (гипотеза, высокая уверенность):** `.bottom-nav-label` имеет
`max-width: 5rem` и `text-overflow: ellipsis`, но при 5 пунктах на узком экране
русские подписи («Переводчик», «Настройки») длиннее английских («Translate»,
«Settings») и не помещаются — при этом `white-space: nowrap` + `overflow: hidden`
должны обрезать, а не сливать. Вероятно, проблема в `flex: 1` + `min-width: 0`
у `.bottom-nav-item`: подписи выходят за границы и визуально стыкуются.
**Направление решения:** проверить на реальном устройстве/эмуляторе с русской
локалью. Варианты: уменьшить `font-size`, сократить русские подписи
(«Главная» → «Главная», «Переводчик» → «Перевод», «Настройки» → «Ещё»),
или добавить `padding` между пунктами. Возможно, стоит пересмотреть i18n-ключи
`nav.*` для мобильного навбара (короткие варианты).

### П-6. Home: английский заголовок не влезает справа от маскота
**Симптом:** на английском текст «vocabulary trainer» не влезает в одну строку
справа от маскота — слово «trainer» переносится на новую строку слева под маскотом,
хотя остальной текст справа. Ожидается: весь заголовок справа от маскота,
описание начинается слева под маскотом.
**Причина (гипотеза, высокая уверенность):** на мобильных `.home-hero` становится
`display: block`, а маскот — `float: left` (index.css, `@media max-width: 576px`).
Заголовок `<h1>` обтекает float, и при нехватке ширины переносится под маскот.
`clear: left` стоит только на `p.lex-hint` (описании), но не на `<h1>`.
**Направление решения:** либо обернуть `<h1>` в блок с `overflow: hidden` /
`display: flow-root` (создаёт BFC и не даёт тексту уходить под float), либо
пересмотреть разметку: маскот и заголовок в отдельном flex-контейнере, описание —
под ним. Второй вариант чище и соответствует ожидаемому поведению из описания.
Учесть, что для русского заголовка («Lex — переводчик и тренер слов») проблема
может быть менее заметна, но решение должно работать для обоих языков.

### П-7. DevTools на телефоне недоступен
**Симптом:** нет возможности открыть DevTools на устройстве.
**Причина:** в release-сборке Capacitor WebView debugging отключён (это нормально
и правильно для продакшена).
**Направление решения:** для отладки собирать debug-вариант
(`./gradlew assembleDebug`) или временно включить `WebView.setWebContentsDebuggingEnabled(true)`
в `MainActivity` для debug-сборки. Также можно использовать `chrome://inspect`
при подключении по USB. Отдельная задача — не блокирует публикацию.
**ЗАКРЫТО (2026-10-04):** не дефект, а инструмент отладки. Цель `make android-apk-debug`
реализована в v1.29.1 (assembleDebug, WebView debugging включён автоматически для
debug-сборок). Работ не требует.

### Что НЕ проверено из-за П-7
- Регистрация Service Worker (DevTools → Application → Service Workers).
  Косвенно подтверждено: `registerSW.js` отсутствует в APK, регистрация в бандле
  обёрнута в проверку `isNativePlatform()`.
- Кнопка «Назад», поворот экрана, тёмная тема, статус-бар, обновление поверх
  предыдущей версии — требуют повторной проверки после исправлений.

### Порядок исправления (предложение)
1. **П-4** (feedback + мониторинг) — инфраструктурная, блокирует и алерты.
2. **П-1** (safe-area) и **П-3** (клавиатура) — обе про Android-манифест и layout,
   логично делать вместе.
3. **П-5** и **П-6** — UI-правки, независимы друг от друга.
4. **П-2** (офлайн в Review) — с учётом прошлой проблемы с тестами.
5. **П-7** — отладочная сборка, по желанию.

После исправлений: пересборка APK с versionCode 81 (если 80 уже где-то засветился)
или 80 (если нет), повторный smoke-тест, затем шаги 7–8.

---

---

## Что требуется от пользователя

### До старта работ
- [x] Выбрать способ сборки → **Docker**
- [x] Решить по keystore → **новый, отдельный для Lex**
- [x] Решить по ориентации → **зафиксировать portrait**
- [x] Решить по формату → **только APK**

### В процессе
- [x] Сохранить пароли keystore в менеджере паролей (шаг 3)
- [~] Протестировать APK на реальном устройстве (шаг 6) — найдено 7 проблем,
      см. раздел «Результаты тестирования на устройстве»
- [ ] Подготовить материалы для карточек (шаг 7–8):
  - 3–8 скриншотов (телефон, портрет)
  - иконка 512×512 (есть `client/public/android-chrome-512x512.png`)
  - короткое описание (до 80 символов) и полное описание
  - категория: «Образование»
  - возрастной рейтинг: 0+ / 6+
  - URL политики конфиденциальности: `https://lextr.ru/privacy`
  - URL условий использования: `https://lextr.ru/terms`
- [ ] Загрузить APK и заполнить карточки в консолях RuStore и AppGallery

---

## Риски и открытые вопросы

1. **Версия JDK.** Capacitor 8 / AGP 8.x может требовать JDK 21 (Capacitor 7 требовал 21).
   Уточнить при создании Dockerfile; при несовпадении — поправить базовый образ.
2. **Права root при Docker-сборке.** Без `--user $(id -u):$(id -g)` артефакты в
   `client/android/app/build/` и `client/dist/` окажутся от root. Решить в шаге 1.
3. **Service Worker в Capacitor.** Безусловная регистрация SW — известная проблема:
   после обновления APK WebView может отдавать старый бандл из precache. Фикс в шаге 2
   обязателен до публикации.
4. **Модерация RuStore.** Приложение не должно выглядеть «калькой сайта». Аргументы для
   карточки: local-first (работает офлайн), SRS-тренажёр, словарь, статистика — это
   самостоятельная ценность, а не обёртка.
5. **AppGallery и GMS.** Lex не использует Google Play Services (`google-services.json`
   отсутствует) — блокирующих проблем быть не должно.
6. **RuStore Update SDK.** Опционально: SDK для проверки обновлений внутри приложения.
   Можно отложить на следующий релиз (сейчас есть version gate на прокси).
7. **Первый релиз = versionCode 80.** Убедиться, что в консоли RuStore/AppGallery нет
   ранее загруженных версий с большим versionCode.

## Риски, подтвердившиеся на практике

1. **Конфликт Capacitor CLI 7 / библиотеки 8.** `client/android/` был сгенерирован
   CLI 7.x, библиотеки обновлены до 8.x — сборка падала с `Duplicate class kotlin.*`.
   Исправлено в шаге 2 (см. результат). Остаточный риск: `@capacitor/cli` 7.x
   регенерирует `capacitor-cordova-android-plugins/` из старого шаблона при каждом
   `cap sync`. Сейчас это безвредно (`variables.gradle` перекрывает дефолты), но при
   обновлении Capacitor нужно сначала поднять Node до 22 и CLI до 8.x.
2. **Telegram Bot API недоступен с прод-сервера** (ТСПУ). Ломает feedback, алерты
   и ежедневный отчёт. Требует `TELEGRAM_PROXY` — см. П-4.
3. **`viewport-fit=cover` без `safe-area-inset-top`** — контент уходит под статус-бар
   в нативном WebView. См. П-1.
4. **`windowSoftInputMode` не задан** — клавиатура перекрывает нижнюю часть экрана.
   См. П-3.

---

## Полезные команды (для справки)

```bash
# Сборка APK (после реализации шага 1)
make android-apk

# Проверка подписи
apksigner verify --print-certs client/android/app/build/outputs/apk/release/app-release.apk

# Метаданные APK
aapt2 dump badging client/android/app/build/outputs/apk/release/app-release.apk

# Установка на устройство
adb install -r client/android/app/build/outputs/apk/release/app-release.apk
```

---

## Ссылки
- RuStore: требования к приложениям — https://www.rustore.ru/help/developers/publishing-and-verifying-apps/requirement-apps
- RuStore: подписи APK/AAB — https://www.rustore.ru/help/developers/publishing-and-verifying-apps/app-publication/apk-signature
- RuStore: как подписать приложение — https://www.rustore.ru/help/guides/sign-apk
- Бэклог проекта: `.koda/backlog.md` (B-7 политика/условия, B-8 RuStore Billing)
