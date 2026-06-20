.PHONY: run lint test clean d-build d-run d-stop d-down d-logs d-rebuild

run:
	uv run uvicorn main:app --host 0.0.0.0 --port 8003 --reload

lint:
	uv run ruff check .

test:
	uv run pytest

clean:
	find . -type d -name __pycache__ -exec rm -rf {} +
	find . -type f -name *.pyc -delete

# Docker commands
d-build:
	docker compose build

d-run:
	docker compose up -d

d-stop:
	docker compose stop

d-down:
	docker compose down

d-logs:
	docker compose logs -f

d-rebuild:
	docker compose up -d --build --force-recreate
