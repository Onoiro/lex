.PHONY: run lint test clean

run:
	uv run uvicorn main:app --host 0.0.0.0 --port 8003 --reload

lint:
	uv run ruff check .

test:
	uv run pytest

clean:
	find . -type d -name __pycache__ -exec rm -rf {} +
	find . -type f -name *.pyc -delete
