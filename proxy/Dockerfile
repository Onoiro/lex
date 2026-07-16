FROM python:3.13-slim

WORKDIR /app

# Copy requirements and install
COPY proxy/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy shared modules and proxy entry point
COPY services/ ./services/
COPY security/ ./security/
COPY i18n/ ./i18n/
COPY proxy/main.py ./proxy/main.py

# Expose proxy port
EXPOSE 8004

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8004/')" || exit 1

CMD ["uvicorn", "proxy.main:app", "--host", "0.0.0.0", "--port", "8004"]
