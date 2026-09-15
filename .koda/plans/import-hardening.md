# План: Защита импорта словаря (hardening import)

Дата: 2026-09-16. Ветка: создать feature-ветку при старте (например `import-hardening`).
Текущая версия: 1.24.0.

## Цель
Импорт словаря (Dictionary.tsx → importWords) не должен позволять сломать
приложение гигантским файлом или мусорными данными: лимит размера файла,
лимит количества записей, валидация/санитизация каждой записи, атомарный
быстрый импорт через транзакцию.

## Контекст (найденные проблемы)

1. `Dictionary.tsx handleImport`: `await file.text()` читает весь файл в память,
   `JSON.parse` синхронно блокирует поток. `accept="application/json"` — не защита.
2. `importWords` (wordRepository.ts) не валидирует записи: `entry.word` может быть
   undefined/объектом/строкой в мегабайты; числовые поля (interval, know_count,
   avg_time...) не проверяются — мусор ломает SRS-вес/ранг; нет лимита количества.
3. Импорт — цикл `await db.words.add(...)` по одной записи: медленно, без
   транзакции (частичный импорт при падении), O(n) запросов на дубликаты.

## Ключевые решения

- **Лимит размера файла: 10 МБ** (`file.size` проверяется ДО чтения).
  Экспорт 10 000 слов ≈ 2–3 МБ — запас есть.
- **Лимит записей: 10 000** (проверка `data.length` после JSON.parse).
- **Валидация записи = переиспользование существующих валидаторов**
  (`validateWord`, `validateTranslation`, `validateNote` из domain/validators.ts)
  + санитизация числовых полей (clamp/дефолты, а не отбрасывание записи):
  невалидное слово/перевод → запись пропускается; некорректные числа →
  безопасные дефолты (0/null), т.к. они не критичны для целостности.
- **Результат импорта расширяется:** `{ imported, skipped, invalid }` —
  `invalid` отдельно от дублей, чтобы пользователь видел, что часть файла
  была мусором. Сообщение import_success показывает все три числа.
- **Невалидный формат верхнего уровня** (не массив / пустой массив) — как
  сейчас, import_empty; не-JSON — import_error (существующие ключи).
- **Транзакция + bulkAdd:** одна `db.transaction("rw", db.words, ...)`:
  существующие слова загружаются в `Set` одним запросом, дубликаты внутри
  файла тоже отслеживаются через Set, вставка — `bulkAdd`. Атомарно и быстро.
- **Санитизация в domain-слое:** новая функция в `domain/validators.ts`
  (`sanitizeImportEntry`), репозиторий остаётся тонким.

## Шаги

1. [ ] **Domain: sanitizeImportEntry (validators.ts)**
   - `sanitizeImportEntry(entry: unknown): Word | null`:
     - entry — не объект → null;
     - `word`/`translation` — строки, прогоняются через `validateWord` /
       `validateTranslation` (null → запись невалидна → null);
     - `note` — опционально: строка → `validateNote` (null при превышении
       длины → вся запись null; пустая → поле опускается);
     - `word_lang`/`translation_lang` — строки, иначе дефолты "en"/"ru";
       пустая строка → дефолт;
     - `last_direction` — "en_ru" | "ru_en", иначе "en_ru";
     - целочисленные (`interval`, `repetitions`, `next_review`, `know_count`,
       `forgot_count`, `hint_count`): Number.isFinite && >= 0 →
       Math.trunc, иначе 0; `interval` clamp [0, 3650] (10 лет), счётчики
       clamp [0, 1e6];
     - `best_time`/`avg_time`: Number.isFinite && > 0 → значение, иначе null;
       clamp сверху 3600.
   - Возвращаемый объект — полный `Word` без `id` (id назначает Dexie).
   - Файлы: client/src/domain/validators.ts

2. [ ] **Repository: importWords — валидация + транзакция + bulkAdd**
   - Сигнатура: `importWords(data: unknown[]): Promise<{ imported, skipped, invalid }>`.
   - Логика:
     1. `db.transaction("rw", db.words, ...)`:
     2. загрузить существующие слова: `const existing = new Set((await db.words.toArray()).map(w => w.word))`;
     3. пройти по data: `sanitizeImportEntry` → null → `invalid++`;
        слово в existing (или уже добавлено в этой партии) → `skipped++`;
        иначе — в массив на вставку + в Set;
     4. `await db.words.bulkAdd(valid)` одним вызовом;
     5. вернуть счётчики.
   - Пустой массив на вставку — не вызывать bulkAdd.
   - Файлы: client/src/data/wordRepository.ts

3. [ ] **UI: лимиты файла в Dictionary.tsx (handleImport)**
   - Константы `MAX_IMPORT_FILE_SIZE = 10 * 1024 * 1024` и
     `MAX_IMPORT_ENTRIES = 10_000` — экспортировать из validators.ts
     (или wordRepository.ts — рядом с importWords; выбрать одно место,
     лучше validators.ts, т.к. это доменные лимиты).
   - `file.size > MAX_IMPORT_FILE_SIZE` → сообщение `dictionary.import_too_large`
     (с размером в МБ), БЕЗ чтения файла.
   - `data.length > MAX_IMPORT_ENTRIES` → `dictionary.import_too_many`
     (с лимитом), без импорта.
   - Обновить вызов importWords и сообщение успеха: показать
     imported/skipped/invalid (invalid = 0 → не показывать часть про invalid,
     чтобы не шуметь в нормальном случае).
   - Файлы: client/src/pages/Dictionary.tsx

4. [ ] **i18n-ключи (ru/en)**
   - `dictionary.import_too_large`: «Файл слишком большой (максимум {max} МБ)» /
     "File is too large (max {max} MB)"
   - `dictionary.import_too_many`: «Слишком много записей (максимум {max})» /
     "Too many entries (max {max})"
   - `dictionary.import_success` — расширить: добавить параметр `invalid`
     (в ru/en формулировка «...пропущено дублей: {skipped}, некорректных: {invalid}»;
     при invalid = 0 UI подставляет 0 — формулировка остаётся корректной,
     либо два ключа; выбрать простое: один ключ с тремя числами).
   - Файлы: client/src/i18n/ru.json, client/src/i18n/en.json

5. [ ] **Тесты: validators (sanitizeImportEntry)**
   - Валидная запись проходит; word/translation невалидны (пусто, >100/>500
     символов, мусорные символы в word) → null; note > 500 → null;
     note пустая → поле отсутствует; не-объект (строка/число/null) → null;
     числовая санитизация: отрицательные/NaN/Infinity/дробные → дефолты,
     clamp сверху; last_direction мусор → "en_ru"; языки мусор → дефолты;
     best_time/avg_time: 0/отрицательное/NaN → null.
   - Файлы: client/src/domain/validators.test.ts

6. [ ] **Тесты: importWords (wordRepository.test.ts)**
   - Обновить существующие тесты под новый результат `{imported, skipped, invalid}`.
   - Новые: невалидные записи пропускаются (invalid++), валидные рядом с
     невалидными импортируются; дубликаты внутри одного файла (два одинаковых
     word → 1 imported, 1 skipped); числовые поля санитизируются при записи
     (interval: -5 → 0); пустой массив bulkAdd не падает.
   - Файлы: client/src/data/wordRepository.test.ts

7. [ ] **Тесты: Dictionary.tsx (import UI)**
   - Файл > 10 МБ (мок File с size) → сообщение import_too_large, fetch/чтение
     не выполняется, importWords не вызывается (vi.mock wordRepository).
   - Массив > 10 000 записей → import_too_many.
   - Успешный импорт с invalid > 0 → сообщение содержит все числа.
   - Файлы: client/src/test/Dictionary.test.tsx

8. [ ] **Верификация**
   - `cd client && npm run test && npx eslint . && npm run build`
   - Proxy не затронут (pytest/ruff не обязательны, но прогнать
     `uv run pytest tests/ -q` для чистоты CI-паритета).

9. [ ] **Документация**
   - README.md: раздел про импорт/экспорт — упомянуть лимиты (10 МБ, 10 000
     записей) и валидацию.
   - KODA.md: правила Client — добавить пункт про импорт (лимиты, санитизация,
     транзакция).

10. [ ] **Semver (навык semver-checker перед коммитом)**
    - Patch: 1.24.0 → 1.24.1 (versionCode 66) — hardening/фикс, без новых
      фич для пользователя (лимиты и валидация — защита, не функциональность).
    - 4 файла: pyproject.toml, client/package.json,
      client/src-tauri/tauri.conf.json, client/android/app/build.gradle
      (+ `uv lock` для sync uv.lock).
    - В сообщении коммита: «Bump version: 1.24.0 → 1.24.1 (patch)».

## Технические заметки

- `file.text()` вызывается только после проверки `file.size` — гигантский файл
  вообще не читается в память.
- `JSON.parse` файла ≤ 10 МБ в худшем случае блокирует поток на ~сотни мс —
  приемлемо; асинхронный стриминг не нужен.
- Дубликаты: Set по `word` (как сейчас — дедуп по слову, не по переводу).
  Загрузка всех существующих слов одним `toArray()` вместо N запросов
  `where("word").equals(...)` — быстрее на больших словарях.
- `bulkAdd` внутри транзакции: при ошибке вся партия откатывается (атомарность).
- Экспорт (exportWords) не трогаем — он читает только локальную БД.
- Прокси/квоты не участвуют: импорт полностью локальный.
- Тест-гоча: в Dictionary-тестах мокать `@/data/wordRepository` (vi.mock),
  чтобы не зависеть от fake-indexeddb-состояния; для File использовать
  `new File(["..."], "dict.json", { type: "application/json" })` — у него
  есть size; для «гигантского» — переопределить size через
  Object.defineProperty(File.prototype...) или передать мок-объект
  `{ size: 11 * 1024 * 1024, text: async () => { throw new Error("should not read"); } }`
  (handleImport работает с file.size и file.text() — утка-типизация достаточна).
- i18n: все новые строки через t(), ключи в обоих json.

## Критерии готовности
- Файл > 10 МБ отклоняется без чтения; > 10 000 записей отклоняется.
- Невалидные записи (мусорные word/translation/note) пропускаются с
  отдельным счётчиком invalid; валидные импортируются.
- Числовые поля санитизируются (нет NaN/отрицательных/гигантских значений в БД).
- Импорт атомарный (транзакция) и быстрый (bulkAdd, один запрос на дубликаты).
- Все тесты/линтер/сборка зелёные; документация и версия обновлены.
