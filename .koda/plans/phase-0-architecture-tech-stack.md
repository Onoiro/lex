# Phase 0: Architecture & Tech Stack — План

## Контекст
- Стек: React + TypeScript + Vite + Dexie.js + Pico CSS
- Клиент живёт в `client/` внутри текущего репо
- Proxy останется в корне (Phase 1)
- Модель Word: 11 полей (id, word, translation, interval, repetitions, next_review, last_direction, best_time, avg_time, know_count, forgot_count)

## Шаги

1. [x] **Scaffold Vite + React + TypeScript project in client/**
   - Создать скелет через `npm create vite@latest client -- --template react-ts`
   - Настроить tsconfig (strict mode, paths aliases `@/` → `src/`)
   - Файлы:
     - client/package.json
     - client/tsconfig.json
     - client/vite.config.ts
     - client/index.html

2. [x] **Install and configure core dependencies**
   - dexie (IndexedDB ORM), react-router-dom (routing для 5 экранов), pico.css (CDN → локальный импорт для офлайна)
   - Файлы:
     - client/package.json
     - client/src/main.tsx (импорт Pico CSS, монтирование React)
     - client/src/index.css

3. [x] **Define TypeScript types for the Word model**
   - Интерфейс Word, повторяющий поля из models.py
   - Типы для review direction, review result, language settings
   - Файлы:
     - client/src/types/word.ts
     - client/src/types/index.ts

4. [x] **Set up project folder structure with placeholder modules**
   - Структура: components/, pages/, domain/, data/, i18n/, hooks/
   - App.tsx с React Router (5 маршрутов), placeholder-страницы
   - Layout (header nav + footer version)
   - Файлы:
     - client/src/App.tsx
     - client/src/components/Layout.tsx
     - client/src/pages/Home.tsx
     - client/src/pages/Add.tsx
     - client/src/pages/Review.tsx
     - client/src/pages/Dictionary.tsx
     - client/src/pages/Settings.tsx

5. [x] **Set up linting and testing framework**
   - ESLint + конфиг (react, typescript), Vitest + React Testing Library
   - Один smoke-тест (рендер Layout, проверка навигации)
   - Файлы:
     - client/eslint.config.js
     - client/vitest.config.ts (или в vite.config.ts)
     - client/src/test/setup.ts
     - client/src/test/Layout.test.tsx

6. [x] **Verify: build, lint, test all pass**
   - `npm run build` — без ошибок
   - `npm run lint` — без ошибок
   - `npm run test` — smoke-тест проходит
   - `npm run dev` — dev-сервер стартует, 5 маршрутов доступны
