.PHONY: run lint test test-cov clean d-build d-run d-stop d-down d-logs d-rebuild

run:
	uv run --frozen uvicorn main:app --host 0.0.0.0 --port 8003 --reload

lint:
	uv run --frozen ruff check .

test:
	uv run --frozen pytest

test-cov:
	@mkdir -p coverage-reports
	uv run --frozen pytest --cov=. --cov-report=term-missing --cov-report=xml:coverage-reports/coverage.xml --cov-report=html:htmlcov --junitxml=coverage-reports/test-results.xml
	@echo ""
	@echo "Coverage reports generated:"
	@echo "  - XML: coverage-reports/coverage.xml (for SonarQube coverage)"
	@echo "  - JUnit: coverage-reports/test-results.xml (for SonarQube test execution)"
	@echo "  - HTML: htmlcov/index.html (open in browser)"

clean:
	find . -type d -name __pycache__ -exec rm -rf {} +
	find . -type f -name *.pyc -delete
	rm -rf coverage-reports htmlcov .pytest_cache .ruff_cache

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
	docker compose down
	docker compose up -d --build
