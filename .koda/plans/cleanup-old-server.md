# План: очистка old server и выделение proxy

**Контекст:** После перехода на local-first архитектуру old server (FastAPI + SQLAlchemy + Jinja2, корневые `main.py`, `database.py`, `models.py`) выведен из эксплуатации. `/export` больше не нужен. Цель — удалить все файлы old server и сделать proxy самодостаточным модулем.

**Дата составления:** 24 июля 2026
**Автор:** Koda CLI

---

- [x] **Шаг 0: Составлен анализ и утверждён план**

---

- [x] **1. Перенести shared-модули внутрь `proxy/`**
    - Навыки: кодирование
    - Описание: модули `services/translator.py`, `services/cache.py`, `security/rate_limiter.py` и `i18n/languages.py` используются и old server, и proxy. После удаления old server они должны находиться внутри `proxy/` с локальными импортами.
    - Файлы (создать):
        - `proxy/services/__init__.py` (пустой)
        - `proxy/services/translator.py` (скопировать и адаптировать из `services/translator.py`)
        - `proxy/services/cache.py` (скопировать из `services/cache.py`)
        - `proxy/security/__init__.py` (пустой)
        - `proxy/security/rate_limiter.py` (скопировать из `security/rate_limiter.py`)
        - `proxy/languages.py` (скопировать из `i18n/languages.py`)
        - `proxy/__init__.py` (пустой)
    - Файлы (обновить):
        - `proxy/main.py` — обновить импорты на `proxy.services.translator`, `proxy.services.cache`, `proxy.security.rate_limiter`, `proxy.languages`
        - `proxy/Dockerfile` — обновить COPY пути под новые локальные модули

- [x] **2. Удалить файлы old server**
    - Навыки: кодирование
    - Описание: удалить все файлы, относящиеся к старому серверу, которые больше не нужны.
    - Файлы (удалить):
        - `main.py`
        - `database.py`
        - `models.py`
        - `migrate.py`
        - `templates/` (вся директория: `base.html`, `index.html`, `add.html`, `review.html`, `dictionary.html`, `settings.html`)
        - `static/` (вся директория, включая `draft_logo_*.jpg`, `favicon*`, `site.webmanifest`, `apple-touch-icon.png`, `web-app-manifest-*`)
        - `translations/` (пустая директория с `__pycache__`)
        - `security/auth.py`
        - `security/csrf.py`
        - `security/validators.py`
        - `security/__init__.py`
        - `i18n/` (вся директория: `__init__.py`, `languages.py`, `en.json`, `ru.json`)
        - `services/__init__.py`
        - `services/translator.py`
        - `services/cache.py`
        - Корневой `Dockerfile`

- [x] **3. Обновить `pyproject.toml`**
    - Навыки: кодирование
    - Описание: убрать зависимости и конфигурацию, относящиеся только к old server.
    - Файлы:
        - `pyproject.toml`
    - Изменения:
        - Удалить из `dependencies`: `jinja2`, `sqlalchemy`, `python-multipart`, `passlib[bcrypt]`, `tomli`, `rollbar`
        - Оставить: `fastapi`, `httpx`, `python-dotenv`, `uvicorn`
        - Удалить `[tool.coverage.run]` (или переписать под proxy)
        - Обновить описание проекта

- [x] **4. Почистить тесты**
    - Навыки: кодирование
    - Описание: удалить тесты old server, переписать conftest.py только под proxy, обновить импорты в оставшихся тестах.
    - Файлы (удалить):
        - `tests/test_main_routes.py`
        - `tests/test_models.py`
        - `tests/test_database.py`
        - `tests/test_auth.py`
        - `tests/test_csrf.py`
        - `tests/test_validators.py`
        - `tests/test_i18n.py`
    - Файлы (обновить):
        - `tests/conftest.py` — полностью переписать, убрать фикстуры old server (db_session, authenticated_client, auth_headers, csrf_token, sample_word, sample_words, mock_translate_success, mock_translate_failure), оставить только общие/для proxy
        - `tests/test_proxy.py` — обновить импорты на `proxy.services.translator` и т.д.
        - `tests/test_translator.py` — обновить импорты на `proxy.services.translator`, `proxy.services.cache`
        - `tests/test_cache.py` — обновить импорты на `proxy.services.cache`
        - `tests/test_rate_limiter.py` — обновить импорты на `proxy.security.rate_limiter`

- [x] **5. Обновить инфраструктурные файлы**
    - Навыки: кодирование
    - Описание: Makefile, docker-compose, CI, sonar-project больше не должны ссылаться на old server.
    - Файлы:
        - `Makefile` — убрать цели `proxy`, `proxy-lint`, `proxy-test`, `proxy-test-cov`, `check`, `dev`, `deploy` (или переписать под proxy-only)
        - `docker-compose.yml` — убрать healthcheck (опционально), обновить build context на `proxy/`
        - `.dockerignore` — актуализировать под proxy-only
        - `.github/workflows/ci.yml` — убрать `server-lint` и `server-test`, оставить `client-check` и `sonarqube`
        - `sonar-project.properties` — убрать исключения old server (e3, e4, e5), убрать `tests/` из exclusions, актуализировать coverage paths

- [x] **6. Обновить `KODA.md`**
    - Навыки: кодирование
    - Описание: убрать все упоминания old server из корневой документации.
    - Файлы:
        - `KODA.md`
    - Изменения:
        - Удалить секции "Old server" из архитектуры, технологий, сборки, структуры
        - Обновить структуру проекта
        - Удалить информацию о миграции (она завершена)

- [x] **7. Финальная проверка**
    - Навыки: запуск команд
    - Описание: убедиться, что всё работает после изменений.
    - Команды:
        - `uv run ruff check .` — линтинг без ошибок
        - `uv run pytest tests/ -v` — все тесты проходят
        - `cd client && npm run build` — клиент собирается
        - `cd client && npm run test` — клиентские тесты проходят
        - `cd proxy && uvicorn proxy.main:app --port 8004` — proxy запускается (проверить вручную)