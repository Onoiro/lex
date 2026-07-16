# Phase 5: PWA — План

## Контекст
- Vite 7 + React 19, Pico CSS
- Существующие иконки: `static/` (192x192, 512x512, favicon, apple-touch-icon)
- `index.html` уже имеет meta-теги для mobile web app
- `site.webmanifest` — заглушка ("MyWebSite"), нужно заменить на Lex
- Service worker отсутствует
- Цель: устанавливаемое приложение, офлайн-шелл (кэш ассетов), graceful деградация перевода при отсутствии сети
- Подход: `vite-plugin-pwa` — генерирует service worker (Workbox) и web manifest автоматически

## Шаги

1. [x] **Install vite-plugin-pwa and configure Vite**
   - npm install vite-plugin-pwa --save-dev
   - Добавить плагин в vite.config.ts с manifest-конфигурацией
   - Стратегия кэширования: precache (app shell), runtime cache для proxy API (NetworkFirst)
   - Файлы:
     - client/vite.config.ts
     - client/package.json (auto via npm install)

2. [x] **Copy PWA icons to client/public and update index.html**
   - Копировать иконки из static/ в client/public/
   - Обновить index.html: link rel=manifest, apple-touch-icon, favicon
   - Файлы:
     - client/public/ (icons)
     - client/index.html

3. [x] **Add offline detection and graceful degradation in Add page**
   - Индикатор офлайн-статуса (банер или toast)
   - В Add.tsx: при ошибке сети показывать понятное сообщение, не блокировать UI
   - Файлы:
     - client/src/pages/Add.tsx
     - client/src/components/OfflineIndicator.tsx

4. [x] **Register service worker in main.tsx**
   - Импорт virtual:pwa-register, регистрация SW
   - Опционально: prompt на обновление (skipWaiting + clients.claim)
   - Файлы:
     - client/src/main.tsx

5. [x] **Add PWA dev config for testing SW in dev mode**
   - В vite.config.ts: devOptions { enabled: true } для тестирования SW локально
   - Файлы:
     - client/vite.config.ts (update)

6. [x] **Verify: build, lint, test all pass**
   - npx tsc --noEmit
   - npx vite build (проверить генерацию SW + manifest)
   - npx eslint .
   - npx vitest run
