FROM python:3.13-slim

# Create non-root user
RUN useradd --create-home --shell /bin/bash lex

WORKDIR /app

# Copy requirements and install with pinned versions and binary-only
COPY proxy/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir --only-binary :all: -r requirements.txt

# Copy only proxy-needed modules (avoid pulling auth/csrf/validators deps)
COPY proxy/main.py ./proxy/main.py
COPY services/__init__.py ./services/__init__.py
COPY services/translator.py ./services/translator.py
COPY services/cache.py ./services/cache.py
COPY security/rate_limiter.py ./security/rate_limiter.py
COPY i18n/__init__.py ./i18n/__init__.py
COPY i18n/languages.py ./i18n/languages.py
COPY i18n/en.json ./i18n/en.json
COPY i18n/ru.json ./i18n/ru.json

# Minimal __init__.py for security (avoid importing auth/csrf/validators)
RUN printf '"""Security modules: rate limiting only (proxy build)."""\n' > security/__init__.py

# Change ownership to non-root user
RUN chown -R lex:lex /app

USER lex

# Expose proxy port
EXPOSE 8004

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8004/')" || exit 1

CMD ["uvicorn", "proxy.main:app", "--host", "0.0.0.0", "--port", "8004"]
