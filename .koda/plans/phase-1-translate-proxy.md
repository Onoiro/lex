# Phase 1: Translate Proxy — План

## Контекст
- Proxy — отдельный FastAPI-сервис в `proxy/`, деплоится независимо
- Скрывает Yandex API-ключ, предоставляет 2 эндпоинта: `/translate` (POST) и `/languages` (GET)
- Переиспользует `services/translator.py`, `services/cache.py`, `security/rate_limiter.py`
- CORS включён (клиент будет на другом origin)
- Без auth/CSRF — proxy для личного использования, защита через rate limiting
- Порт: 8004 (основное приложение — 8003)

## API-контракт

```
POST /translate
  Request:  { "word": "hello", "source_lang": "auto", "target_lang": "ru" }
  Response: { "translation": "привет", "detected_language": "en" }
  Error:    { "error": "..." }

GET /languages
  Response: { "languages": [{"code": "en", "name": "English"}, ...] }

GET /
  Response: { "status": "ok" }
```

## Шаги

1. [x] **Create proxy/main.py — FastAPI app with /translate, /languages, health check**
   - POST /translate: JSON {word, source_lang, target_lang}, calls translate_word, returns {translation, detected_language}
   - GET /languages: calls get_supported_languages + get_api_language_names, returns {languages: [{code, name}]}
   - GET /: health check {status: "ok"}
   - CORS middleware (allow all origins)
   - Rate limiting on /translate (reuses translate_rate_limiter)
   - Файлы:
     - proxy/main.py

2. [x] **Create proxy/Dockerfile and proxy/requirements.txt for independent deployment**
   - Lean image: fastapi, uvicorn, httpx, python-dotenv
   - Copies services/, security/, i18n/, proxy/main.py
   - Port 8004
   - Файлы:
     - proxy/Dockerfile
     - proxy/requirements.txt

3. [x] **Add proxy service to docker-compose.yml**
   - Separate service `lex-proxy` on port 8004
   - env_file: .env (needs YANDEX_API_KEY)
   - Файлы:
     - docker-compose.yml

4. [x] **Add tests for proxy endpoints**
   - Test /translate: success, cache hit, missing word, rate limit
   - Test /languages: success, API failure fallback
   - Test /: health check
   - Файлы:
     - tests/test_proxy.py

5. [x] **Verify: lint + tests pass**
   - make lint
   - make test (or targeted: pytest tests/test_proxy.py)
