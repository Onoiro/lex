# Phase 8: Migration & Decommission — План

## Контекст
- Старый серверный код (main.py, templates/, models.py, security/, services/) всё ещё в проекте
- Proxy (`proxy/`) остаётся — он нужен для переводов
- Модель Word идентична между сервером (SQLAlchemy) и клиентом (Dexie/IndexedDB) — 11 полей
- Нужен инструмент экспорта/импорта для миграции словаря
- KODA.md полностью устарел — описывает только серверный стек

## Шаги

1. [x] **Add export endpoint to old server (JSON dump of all words)**
   - GET /export в main.py: отдаёт весь словарь как JSON-массив
   - Формат: [{ word, translation, interval, repetitions, next_review, last_direction, best_time, avg_time, know_count, forgot_count }]
   - Требует аутентификации (как все маршруты)
   - Файлы:
     - main.py
     - tests/test_main_routes.py

2. [x] **Add import/export UI to client Dictionary page**
   - Кнопка "Export" — скачивает JSON-файл со всеми словами
   - Кнопка "Import" — загрузка JSON-файла, мерж существующим словарём (skip duplicates)
   - i18n-ключи для кнопок и сообщений
   - Файлы:
     - client/src/pages/Dictionary.tsx
     - client/src/data/wordRepository.ts
     - client/src/i18n/en.json
     - client/src/i18n/ru.json

3. [x] **Add import/export tests**
   - Тесты на exportToJSON, importFromJSON (с дубликатами, пустой, невалидный)
   - Файлы:
     - client/src/data/wordRepository.test.ts

4. [x] **Update KODA.md to reflect local-first architecture**
   - Полная переработка: новый стек, структура, команды, правила
   - Описание proxy, client, Android, Desktop
   - Файлы:
     - KODA.md

5. [x] **Update README.md**
   - Описание local-first архитектуры
   - Инструкции запуска client + proxy
   - Файлы:
     - README.md

6. [x] **Verify: all tests pass (client + server)**
   - Client: tsc, vite build, eslint, vitest
   - Server: ruff, pytest
