# Phase 2: Client-side Data Layer — План

## Контекст
- Хранилище: Dexie.js (IndexedDB), уже установлен в Phase 0
- Типы Word уже определены в client/src/types/word.ts (11 полей)
- CRUD-операции повторяют серверную логику из main.py + models.py
- Настройки языка (source_lang, target_lang, locale) хранятся локально — заменяют серверные cookies
- Тесты на Vitest с fake-indexeddb (для IndexedDB в jsdom)

## Шаги

1. [x] **Create Dexie database schema (db.ts)**
   - База "lex-db", таблица "words" с индексами: id (pk), word (unique), next_review
   - Таблица "settings" для LanguageSettings (key-value: source_lang, target_lang, locale)
   - Файлы:
     - client/src/data/db.ts

2. [x] **Implement Word CRUD operations (wordRepository.ts)**
   - addWord(word, translation) — проверка дубликата, дефолты
   - deleteWord(id)
   - getWord(id)
   - getAllWords() — отсортировано по word
   - updateWord(id, partial)
   - getWordCount()
   - Файлы:
     - client/src/data/wordRepository.ts

3. [x] **Implement Settings storage (settingsRepository.ts)**
   - getSettings() — fallback на DEFAULT_LANGUAGE_SETTINGS
   - saveSettings(partial) — merge с текущими
   - Файлы:
     - client/src/data/settingsRepository.ts

4. [x] **Add fake-indexeddb and write tests for data layer**
   - Установить fake-indexeddb как devDependency
   - Тесты: addWord, deleteWord, getWord, getAllWords, updateWord, getWordCount, getSettings, saveSettings
   - Файлы:
     - client/src/data/wordRepository.test.ts
     - client/src/data/settingsRepository.test.ts
     - client/src/test/setup.ts

5. [x] **Verify: build, lint, test all pass**
   - npx tsc --noEmit
   - npx vite build
   - npx eslint .
   - npx vitest run
