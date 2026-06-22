# Lex

Lex is a web application for learning foreign words using spaced repetition.

## Features

- **Add words** — Add new words with translations manually or get auto-translation via Yandex Translate API
- **Review mode** — Practice words with bidirectional learning (English→Russian and Russian→English)
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

Build and run with Docker Compose:

```bash
docker compose up -d --build
```

The app will be available at http://localhost:8003

## Usage

### Adding Words

1. Go to **Добавить** (Add) page
2. Enter a word in English
3. Either:
   - Click **Автоперевод** to get automatic translation
   - Enter translation manually
4. Click **Добавить** (Add)

### Reviewing Words

1. Go to **Повтор** (Review) page
2. You will see a word in English or Russian
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
make run    # Start development server
make lint   # Run linter (ruff)
make test   # Run tests
make clean  # Clean Python cache
```

### Project Structure

```
lex/
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
└── pyproject.toml    # Dependencies
```

## License

This project is for personal use.
