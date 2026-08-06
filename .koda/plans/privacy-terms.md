# План: Privacy Policy и Terms of Use для Lex

**Дата создания:** 7 августа 2026
**Статус:** Утверждён
**Цель:** Добавить юридические страницы (Privacy Policy и Terms of Use) для размещения в маркетплейсах (RuStore, AppGallery).

## Контекст

- Приложение Lex — local-first переводчик и тренер слов
- Данные хранятся локально (IndexedDB через Dexie.js)
- Интернет нужен только для proxy к Yandex API (translate, TTS, dictionary) и Telegram Bot (feedback)
- Маркетплейсы требуют публичные URL для Privacy Policy и Terms of Use
- Nginx уже настроен с SPA-fallback (`try_files $uri $uri/ /index.html`) — изменения НЕ нужны
- Публичные URL: `https://lex.2-way.ru/privacy` и `https://lex.2-way.ru/terms`

## Что уходит на proxy (для Privacy Policy)

| Эндпоинт | Данные | Получатель |
|---|---|---|
| POST /translate | текст слова, исходный/целевой язык | Yandex Translate API |
| POST /dictionary | текст слова, языковая пара | Yandex Dictionary API |
| POST /tts | текст, язык | Yandex SpeechKit |
| POST /feedback | категория, сообщение, контакт | Telegram Bot API |

- IP-адрес: используется для rate limiting на proxy, не сохраняется постоянно
- Proxy кэш: переводы и TTS кэшируются in-memory (RAM) с TTL, не персистентны на диск
- Аналитика и крэш-репортинг: отсутствуют
- Реклама: отсутствует

## План

1. [ ] **Создать страницу Privacy Policy (`Privacy.tsx`)**
   - Навыки: koda-coder
   - Файлы:
     - client/src/pages/Privacy.tsx (новый)
   - Детали:
     - React-страница, использует useLocale() для i18n
     - Содержание (через i18n-ключи):
       - Дата последнего обновления
       - Обзор: local-first приложение, данные хранятся локально
       - Локальное хранение: IndexedDB (Dexie.js) — слова, переводы, заметки, примеры, SRS-статистика, настройки
       - Данные, передаваемые на proxy:
         - Текст слова → POST /translate (Yandex Translate API)
         - Текст слова → POST /dictionary (Yandex Dictionary API)
         - Текст → POST /tts (Yandex SpeechKit)
         - Категория, сообщение, контакт → POST /feedback (Telegram Bot API)
       - IP-адрес: используется для rate limiting на proxy, не сохраняется
       - Proxy кэш: переводы и TTS кэшируются in-memory (RAM) с TTL, не персистентны
       - Третьи стороны: Yandex (перевод, TTS, dictionary), Telegram (feedback)
       - Аналитика и крэш-репортинг: отсутствуют
       - Реклама: отсутствует
       - Удаление данных: через Settings → Danger Zone
       - Возраст: 13+
       - Контакт разработчика
     - Стиль: Pico CSS, без классов, как остальные страницы

2. [ ] **Создать страницу Terms of Use (`Terms.tsx`)**
   - Навыки: koda-coder
   - Файлы:
     - client/src/pages/Terms.tsx (новый)
   - Детали:
     - React-страница, использует useLocale() для i18n
     - Содержание (через i18n-ключи):
       - Дата последнего обновления
       - Принятие условий
       - Описание сервиса (переводчик + интервальные повторения)
       - Отказ от гарантий: качество перевода не гарантируется, ML-перевод может содержать ошибки
       - Ответственность пользователя: за свой контент (слова, заметки)
       - Интеллектуальная собственность: приложение, алгоритм SM-2
       - Ограничение ответственности: разработчик не несёт ответственности за ущерб от использования
       - Изменение условий: право обновлять документ
       - Применимое право: РФ (целевой рынок — RuStore/AppGallery)
       - Возраст: 13+
       - Контакт разработчика
     - Стиль: Pico CSS, без классов

3. [ ] **Добавить i18n-ключи для обоих документов**
   - Навыки: koda-coder
   - Файлы:
     - client/src/i18n/ru.json
     - client/src/i18n/en.json
   - Детали:
     - Ключи с префиксами `privacy.*` и `terms.*`
     - Полные тексты на русском и английском
     - Ключи для ссылок на Settings: `settings.privacy_policy`, `settings.terms_of_use`

4. [ ] **Добавить роуты `/privacy` и `/terms` в main.tsx**
   - Навыки: koda-coder
   - Файлы:
     - client/src/main.tsx
   - Детали:
     - Импорт Privacy и Terms
     - Два новых `<Route>` внутри `<Routes>`

5. [ ] **Добавить ссылки на странице Settings**
   - Навыки: koda-coder
   - Файлы:
     - client/src/pages/Settings.tsx
   - Детали:
     - Внизу страницы, рядом с версией приложения
     - Две ссылки: Privacy Policy и Terms of Use
     - Используют `<Link>` из react-router-dom
     - Открываются как внутренние роуты (не внешние)

6. [ ] **Проверка: lint, build, test**
   - Навыки: koda-coder
   - Команды:
     - `cd client && npx eslint .`
     - `cd client && npm run build`
     - `cd client && npm run test`

7. [ ] **Документация + semver**
   - Навыки: docs-update, semver-checker
   - Файлы:
     - KODA.md (обновить структуру: новые страницы, новые роуты)
     - README.md (если упоминаются роуты/страницы)
     - pyproject.toml, client/package.json, client/src-tauri/tauri.conf.json, client/android/app/build.gradle (semver bump)
   - Детали:
     - Тип изменения: minor (новая функциональность — юридические страницы)

## Замечание по nginx

Изменения **не нужны**. Текущий `location / { try_files $uri $uri/ /index.html; }` уже обрабатывает все SPA-роуты, включая `/privacy` и `/terms`. Публичные URL `https://lex.2-way.ru/privacy` и `https://lex.2-way.ru/terms` будут работать сразу после деплоя нового билда.
