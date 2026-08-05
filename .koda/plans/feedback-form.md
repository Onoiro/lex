# План: Форма обратной связи через Telegram Bot

## Контекст
Пользователь хочет получать обратную связь (баги, идеи, пожелания) от пользователей приложения Lex.
Сообщения отправляются через форму в приложении → прокси → Telegram Bot API → личка разработчика (@AndreeBo).

**Telegram бот:** @Lex_2026_bot
**Bot token:** в `.env` как `TELEGRAM_BOT_TOKEN`
**Chat ID:** в `.env` как `TELEGRAM_CHAT_ID` (узнать через getUpdates)

Пользователю НЕ нужен Telegram — он просто заполняет форму в приложении.

## Шаги

1. [x] **Proxy — сервис `feedback.py`**
    - Навыки: koda-coder
    - Файлы:
        - `proxy/services/feedback.py` (новый)
    - Функция `send_feedback(category, message, contact)` — отправляет сообщение в Telegram через Bot API (`https://api.telegram.org/bot{token}/sendMessage`)
    - Форматирование: emoji + категория + текст + опциональный контакт
    - Token и chat_id из `os.environ`
    - Возвращает `True`/`False`, не падает при ошибке сети

2. [x] **Proxy — эндпоинт `POST /feedback`**
    - Навыки: koda-coder
    - Файлы:
        - `proxy/main.py`
    - Pydantic-модель `FeedbackRequest` (`category: str`, `message: str`, `contact: str = ""`)
    - Отдельный rate limiter: 3 запроса в час с одного IP
    - Валидация: `message` минимум 10 символов, `category` из списка `bug`, `idea`, `other`
    - Если `TELEGRAM_BOT_TOKEN` не задан — вернуть 503

3. [x] **Proxy — тесты**
    - Навыки: koda-coder
    - Файлы:
        - `tests/test_feedback.py` (новый)
    - Успешная отправка (mock httpx → Telegram API)
    - Ошибка Telegram API (500 от Telegram)
    - Rate limiting (429 после 3 запросов)
    - Валидация (короткое сообщение, пустая категория)
    - Отсутствие `TELEGRAM_BOT_TOKEN` (503)

4. [x] **Client — сервис `feedbackApi.ts`**
    - Навыки: koda-coder
    - Файлы:
        - `client/src/services/feedbackApi.ts` (новый)
    - `sendFeedback(category, message, contact?)` → `POST /feedback`
    - Обработка ошибок: network, 429, 503, 400
    - Возвращает `{ success: boolean, error?: string }`

5. [x] **Client — UI формы на Settings**
    - Навыки: koda-coder
    - Файлы:
        - `client/src/pages/Settings.tsx`
    - Новый `<details>` блок «💬 Обратная связь»
    - Поля: select (категория), textarea (сообщение, min 10), input (контакт, опц.)
    - Кнопка «Отправить» → `sendFeedback()` → toast с результатом
    - Состояния: idle, sending, success, error

6. [x] **Client — i18n**
    - Навыки: koda-coder
    - Файлы:
        - `client/src/i18n/en.json`
        - `client/src/i18n/ru.json`
    - Ключи: `settings.feedback`, `settings.feedback_category`, `settings.feedback_bug`, `settings.feedback_idea`, `settings.feedback_other`, `settings.feedback_message`, `settings.feedback_message_placeholder`, `settings.feedback_contact`, `settings.feedback_contact_placeholder`, `settings.feedback_send`, `settings.feedback_sending`, `settings.feedback_success`, `settings.feedback_error`, `settings.feedback_too_short`, `settings.feedback_offline`

7. [x] **Client — тесты**
    - Навыки: koda-coder
    - Файлы:
        - `client/src/test/feedbackApi.test.ts` (новый)
    - Успешная отправка, ошибка сети, 429, 503

8. [x] **PWA — проверить кэш**
    - Навыки: koda-coder
    - Файлы:
        - `client/vite.config.ts`
    - Убедиться, что `/feedback` не попадает в runtime cache

9. [x] **`.env.example` — добавить переменные**
    - Навыки: koda-coder
    - Файлы:
        - `.env.example`
    - Добавить `TELEGRAM_BOT_TOKEN` и `TELEGRAM_CHAT_ID`

10. [x] **Проверка: lint, test, build**
    - `uv run ruff check proxy/`
    - `uv run pytest tests/ -v`
    - `cd client && npm run lint`
    - `cd client && npm run test`
    - `cd client && npm run build`

11. [x] **Документация + semver**
    - Навыки: docs-update, semver-checker
    - Файлы:
        - `KODA.md`
        - `README.md`
    - Обновить список эндпоинтов, env vars, структуру
    - Semver bump (minor — новая функциональность)
