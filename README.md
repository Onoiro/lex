# Lex

Lex is a web-based translator and vocabulary assistant. It provides fast translation between Russian and 90+ languages via Yandex Translate API, plus a spaced-repetition tool for learning and retaining foreign words.

## Features

- **Add words** — Add new words with translations manually or get auto-translation via Yandex Translate API
- **Multi-language translation** — Translate between Russian and 90+ languages (English, Spanish, French, German, Chinese, Arabic, and many more)
- **Review mode** — Practice words with spaced repetition to retain translations in memory
- **Dictionary view** — See all your words in a searchable table
- **Delete words** — Remove words you no longer need
- **Spaced repetition** — Words you forget more often appear more frequently in reviews

## Tech Stack

- **Backend:** Python 3.13, FastAPI
- **Database:** SQLite
- **ORM:** SQLAlchemy 2.0
- **Templates:** Jinja2
- **Styles:** Pico CSS
- **Translation:** Yandex Translate Cloud API v2

## Quick Start

### Prerequisites

- Python 3.10+
- [uv](https://docs.astral.sh/uv/) package manager
- Yandex Translate API key (optional, for auto-translation)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/lex.git
   cd lex
   ```

2. Install dependencies:
   ```bash
   uv sync
   ```

3. Create `.env` file:
   ```bash
   cp .env.example .env
   ```

4. Add your Yandex API key to `.env` (optional):
   ```
   YANDEX_API_KEY=your_api_key_here
   ```

5. Run the development server:
   ```bash
   make run
   ```

6. Open http://localhost:8003 in your browser

### Docker

#### Quick start with Docker Compose

Build and run the app in a container:

```bash
make d-build  # docker compose build
make d-run    # docker compose up -d
```

The app will be available at http://localhost:8003

Other Docker commands:

```bash
make d-stop   # docker compose stop
make d-down   # docker compose down
make d-logs   # docker compose logs -f
make d-rebuild # docker compose down && docker compose up -d --build
```

#### Dockerfile

Build the image manually:

```bash
docker build -t lex-app .
```

Run the container:

```bash
docker run -d --name lex \
  -p 8003:8003 \
  -v $(pwd)/data:/app/data \
  --env-file .env \
  lex-app
```

The `-v $(pwd)/data:/app/data` mount persists the SQLite database outside the container.


## Usage

### Adding Words

1. Go to **Добавить** (Add) page
2. Enter a word in any supported language
3. Either:
   - Click **Автоперевод** to get automatic translation to Russian
   - Enter translation manually
4. Click **Добавить** (Add)

### Reviewing Words

1. Go to **Повтор** (Review) page
2. You will see a word in any language or Russian
3. Click:
   - **Знаю** (Know) — if you remember the translation
   - **Забыл** (Forgot) — if you don't remember
4. The next word appears automatically after 2 seconds
5. Click **Следующее слово** (Next word) to skip the wait

### Dictionary

1. Go to **Словарь** (Dictionary) page
2. See all words sorted alphabetically
3. Click **✕** to delete a word

## Spaced Repetition Algorithm

Lex uses a simplified SM-2 algorithm:

- **Correct answer:** Interval increases (1 → 6 → 15 → 38 → 94 days...)
- **Wrong answer:** Interval resets to 0
- **Selection:** Words with smaller intervals have higher chance to appear

## Development

### Commands

```bash
make run       # Start development server
make lint      # Run linter (ruff)
make test      # Run tests
make test-cov  # Run tests with coverage report (XML for SonarQube + HTML)
make clean     # Clean Python cache and coverage reports
```

### Coverage Reports

To generate code coverage reports:

```bash
make test-cov
```

This creates:
- `coverage-reports/coverage.xml` — XML format for SonarQube Cloud
- `htmlcov/index.html` — Interactive HTML report (open in browser)
- Terminal output with line-by-line coverage details

### Project Structure

```
.
├── main.py           # FastAPI routes
├── database.py       # SQLite setup
├── models.py         # SQLAlchemy models
├── translator.py     # Yandex Translate API
├── auth.py           # Authentication
├── csrf.py           # CSRF protection
├── validators.py     # Input validation
├── templates/        # Jinja2 templates
│   ├── base.html
│   ├── index.html
│   ├── add.html
│   ├── review.html
│   └── dictionary.html
├── tests/            # Unit tests
├── Dockerfile        # Docker image definition
├── docker-compose.yml
├── pyproject.toml    # Dependencies
└── Makefile          # Build commands
```

## License

This project may be used for personal or non-commercial purposes.
