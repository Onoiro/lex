FROM python:3.13-slim

# Create non-root user
RUN useradd --create-home --shell /bin/bash lex

WORKDIR /app

# Copy requirements and install with pinned versions and binary-only
COPY proxy/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir --only-binary :all: -r requirements.txt

# Copy proxy package (self-contained, no external shared modules)
COPY proxy/ ./proxy/

# Change ownership to non-root user
RUN chown -R lex:lex /app

USER lex

# Expose proxy port
EXPOSE 8004

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8004/')" || exit 1

CMD ["uvicorn", "proxy.main:app", "--host", "0.0.0.0", "--port", "8004"]