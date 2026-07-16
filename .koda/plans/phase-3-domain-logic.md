# Phase 3: Client-side Domain Logic (SRS & Stats) — План

## Контекст
Портируются 4 функции из main.py:
- _apply_review_result(w, correct, direction) — SM-2: интервалы 1→6→×2.5, потолок 30 дней, сброс при ошибке, next_review, know/forgot count
- _pick_weighted_word(words) — взвешенный рандом: weight = 1/(interval+1)
- _update_response_time(w, elapsed) — best_time (min), avg_time (running average)
- _pick_random_direction() — random.choice(['en_ru', 'ru_en'])

Доменный слой — чистые функции, работают с объектами Word, не зависят от Dexie.
Persistence остаётся за wordRepository (Phase 2).

## Шаги

1. [x] **Implement SRS engine (srs.ts)**
   - applyReviewResult(word, correct, direction) → Partial<Word>
   - pickWeightedWord(words) → Word
   - pickRandomDirection() → ReviewDirection
   - Файлы:
     - client/src/domain/srs.ts

2. [x] **Implement response time tracker (stats.ts)**
   - updateResponseTime(word, elapsed) → Partial<Word>
   - formatTime(seconds) → string
   - Файлы:
     - client/src/domain/stats.ts

3. [x] **Add unit tests for SRS and stats**
   - SRS: interval growth, reset, counts, next_review, weighted selection, direction
   - Stats: best_time, avg_time, formatTime, edge cases
   - Файлы:
     - client/src/domain/srs.test.ts
     - client/src/domain/stats.test.ts

4. [x] **Verify: build, lint, test all pass**
   - npx tsc --noEmit
   - npx vite build
   - npx eslint .
   - npx vitest run
