.PHONY: help run proxy client-dev client-build client-test client-lint client-typecheck lint test test-cov clean d-build d-run d-stop d-down d-logs d-rebuild deploy

help: ## Show available commands
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

# ---------- Development ----------

client-dev: ## Start client dev server (port 5173)
	cd client && npm run dev

proxy: ## Start translate proxy (port 8004)
	uv run --with-requirements proxy/requirements.txt uvicorn main:app --port 8004 --reload --app-dir proxy

run: ## Start old server (port 8003, for migration only)
	uv run --frozen uvicorn main:app --host 0.0.0.0 --port 8003 --reload

# ---------- Client checks ----------

client-build: ## Build client for production
	cd client && npm run build

client-test: ## Run client tests (vitest)
	cd client && npm run test

client-lint: ## Lint client code (eslint)
	cd client && npm run lint

client-typecheck: ## Type-check client (tsc)
	cd client && npx tsc --noEmit

# ---------- Server checks ----------

lint: ## Lint server code (ruff)
	uv run --frozen ruff check .

test: ## Run server tests (pytest)
	uv run --frozen pytest

test-cov: ## Run server tests with coverage
	@mkdir -p coverage-reports
	uv run --frozen pytest --cov=. --cov-report=term-missing --cov-report=xml:coverage-reports/coverage.xml --cov-report=html:htmlcov --junitxml=coverage-reports/test-results.xml
	@echo ""
	@echo "Coverage reports generated:"
	@echo "  - XML: coverage-reports/coverage.xml (for SonarQube coverage)"
	@echo "  - JUnit: coverage-reports/test-results.xml (for SonarQube test execution)"
	@echo "  - HTML: htmlcov/index.html (open in browser)"

# ---------- All checks ----------

check: ## Run all checks (client + server)
	cd client && npx tsc --noEmit
	cd client && npm run lint
	cd client && npm run test
	uv run --frozen ruff check .
	uv run --frozen pytest

# ---------- Docker ----------

d-build: ## Build Docker image (proxy only)
	docker compose build

d-run: ## Start Docker container (proxy only)
	docker compose up -d

d-stop: ## Stop Docker container
	docker compose stop

d-down: ## Stop and remove Docker container
	docker compose down

d-logs: ## Follow Docker logs
	docker compose logs -f

d-rebuild: ## Rebuild and restart Docker container (proxy only)
	docker compose down
	docker compose up -d --build

# ---------- Deploy ----------

deploy: ## Deploy: build client + rebuild proxy container
	cd client && npm ci && npm run build
	docker compose down
	docker compose up -d --build

# ---------- Cleanup ----------

clean: ## Clean caches and coverage reports
	find . -type d -name __pycache__ -exec rm -rf {} +
	find . -type f -name *.pyc -delete
	rm -rf coverage-reports htmlcov .pytest_cache .ruff_cache
