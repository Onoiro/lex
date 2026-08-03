# План: Сортировка словаря + описания статистических показателей

## Контекст

Сейчас словарь (`Dictionary.tsx`) отображает слова в алфавитном порядке (через `db.words.orderBy("word")` в `getAllWords()`). Пользователь видит колонки Known/No, Time, Rank, %, но не может сортировать по ним и не понимает, что они значат.

Цель: дать пользователю возможность сортировать словарь по статистическим метрикам и добавить описания этих метрик.

## Текущее состояние

- **Dictionary.tsx** — таблица (desktop) и карточки (mobile), поиск, экспорт/импорт. Нет сортировки, нет справки.
- **Word type** (`client/src/types/word.ts`) — поля: `interval`, `repetitions`, `best_time` (null), `avg_time` (null), `know_count`, `forgot_count`.
- **srs.ts** — `computeRank(word)` возвращает 1–100 на основе веса. `computeWeight` = `1/(interval+1) × (1 + RT_COEFF × normAvgTime)`.
- **stats.ts** — `formatTime(seconds)` → "X.XXs".
- **wordRepository.ts** — `getAllWords()` возвращает `db.words.orderBy("word").toArray()`.
- **db.ts** — Dexie v5, таблицы `words` и `settings`.
- **i18n** — `en.json`, `ru.json`. Ключи словаря: `dictionary.col_*`, `dictionary.total`, `dictionary.export`, и т.д.
- **Тесты** — `client/src/test/Dictionary.test.tsx` (Vitest + Testing Library + fake-indexeddb).

## План

### 1. [ ] **Создать утилиту сортировки слов в domain/**
Вынести логику сортировки в отдельную функцию `sortWords(words, sortBy, sortDir)` в `domain/dictionarySort.ts`. Функция принимает массив слов, ключ сортировки (`'word' | 'known_no' | 'best_time' | 'avg_time' | 'rank' | 'pct' | 'none'`) и направление (`'asc' | 'desc'`). Null-значения всегда идут в конец. Для `known_no` сортировка по сумме `know_count + forgot_count` (т.е. по общей активности). Для `pct` — вычисляется на лету. Стабильная сортировка с secondary key (id).
- Навыки: koda-coder
- Файлы:
  - `client/src/domain/dictionarySort.ts` (новый)
  - `client/src/domain/dictionarySort.test.ts` (новый)

### 2. [ ] **Добавить i18n-ключи для сортировки и описаний метрик**
Новые ключи: лейблы опций сортировки (`sort_none`, `sort_word`, `sort_known_no`, `sort_best_time`, `sort_avg_time`, `sort_rank`, `sort_pct`), направления (`sort_asc`, `sort_desc`), заголовок и текст блока справки (`stats_help_toggle`, `stats_help_known_no`, `stats_help_time`, `stats_help_rank`, `stats_help_pct`). На двух языках.
- Навыки: koda-coder
- Файлы:
  - `client/src/i18n/en.json`
  - `client/src/i18n/ru.json`

### 3. [ ] **Добавить UI сортировки в Dictionary.tsx (desktop)**
Клик по `<th>` переключает сортировку. Повторный клик по тому же `<th>` меняет направление. Индикатор ▲/▼ в заголовке активной колонки. Сортировка применяется к `filtered` массиву перед рендером. State: `sortBy` + `sortDir`, дефолт — `'none'` (порядок добавления, как сейчас).
- Навыки: koda-coder
- Файлы:
  - `client/src/pages/Dictionary.tsx`

### 4. [ ] **Добавить UI сортировки в Dictionary.tsx (mobile)**
`<select>` над списком карточек с опциями сортировки. Направление — отдельная кнопка-переключатель (↑/↓) рядом с селектором. Компактно, в одну строку с поиском или под ним.
- Навыки: koda-coder
- Файлы:
  - `client/src/pages/Dictionary.tsx`

### 5. [ ] **Добавить раскрывающийся блок справки по метрикам**
Кнопка «Что значат эти цифры?» / «What do these numbers mean?» над таблицей. При нажатии разворачивается панель с описанием каждой метрики (Known/No, Time, Rank, %). Работает и на desktop, и на mobile. Использует `<details>`/`<summary>` или state-управляемый toggle.
- Навыки: koda-coder
- Файлы:
  - `client/src/pages/Dictionary.tsx`

### 6. [ ] **Сохранять выбор сортировки в localStorage**
При изменении `sortBy`/`sortDir` сохранять в `localStorage` (ключ `lex-dict-sort`). При монтировании читать оттуда. Не требует миграции БД — это UI-настройка, а не языковая настройка.
- Навыки: koda-coder
- Файлы:
  - `client/src/pages/Dictionary.tsx`

### 7. [ ] **Обновить тесты Dictionary**
Добавить тесты: переключение сортировки по клику на заголовок, сортировка по mobile `<select>`, раскрытие/закрытие блока справки, сохранение сортировки в localStorage, корректное отображение null-значений при сортировке.
- Навыки: koda-coder
- Файлы:
  - `client/src/test/Dictionary.test.tsx`

### 8. [ ] **Проверка: lint, type-check, сборка, тесты**
Запустить `npm run lint`, `npx tsc --noEmit`, `npm run build`, `npm run test`. Исправить все ошибки.
- Навыки: koda-coder
- Файлы:
  - (без изменений файлов, только проверка)

### 9. [ ] **Обновить документацию (KODA.md) и semver**
Обновить KODA.md: упомянуть сортировку словаря и описания метрик. Применить навык semver-checker для определения типа изменения и бампа версии.
- Навыки: docs-update, semver-checker
- Файлы:
  - `KODA.md`
  - `pyproject.toml`, `client/package.json`, `client/src-tauri/tauri.conf.json`, `client/android/app/build.gradle`

## Решения по дизайну

- **Направление по умолчанию:** `'none'` (порядок добавления, как сейчас). При выборе колонки — `desc` для rank/pct/known_no, `asc` для time/word.
- **Null handling:** null-значения (best_time, avg_time) всегда в конце, независимо от направления.
- **Mobile:** `<select>` + кнопка направления, не кликабельные заголовки.
- **Справка:** раскрывающийся блок (не tooltip), работает везде.
- **localStorage:** ключ `lex-dict-sort`, JSON `{ sortBy, sortDir }`.
- **Сортировка по known_no:** по сумме `know_count + forgot_count` (общая активность слова).
- **Сортировка по pct:** вычисляется на лету `know_count / (know_count + forgot_count) * 100`.
