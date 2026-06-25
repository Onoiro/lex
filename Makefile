.PHONY: run lint test test-cov clean d-build d-run d-stop d-down d-logs d-rebuild

run:
	uv run uvicorn main:app --host 0.0.0.0 --port 8003 --reload

lint:
	uv run ruff check .

test:
	uv run pytest

test-cov:
	@mkdir -p coverage-reports
	uv run pytest --cov=. --cov-report=term-missing --cov-report=xml:coverage-reports/coverage.xml --cov-report=html:htmlcov
	@echo ""
	@echo "Coverage reports generated:"
	@echo "  - XML: coverage-reports/coverage.xml (for SonarQube)"
	@echo "  - HTML: htmlcov/index.html (open in browser)"

clean:
	find . -type d -name __pycache__ -exec rm -rf {} +
	find . -type f -name *.pyc -delete
	rm -rf coverage-reports htmlcov .pytest_cache .ruff_cache
