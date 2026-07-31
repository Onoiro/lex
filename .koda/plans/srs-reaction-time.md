# План: Улучшение алгоритма SRS — учёт времени реакции

## Контекст
Текущий алгоритм `pickWeightedWord` использует только `interval` для расчёта веса слова: `W = 1 / (interval + 1)`. Значения interval принимают всего 4 значения (0, 1, 6, 15, 30), что слабо дифференцирует слова. Предлагается добавить в формулу времени реакции пользователя (`avg_time`), чтобы слова с медленным отзывом показывались чаще.

## Формула
```
W = 1 / (interval + 1) × (1 + RT_COEFF × normAvgTime)
```
- `RT_COEFF = 1.0` — Reaction Time Coefficient
- `normAvgTime = clamp(avg_time / 10, 0, 1)`, `null → 1` (новые слова — максимальный приоритет)

## Шаги

1. [x] **Обновить формулу веса в `pickWeightedWord` (srs.ts)**
   - Добавить константу `RT_COEFF = 1.0`
   - Добавить функцию `normalizeAvgTime(avg_time)`
   - Изменить формулу веса
   - Файлы: client/src/domain/srs.ts

2. [x] **Убрать «д» в отображении интервала в словаре**
   - Файлы: client/src/pages/Dictionary.tsx

3. [x] **Обновить тесты srs.test.ts**
   - Тесты для `normalizeAvgTime`
   - Тесты, проверяющие влияние `avg_time` на выбор слова
   - Файлы: client/src/domain/srs.test.ts

4. [x] **Запустить тесты и линтер**
   - `npm run test` — 165 passed
   - `npm run lint` — 0 errors, 3 warnings (pre-existing)
