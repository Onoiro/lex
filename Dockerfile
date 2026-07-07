FROM python:3.13-slim

# Install uv
RUN pip install --no-cache-dir uv

# Create non-root user
RUN useradd --create-home --shell /bin/bash lex

WORKDIR /app

# Create data directory for database with proper permissions
RUN mkdir -p /app/data && chown lex:lex /app/data

# Copy dependency files first for better caching
COPY pyproject.toml uv.lock ./

# Install dependencies
RUN uv sync --frozen

# Copy project files (explicit list to avoid copying sensitive data)
COPY main.py database.py models.py migrate.py ./
COPY security/ ./security/
COPY services/ ./services/
COPY i18n/ ./i18n/
COPY templates/ ./templates/
COPY static/ ./static/

# Change ownership to non-root user
RUN chown -R lex:lex /app

USER lex

# Expose port
EXPOSE 8003

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8003/')" || exit 1

# Run the application
CMD ["uv", "run", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8003"]