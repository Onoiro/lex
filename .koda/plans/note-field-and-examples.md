# Plan: Note Field + Example Sentences

**Created:** 2026-08-01  
**Branch:** `add-review-examples`  
**Base commit:** `d3a6e14` (WIP: partial note field implementation)

## Context

Two features to add to Lex:

1. **Note field (association/hint)** — optional user-entered note for each word, shown as a hint during review and displayed in the dictionary table.
2. **Example sentences** — automatic example sentences via Yandex Dictionary API, fetched on demand and stored in the word entry, shown on the flip-card back face during review.

### Current state (WIP commit `d3a6e14`)

Already done:
- `Word` type has `note?: string` ✅
- DB migration v4 ✅
- `validateNote()` in validators.ts ✅
- `addWord()` accepts `note?` parameter ✅
- `importWords()` handles `note` ✅

Broken:
- `validateTranslation()` was removed from `validators.ts` but is still imported in `Add.tsx` and `validators.test.ts` — code does not compile.

---

## Steps

### 1. [ ] Fix validators.ts — restore validateTranslation()
- **Skills:** koda-coder
- **Files:**
  - `client/src/domain/validators.ts`
  - `client/src/domain/validators.test.ts`
- **Details:** `validateTranslation()` was accidentally deleted in the WIP commit. Restore it (trim, length check, NFC normalize). Verify `validateNote()` is also correct. Run lint + tests to confirm green.

### 2. [ ] i18n — add strings for note/hint
- **Files:**
  - `client/src/i18n/en.json`
  - `client/src/i18n/ru.json`
- **Keys to add:**
  - `add.note_placeholder` — placeholder for note input field
  - `add.note_label` — label for note field
  - `review.show_hint` — button text "Show hint"
  - `review.hint` — label for hint display
  - `dictionary.col_note` — table column header "Note"

### 3. [ ] Add.tsx — note input field
- **Skills:** koda-coder
- **Files:**
  - `client/src/pages/Add.tsx`
  - `client/src/test/Add.test.tsx`
- **Details:**
  - Add `useState` for `note`
  - Textarea below translation, before Save button
  - Validate via `validateNote()` before saving
  - Pass `note` to `addWord()`
  - Clear `note` after successful save
  - Tests: note input, save with note, clear after save

### 4. [ ] Review.tsx — hint button on card front
- **Skills:** koda-coder
- **Files:**
  - `client/src/pages/Review.tsx`
  - `client/src/test/Review.test.tsx`
- **Details:**
  - On front face: if word has `note`, show "💡 Hint" button
  - Clicking reveals note text (not the translation)
  - Button available before answering (helps recall)
  - Tests: hint button visible when note exists, hidden when no note, reveals note on click

### 5. [ ] Dictionary.tsx — Note column in table
- **Skills:** koda-coder
- **Files:**
  - `client/src/pages/Dictionary.tsx`
  - `client/src/test/Dictionary.test.tsx`
- **Details:**
  - Add "Note" column to table
  - Show truncated note text or "—" if empty
  - Adjust column widths to fit
  - Tests: note column renders, shows note text, shows dash when empty

### 6. [ ] Verify Step 1: lint, test, build
- **Commands:**
  - `cd client && npm run lint`
  - `cd client && npm run test`
  - `cd client && npm run build`

---

### 7. [ ] Proxy — Yandex Dictionary API service and endpoint
- **Skills:** koda-coder
- **Files:**
  - `proxy/services/dictionary.py` (new)
  - `proxy/main.py`
  - `tests/test_dictionary.py` (new)
- **Details:**
  - New service: client to Yandex Dictionary API (`https://dictionary.yandex.net/api/v1/dicservice.json/lookup`)
  - Separate env var `YANDEX_DICT_API_KEY`
  - Function `lookup_word(text, lang_pair)` → returns example sentences
  - Caching via existing `TranslationCache` or separate cache instance
  - New endpoint: `POST /dictionary` (body: `word`, `lang_pair` e.g. "en-ru")
  - Rate limiting (separate limiter)
  - Response: `{ "examples": [{"text": "...", "translation": "..."}, ...] }`
  - Tests: endpoint test, service test, cache test
- **Verify:** `uv run ruff check proxy/`, `uv run pytest tests/ -v`

### 8. [ ] Client — types, DB, API client for examples
- **Skills:** koda-coder
- **Files:**
  - `client/src/types/word.ts`
  - `client/src/data/db.ts`
  - `client/src/services/dictionaryApi.ts` (new)
  - `client/src/test/dictionaryApi.test.ts` (new)
- **Details:**
  - Add `examples?: { text: string; translation?: string }[]` to `Word` type
  - DB migration v5 (no schema change, examples stored as part of object)
  - `dictionaryApi.ts`: `getExamples(word, langPair)` → calls `POST /dictionary` on proxy
  - Tests: API client test with mocked fetch

### 9. [ ] Review.tsx — examples on card back
- **Skills:** koda-coder
- **Files:**
  - `client/src/pages/Review.tsx`
  - `client/src/test/Review.test.tsx`
- **i18n keys:**
  - `review.examples` — heading
  - `review.load_examples` — button text
  - `review.no_examples` — message when no examples found
- **Details:**
  - On back face (after translation shown): if `examples` exist, display them
  - If no examples yet, show "Load examples" button (requires internet)
  - Save fetched examples to word via `updateWord()`
  - Tests: examples display when present, load button when absent, saves after fetch

### 10. [ ] Verify Step 2: lint, test, build
- **Commands:**
  - `cd client && npm run lint`
  - `cd client && npm run test`
  - `cd client && npm run build`
  - `uv run ruff check proxy/`
  - `uv run pytest tests/ -v`

---

### 11. [ ] Final verification and documentation update
- **Skills:** docs-update, semver-checker
- **Files:**
  - `KODA.md`
  - `README.md`
  - `pyproject.toml`
  - `client/package.json`
  - `client/src-tauri/tauri.conf.json`
  - `client/android/app/build.gradle`
- **Details:**
  - Update KODA.md with new features, endpoints, DB version
  - Update README if needed
  - Run semver-checker before commit to determine version bump
  - Update version in all 4 version files

---

## Notes

- Step 1 (items 1-6) must be fully complete and green before starting Step 2.
- Each step ends with green tests and successful build.
- Follow existing project conventions: Pico CSS (no classes), i18n via `t()`, Vitest + fake-indexeddb for tests.
- Proxy follows existing patterns: FastAPI, httpx, rate limiting, caching.
