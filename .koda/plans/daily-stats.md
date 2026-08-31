# План: Ежедневная статистика повторений (daily stats)

## Контекст

Сейчас статистика тренировки (`SessionStats` в `Review.tsx`) живёт только в React state и сбрасывается при выходе из приложения. Пользователь хочет видеть накопленную статистику по дням: повторения, точность, время, а также количество добавленных новых слов.

Цель: сохранять статистику инкрементально после каждого ответа и каждого добавленного слова в локальную БД (Dexie), агрегировать по дням и показывать на странице Повтор.

## Ключевые решения (согласованы с пользователем)

- **Инкрементальная запись:** статистика пишется после каждого ответа (Review) и каждого добавленного слова (Add), а не в конце сессии. Краш/выход не теряет данные, «сессия» перестаёт быть отдельной сущностью.
- **UI: Вариант A + streak** — блок «Сегодня» на стартовом экране Повтора, строка «Сегодня всего» на paused/done, сворачиваемая история последних 7–14 дней. Без графиков (график — задел на будущее, Вариант B).
- **Без новых proxy-эндпоинтов** — всё локально.
- **Streak (серия дней подряд)** — считается на клиенте из дат в таблице.
- **Удаление слова не откатывает** счётчик новых слов за день (нормально для дневной статистики).

## Модель данных (Dexie v6)

Новая таблица `dailyStats`, primary key — локальная дата `YYYY-MM-DD`:

```ts
interface DailyStats {
  date: string;          // "2026-08-30", primary key
  reviewed: number;      // всего ответов
  known: number;
  forgotten: number;
  total_time: number;    // сумма времени ответов, сек (avg = total_time / reviewed)
  best_time: number | null;
  new_words: number;     // добавлено слов за день
}
```

- Среднее время не храним — вычисляем из `total_time / reviewed`.
- Локальная дата: `new Date()` → `YYYY-MM-DD` по локальному времени (не UTC), чтобы день менялся в полночь по часовому поясу пользователя.

## План

### 1. [ ] **Тип DailyStats + миграция Dexie v6**
Добавить тип `DailyStats` в `client/src/types/` (или в `db.ts`, по аналогии с `SettingsRow`). Добавить `this.version(6).stores({ ..., dailyStats: "date" })` в `LexDatabase`. Таблица `dailyStats!: Table<DailyStats, string>`.
- Навыки: koda-coder
- Файлы:
  - `client/src/types/word.ts` (или `client/src/data/db.ts`)
  - `client/src/data/db.ts`

### 2. [ ] **Репозиторий dailyStatsRepository.ts**
Функции:
- `getTodayStats(): Promise<DailyStats>` — возвращает запись за сегодня или нулевую заглушку (не создаёт запись).
- `recordAnswer(correct: boolean, elapsedSec: number): Promise<void>` — upsert записи за сегодня: `reviewed+1`, `known/forgotten+1`, `total_time+elapsed`, `best_time=min`.
- `incrementNewWords(): Promise<void>` — upsert: `new_words+1`.
- `getRange(days: number): Promise<DailyStats[]>` — последние N дней (для истории), включая пустые дни или только с данными — решить при реализации (предпочтительно: только дни с данными, streak добьёт пропуски).
- `getStreak(): Promise<number>` — серия дней подряд с `reviewed > 0` или `new_words > 0`, считая от сегодня (если сегодня ещё пусто — от вчера).
- Навыки: koda-coder
- Файлы:
  - `client/src/data/dailyStatsRepository.ts` (новый)
  - `client/src/data/dailyStatsRepository.test.ts` (новый)

### 3. [ ] **Domain-утилиты для агрегатов**
- `computeDayAccuracy(stats)` — known/reviewed %.
- `computeDayAvgTime(stats)` — total_time/reviewed.
- Форматирование даты для истории (локаль-зависимое, через i18n).
- Навыки: koda-coder
- Файлы:
  - `client/src/domain/dailyStats.ts` (новый)
  - `client/src/domain/dailyStats.test.ts` (новый)

### 4. [ ] **Инкремент в Add.tsx**
После успешного добавления слова — `void incrementNewWords()`. Fire-and-forget, не блокирует UI.
- Навыки: koda-coder
- Файлы:
  - `client/src/pages/Add.tsx`

### 5. [ ] **Инкремент в Review.tsx (handleAnswer)**
В `handleAnswer` рядом с обновлением `setSession` — `void recordAnswer(correct, elapsedSec)`. Fire-and-forget.
- Навыки: koda-coder
- Файлы:
  - `client/src/pages/Review.tsx`

### 6. [ ] **UI: блок «Сегодня» на стартовом экране Повтора**
На `phase === "start"`: под «В очереди: N» блок «Сегодня» — повторения, точность, новые слова, streak, общее время. Загружается в `loadWords` (или отдельным effect). Компактно, в стиле Pico CSS.
- Навыки: koda-coder
- Файлы:
  - `client/src/pages/Review.tsx`

### 7. [ ] **UI: строка «Сегодня всего» на paused/done**
На `phase === "paused"` и `phase === "done"`: под статистикой сессии строка «Сегодня всего: X повторений, Y%» (сегодня = сессия + ранее за день). Требует свежих данных из репозитория — перечитывать при входе в paused/done.
- Навыки: koda-coder
- Файлы:
  - `client/src/pages/Review.tsx`

### 8. [ ] **UI: сворачиваемая история за 7–14 дней**
Кнопка/`<details>` «История тренировок» на стартовом экране. Разворачивается в список: дата, повторения, точность, новые слова. Без графиков. Сортировка — свежие сверху.
- Навыки: koda-coder
- Файлы:
  - `client/src/pages/Review.tsx`

### 9. [ ] **i18n-ключи (ru + en)**
Ключи: `review.today_*` (повторения, точность, новые слова, streak, время), `review.today_total_*`, `review.history_toggle`, `review.history_*` (заголовки колонок), формат даты. Все строки через `t()`.
- Навыки: koda-coder
- Файлы:
  - `client/src/i18n/en.json`
  - `client/src/i18n/ru.json`

### 10. [ ] **Тесты**
- `dailyStatsRepository.test.ts`: recordAnswer (создание/инкремент/best_time), incrementNewWords, getRange, getStreak (включая пустой сегодня), переход через полночь (мок даты).
- `dailyStats.test.ts`: accuracy, avgTime, edge cases (0 ответов).
- `Review.test.tsx` (если есть): блок «Сегодня» отображается, история раскрывается.
- `Add.test.tsx`: инкремент new_words при добавлении.
- Навыки: koda-coder
- Файлы:
  - `client/src/data/dailyStatsRepository.test.ts`
  - `client/src/domain/dailyStats.test.ts`
  - `client/src/test/Review.test.tsx` (при наличии)
  - `client/src/test/Add.test.tsx` (при наличии)

### 11. [ ] **Проверка: lint, type-check, сборка, тесты**
`npm run lint`, `npx tsc --noEmit`, `npm run test`, `npm run build`. Исправить все ошибки.
- Навыки: koda-coder
- Файлы:
  - (без изменений файлов, только проверка)

### 12. [ ] **Документация (KODA.md) + semver**
Обновить KODA.md (архитектура, структура, правила — упомянуть dailyStats). Применить навык semver-checker: новая фича + миграция БД → minor bump.
- Навыки: docs-update, semver-checker
- Файлы:
  - `KODA.md`
  - `pyproject.toml`, `client/package.json`, `client/src-tauri/tauri.conf.json`, `client/android/app/build.gradle`

## Решения по дизайну

- **Дата:** локальная `YYYY-MM-DD` (не UTC) — день меняется в полночь по часовому поясу пользователя.
- **Пустой сегодня:** `getTodayStats()` возвращает нулевую заглушку, запись создаётся только при первом событии (upsert).
- **Streak:** дни с `reviewed > 0` ИЛИ `new_words > 0` считаются активными. Если сегодня ещё пусто, серия считается от вчера (день ещё не потерян).
- **История:** только дни с данными, свежие сверху, последние 14.
- **Fire-and-forget:** запись статистики не блокирует UI и не влияет на таймер ответа; ошибки логируются в консоль.
- **Нет отдельной сущности «сессия»:** сессия в UI остаётся как есть (state), но в БД — только дневные агрегаты.
- **График (Вариант B):** не делаем в этой итерации, структура данных позволяет добавить позже.
