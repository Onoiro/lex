.PHONY: help dev proxy client-dev client-build client-test client-lint client-typecheck \
        proxy-lint proxy-test proxy-test-cov check \
        android-sync android-build tauri-dev tauri-build \
        d-build d-run d-stop d-down d-logs d-rebuild \
        deploy clean

help: ## Show available commands
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

# ======================================================================
# Development
# ======================================================================

dev: proxy client-dev ## Start both proxy and client dev server (two processes)

proxy: ## Start translate proxy (port 8004)
	uv run --with-requirements proxy/requirements.txt uvicorn proxy.main:app --port 8004 --reload

client-dev: ## Start client dev server (port 5173)
	cd client && npm run dev

# ======================================================================
# Client checks
# ======================================================================

client-build: ## Build client for production
	cd client && npm run build

client-test: ## Run client tests (vitest)
	cd client && npm run test

client-lint: ## Lint client code (eslint)
	cd client && npm run lint

client-typecheck: ## Type-check client (tsc)
	cd client && npx tsc --noEmit

# ======================================================================
# Proxy checks
# ======================================================================

proxy-lint: ## Lint proxy code (ruff)
	uv run --frozen ruff check proxy/

proxy-test: ## Run proxy tests (pytest)
	uv run --frozen pytest tests/ -v

proxy-test-cov: ## Run proxy tests with coverage
	@mkdir -p coverage-reports
	uv run --frozen pytest tests/ --cov=proxy --cov-report=term-missing --cov-report=xml:coverage-reports/proxy-coverage.xml

# ======================================================================
# All checks
# ======================================================================

check: ## Run all checks (client lint + typecheck + test, proxy lint + test)
	cd client && npx tsc --noEmit
	cd client && npm run lint
	cd client && npm run test
	uv run --frozen ruff check proxy/
	uv run --frozen pytest tests/ -v

# ======================================================================
# Android (Capacitor)
# ======================================================================

android-sync: client-build ## Sync Capacitor with latest build
	cd client && npx cap sync android

android-build: android-sync ## Build Android APK (release)
	@echo "APK: client/android/app/build/outputs/apk/release/"
	cd client/android && ./gradlew assembleRelease

# ======================================================================
# Desktop (Tauri)
# ======================================================================

tauri-dev: ## Start Tauri desktop dev mode
	cd client && npm run tauri:dev

tauri-build: ## Build desktop installers (Windows MSI/NSIS, macOS DMG, Linux deb/AppImage)
	@echo "Bundles: client/src-tauri/target/release/bundle/"
	cd client && npm run tauri:build

# ======================================================================
# Docker (proxy only)
# ======================================================================

d-build: ## Build Docker image (proxy)
	docker compose build

d-run: ## Start Docker container (proxy, detached)
	docker compose up -d

d-stop: ## Stop Docker container
	docker compose stop

d-down: ## Stop and remove Docker container
	docker compose down

d-logs: ## Follow Docker logs
	docker compose logs -f

d-rebuild: ## Rebuild and restart Docker container
	docker compose down
	docker compose up -d --build

# ======================================================================
# Deploy (production)
# ======================================================================

deploy: ## Deploy: build client + rebuild & restart proxy container + prune unused images
	cd client && npm ci && npm run build
	docker compose down
	docker compose up -d --build
	docker image prune -f

# ======================================================================
# Cleanup
# ======================================================================

clean: ## Clean caches and coverage reports
	find . -type d -name __pycache__ -exec rm -rf {} +
	find . -type f -name *.pyc -delete
	rm -rf coverage-reports htmlcov .pytest_cache .ruff_cache client/coverage client/dev-dist
