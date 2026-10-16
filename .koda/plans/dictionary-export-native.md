# Экспорт словаря в Android-приложении (Capacitor)

**Статус:** реализовано (шаги 1-9), ожидает smoke-теста на устройстве (шаг 10).
**Дата:** 2026-10-16
**Ветка:** `feature/dictionary-export` (создать от `master`)
**Версия:** 1.30.2 → **1.30.3** (patch), versionCode 85 → **86**

## Проблема

В APK (1.30.0 и 1.30.2) нажатие «Экспорт» на странице «Словарь» не делает ничего.
В том же приложении, установленном из Chrome как значок (PWA), экспорт работает и
кладёт `lex-dictionary.json` в «Загрузки».

## Причина (установлена)

`client/src/pages/Dictionary.tsx`, `handleExport` использует веб-приём:

```ts
const url = URL.createObjectURL(blob);
const a = document.createElement("a");
a.href = url; a.download = "lex-dictionary.json";
a.click();
URL.revokeObjectURL(url);
```

1. **Основная причина.** Чтобы клик по ссылке с `download:` что-то сделал внутри
   Capacitor WebView, нативный код обязан зарегистрировать
   `WebView.setDownloadListener(...)`. В `@capacitor/android` его нет
   (`grep -rn setDownloadListener node_modules/@capacitor/android/.../java/` →
   0 совпадений; реализован только `onShowFileChooser` в
   `BridgeWebChromeClient.java`). В `MainActivity.java` у нас только
   `onBackPressed`. Клик уходит в нишу — тихо, без ошибки.
   Побочное подтверждение: **импорт** словаря работает, потому что выбор файла
   Capacitor поддерживает.
2. **Второй, независимый дефект** в тех же строках: `URL.revokeObjectURL(url)`
   вызывается синхронно сразу после `a.click()`. Загрузка асинхронна, blob может
   быть отозван до её старта. В Chrome «везёт», но это хрупко.

## Выбранное решение (Вариант A, утверждён)

Новый модуль `client/src/services/exportFile.ts` с одной публичной функцией
`saveJsonFile(fileName, text): Promise<void>`, которая выбирает путь по платформе:

- **Нативная платформа** (`Capacitor.isNativePlatform()` → Android):
  `Filesystem.writeFile({ path, data: <base64>, directory: Directory.Cache,
  recursive: true })` → `Filesystem.shareFile({ path, dialogTitle })`.
  Пользователь в системном диалоге выбирает «Файлы» / Google Drive / Telegram —
  то есть файл реально сохраняется. Разрешений Android не требуется (Cache +
  FileProvider из манифеста плагина).
- **Веб и десктоп** (PWA, Tauri): остаётся `<a download>` + blob URL, но
  `revokeObjectURL` переносится в `setTimeout(..., 1000)`.

Плагин подключается **динамическим `import()`** внутри нативной ветки, чтобы
~20 КБ кода не попадали в веб/PWA-бандл и в precache service worker.

**Почему не Вариант B** (`DownloadListener` + `DownloadManager` в
`MainActivity.java`): `DownloadManager` не умеет скачивать `blob:` URL,
понадобился бы собственный мост с base64 — больше нативного кода ради того же
результата.

**Известное ограничение варианта A (принято):** файл не кладётся в «Загрузки»
автоматически, нужен один тап в share-диалоге.

## Открытые риски (зафиксировать при проверке)

- **Tauri (desktop).** `Capacitor.isNativePlatform()` там возвращает `false`,
  значит идёт веб-ветка с `<a download>`. Если в WebView Tauri скачивание
  блокируется — это отдельная задача (`@tauri-apps/plugin-dialog` +
  `plugin-fs`), в этот план не входит.
- Большой словарь (лимит импорта — 10 000 записей) даёт ~5 МБ JSON → ~7 МБ
  base64 через Capacitor-мост. Работает медленно, но приемлемо; отдельной
  оптимизации не делаем.
- iOS в плане не учитываем — сборок для iOS нет (ветка кода универсальная).

---

## План работ

1. [x] **Шаг 1. Зависимость**
   - Навыки: `koda-coder`
   - Действия:
     - `cd client && npm install @capacitor/filesystem@^8.1.5`
       (мажор 8 = текущим `@capacitor/core` 8.4.2; `@capacitor/cli` остаётся 7.x —
       известная готча проекта, CLI 8 требует Node ≥ 22)
     - `npx cap sync android` → в выводе плагин `@capacitor/filesystem` должен
       появиться в списке найденных плагинов
   - Файлы:
     - `client/package.json`
     - `client/package-lock.json`
     - `client/android/capacitor.settings.gradle` (изменится только если cap sync
       решит иначе — проверить diff)

2. [x] **Шаг 2. Модуль сохранения файла**
   - Навыки: `koda-coder`
   - Действия: создать `saveJsonFile(fileName: string, text: string)`:
     - `if (Capacitor.isNativePlatform())` → динамический `import
       ("@capacitor/filesystem")`, `Directory.Cache`, base64 через `FileReader`
       на `new Blob([text])`, затем `shareFile`
     - иначе → `URL.createObjectURL` + `<a download>` + `a.click()` +
       `URL.revokeObjectURL` в `setTimeout(..., 1000)`
     - ошибки не глотать — пробрасывать наружу (вызывающий код покажет сообщение)
   - Файлы:
     - `client/src/services/exportFile.ts` (новый)

3. [x] **Шаг 3. Страница «Словарь»**
   - Навыки: `koda-coder`
   - Действия:
     - `handleExport` → собрать JSON и вызвать `saveJsonFile("lex-dictionary.json",
       json)`, убрать локальную работу с blob/anchor
     - обернуть в `try/catch`: при ошибке — состояние `exportError` и
       сообщение `lex-alert lex-alert--error` под тулбаром (пустой словарь тоже
       не должен «молча» срабатывать: если слов 0 — показывать
       `dictionary.import_empty`-подобное сообщение)
   - Файлы:
     - `client/src/pages/Dictionary.tsx`

4. [x] **Шаг 4. Переводы**
   - Навыки: `koda-coder`
   - Действия: ключ `dictionary.export_error` (ru: «Не удалось сохранить файл:
     попробуйте ещё раз.» / en: «Could not save the file. Please try again.»)
     + заголовок share-диалога `dictionary.export_share_title` (ru «Экспорт
     словаря», en «Export dictionary»), если решаем выносить строку в i18n
   - Файлы:
     - `client/src/i18n/ru.json`
     - `client/src/i18n/en.json`

5. [x] **Шаг 5. Тесты модуля сохранения**
   - Навыки: `koda-coder`
   - Действия: `client/src/test/exportFile.test.ts`:
     - веб-ветка: патчим `URL.createObjectURL`/`revokeObjectURL` как статики
       (готовчая готча из `ttsApi.test.ts` — **не** трогать глобал `URL` через
       `vi.stubGlobal`), мокаем `HTMLAnchorElement.prototype.click`, проверяем
       `download === fileName` и что revoke вызывается асинхронно
       (`vi.useFakeTimers({ toFake: ["Date", "setTimeout"] })` — полный режим
       ломает fake-indexeddb, см. готчу daily-stats)
     - нативная ветка: `vi.mock("@capacitor/core", ...)` → `isNativePlatform:
       () => true`, `vi.mock("@capacitor/filesystem")` и проверка, что
       `writeFile` получил `Directory.Cache` + base64, а `shareFile` — тот же путь
   - Файлы:
     - `client/src/test/exportFile.test.ts` (новый)

6. [x] **Шаг 6. Тесты страницы**
   - Навыки: `koda-coder`
   - Действия: в `client/src/test/Dictionary.test.tsx` добавить:
     - клик «Экспорт» вызывает `saveJsonFile` с именем `lex-dictionary.json`
     - при reject `saveJsonFile` на странице появляется текст ошибки
     - мок `@/services/exportFile` через `vi.mock` (jsdom не умеет реальный
       download)
   - Файлы:
     - `client/src/test/Dictionary.test.tsx`

7. [x] **Шаг 7. Проверки**
   - Навыки: `koda-coder`
   - Действия:
     - `cd client && npm run lint`
     - `npm run test`
     - `npm run build`
     - `uv run ruff check proxy/ && uv run pytest tests/` (регрессия прокси —
       изменений нет, но прогон дешёвый; для pytest симулировать CI:
       `YANDEX_API_KEY= uv run pytest tests/`)
   - Файлы: — (только запуск)

8. [x] **Шаг 8. Пересборка APK**
   - Навыки: `koda-coder`
   - Действия (после шага 9 — бампа версии, иначе versionCode в APK будет старый):
     - `make android-apk` (Docker-билдер, нужен `client/android/app/keystore.properties`)
     - `apksigner verify --print-certs <apk>`
     - `aapt2 dump badging <apk> | grep package` → версия и versionCode
     - проверить merged-манифест на наличие `androidx.core.content.FileProvider`
       от плагина filesystem:
       `grep -r FileProvider client/android/app/build/intermediates/merged_manifests/`
   - Файлы: артефакт вне репозитория (`/home/abo/lex-1.30.3.apk`)

9. [x] **Шаг 9. Документация + semver**
   - Навыки: `semver-checker`, `docs-update`
   - Действия:
     - тип бампа — **patch** (исправление бага + новая npm-зависимость),
       1.30.2 → **1.30.3**, versionCode **86**
     - файлы версии: `pyproject.toml`, `client/package.json`,
       `client/src-tauri/tauri.conf.json`, `client/src-tauri/Cargo.toml`,
       `client/android/app/build.gradle`, `KODA.md`
     - lock-файлы командами: `uv lock`, `cd client && npm install
       --package-lock-only`, `cd client/src-tauri && cargo update -p lex --offline`
     - `KODA.md`: в раздел «Client» — правило про экспорт файла (нативная ветка =
       Filesystem+shareFile, веб = `<a download>`, revoke откладывать;
       `setDownloadListener` в Capacitor отсутствует)
     - `README.md`: раздел про экспорт/импорт — уточнить про share-диалог в Android
   - Файлы:
     - `KODA.md`, `README.md`
     - `pyproject.toml`, `client/package.json`,
       `client/src-tauri/tauri.conf.json`, `client/src-tauri/Cargo.toml`,
       `client/android/app/build.gradle`
     - `uv.lock`, `client/package-lock.json`, `client/src-tauri/Cargo.lock`

10. [ ] **Шаг 10. Smoke-тест на устройстве (пользователь)**
    - Навыки: — (ручная проверка)
    - Действия:
      - APK 1.30.3 на устройство → «Словарь» → «Экспорт» → появляется системный
        диалог, файл долетает до «Файлов»/Telegram
      - PWA в Chrome: экспорт по-прежнему кладёт `lex-dictionary.json` в
        «Загрузки» (регрессия после переноса revoke)
      - Импорт этого файла обратно в приложение
      - Отдельно: desktop-сборка (Tauri) — убедиться, что `<a download>` там
        работает; если нет — завести отдельную задачу

---

## Отклонение от плана (обнаружено на шаге 1)

`Filesystem.shareFile` НЕ существует в стабильной ветке 8.x — он появился
только в `8.2.0-next.*` (pre-release). Стабильная замена — отдельный официальный
плагин `@capacitor/share@8.0.3`: `Share.share({ files: [uri], dialogTitle })`,
где `uri` берётся из `Filesystem.getUri()`. Он тоже требует FileProvider — он
уже объявлен в `AndroidManifest.xml` (`${applicationId}.fileprovider`), а
`res/xml/file_paths.xml` содержит нужный `cache-path`. Итог: установлены ДВА
плагина (`@capacitor/filesystem` для записи + `@capacitor/share` для диалога).
`Encoding.UTF8` вместо base64 — плагин сам кодирует строку, base64-конвертер
не понадобился.

## Что НЕ входит в план

- Автономная запись в «Загрузки» Android без участия пользователя.
- Поддержка скачивания в Tauri через нативный dialog (отдельная задача при
  подтверждении проблемы).
- Экспорт в форматах, отличных от JSON (CSV и т.п.).
