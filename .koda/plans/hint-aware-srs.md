# План: учёт подсказок в SRS (hint-aware SRS)

## Контекст

В режиме повтора пользователь может открыть подсказку (note), вспомнить слово и ответить «Знаю». Сейчас это полностью идентично ответу без подсказки. Решено: подсказка = «почти знал» — ответ засчитывается, но интервал растёт слабее. Время до клика подсказки — честное время вспоминания, оно идёт в avg_time; best_time при подсказке не обновляется. Плюс справочный блок «Как это работает?» простым языком.

Ветка: создать от days-progress (текущая 1.16.0). Предлагаемое имя: feature/hint-aware-srs.

## Ключевые решения

- `applyReviewResult(word, correct, direction, usedHint = false)`:
  при `correct && usedHint` — repetitions НЕ инкрементируется,
  `interval = max(1, trunc(обычный_interval / 2))`, know_count + 1, hint_count + 1.
- `updateResponseTime(word, elapsed, recordBest = true)`: при recordBest=false
  обновляется только avg_time.
- Review.tsx: клик «Подсказка» → stopTimer(), elapsed в hintElapsedRef,
  usedHintRef = true (авто-ответ «Не помню» отменяется вместе с таймером).
  При ответе elapsedSec = hintElapsed если подсказка была.
- Word.hint_count: number — без миграции Dexie (поле не индексируется).
- Словарь: «💡 N» в статистике, только если hint_count > 0.
- Справочный блок на стартовом экране Повтора (сворачиваемый, как история).

## Шаги

1. [ ] **SRS: учёт подсказки в applyReviewResult**
   - Навыки: koda-coder
   - Файлы:
     - client/src/domain/srs.ts
     - client/src/domain/srs.test.ts
   - Детали: параметр usedHint = false. При correct && usedHint:
     repetitions НЕ инкрементируется, interval = max(1, trunc(обычный interval / 2)),
     know_count + 1, hint_count + 1. Обычные ответы — без изменений.

2. [ ] **stats.ts: раздельная запись avg_time / best_time**
   - Навыки: koda-coder
   - Файлы:
     - client/src/domain/stats.ts
     - client/src/domain/stats.test.ts
   - Детали: updateResponseTime(word, elapsed, recordBest = true).
     При recordBest = false обновляется только avg_time (время с подсказкой
     не претендует на рекорд).

3. [ ] **Тип Word: поле hint_count**
   - Навыки: koda-coder
   - Файлы:
     - client/src/types/word.ts
     - client/src/data/wordRepository.ts
   - Детали: hint_count: number (default 0 при создании/импорте).
     Миграция Dexie не нужна (поле не индексируется).

4. [ ] **Review.tsx: заморозка таймера при подсказке + передача usedHint**
   - Навыки: koda-coder
   - Файлы:
     - client/src/pages/Review.tsx
   - Детали: клик «Подсказка» → stopTimer(), elapsed в ref (hintElapsedRef),
     usedHintRef = true; авто-ответ отменён (уже следует из stopTimer).
     При ответе: elapsedSec = hintElapsed если подсказка была,
     submitResult(correct, elapsedSec, usedHint) → applyReviewResult +
     updateResponseTime(..., !usedHint). Сброс refs в showNextWord/handleStart.

5. [ ] **Словарь: показ счётчика подсказок**
   - Навыки: koda-coder
   - Файлы:
     - client/src/pages/Dictionary.tsx
     - client/src/i18n/ru.json
     - client/src/i18n/en.json
   - Детали: в строке статистики карточки/таблицы — «💡 N» рядом с Знаю/Забыл
     (только если hint_count > 0).

6. [ ] **Справочный блок «Как это работает?» на старте Повтора**
   - Навыки: koda-coder
   - Файлы:
     - client/src/pages/Review.tsx
     - client/src/i18n/ru.json
     - client/src/i18n/en.json
   - Детали: сворачиваемый блок (как история), текст простым языком:
     правильный ответ → пауза растёт (1 → 6 → ×2.5, до 30 дней);
     ошибка → сброс; долгий ответ → показывается чуть чаще;
     подсказка → «почти знал», пауза вдвое меньше.

7. [ ] **Тесты**
   - Навыки: koda-coder
   - Файлы:
     - client/src/domain/srs.test.ts
     - client/src/domain/stats.test.ts
     - client/src/test/Review.test.tsx
   - Детали: srs — usedHint: интервал вдвое меньше, repetitions не растёт,
     hint_count +1; stats — recordBest=false не трогает best_time;
     Review — клик подсказки → «Знаю» → interval=1 (а не рост), avg_time записан,
     best_time остался null, hint_count=1.

8. [x] **Проверка: lint + test + build**
   - Навыки: —
   - Файлы: —
   - Детали: cd client && npm run lint && npm run test && npm run build — 0 ошибок.

9. [x] **Документация + semver**
   - Навыки: docs-update, semver-checker
   - Файлы:
     - README.md
     - KODA.md
     - pyproject.toml, client/package.json, client/src-tauri/tauri.conf.json, client/android/app/build.gradle
   - Детали: описание механики подсказок в правилах SRS; minor-бамп
     1.16.0 → 1.17.0 (versionCode 53) во всех 4 файлах + uv.lock.
