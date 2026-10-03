.PHONY: help dev proxy client-dev client-build client-test client-lint client-typecheck \
        proxy-lint proxy-test proxy-test-cov check \
        android-sync android-build android-builder android-apk tauri-dev tauri-build \
        linux-install linux-uninstall \
        d-build d-run d-stop d-down d-logs d-rebuild \
        deploy clean

# Proxy URL baked into native builds. A relative path only works in the browser:
# Tauri runs on tauri://localhost and Capacitor on https://localhost, so both
# need the absolute proxy origin. Override with PROXY_URL=... if needed.
PROXY_URL ?= https://lextr.ru

# Newest built .deb package (used by linux-install)
DEB_FILE = $(shell ls -t client/src-tauri/target/release/bundle/deb/Lex_*.deb 2>/dev/null | head -1)

# Android APK build (Docker). The image carries JDK 21 + Android SDK 36;
# Gradle caches live in .gradle-docker/ on the host so rebuilds are fast.
ANDROID_BUILDER_IMAGE ?= lex-android-builder
ANDROID_GRADLE_CACHE ?= $(CURDIR)/.gradle-docker
# Release keystore lives outside the repository (see keystore.properties).
ANDROID_KEYSTORE_DIR ?= $(HOME)/lex-keystore
APK_FILE = client/android/app/build/outputs/apk/release/app-release.apk
APK_DEBUG_FILE = client/android/app/build/outputs/apk/debug/app-debug.apk

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

android-build: ## Build Android APK (release) with a local JDK + Android SDK
	cd client && VITE_PROXY_URL=$(PROXY_URL) npm run build
	cd client && npx cap sync android
	@echo "APK: client/android/app/build/outputs/apk/release/"
	cd client/android && ./gradlew assembleRelease

android-builder: ## Build the Docker image used by android-apk
	docker build -f docker/android/Dockerfile -t $(ANDROID_BUILDER_IMAGE) docker/android

android-apk: ## Build a signed release APK in Docker (needs app/keystore.properties)
	@test -f client/android/app/keystore.properties || { echo "ERROR: client/android/app/keystore.properties is missing — create the keystore first (see .koda/plans/android-release.md, step 3)"; exit 1; }
	cd client && VITE_PROXY_URL=$(PROXY_URL) npm run build
	cd client && npx cap sync android
	@mkdir -p $(ANDROID_GRADLE_CACHE)
	@test -w $(ANDROID_GRADLE_CACHE) || docker run --rm -v $(ANDROID_GRADLE_CACHE):/c $(ANDROID_BUILDER_IMAGE) chown -R $(shell id -u):$(shell id -g) /c
	docker run --rm \
		--user $(shell id -u):$(shell id -g) \
		-e HOME=/tmp/home \
		-v $(CURDIR)/client:/workspace/client \
		-v $(ANDROID_GRADLE_CACHE):/gradle-cache \
		-v $(ANDROID_KEYSTORE_DIR):$(ANDROID_KEYSTORE_DIR):ro \
		-w /workspace/client/android \
		$(ANDROID_BUILDER_IMAGE) \
		./gradlew assembleRelease --no-daemon
	@echo "APK: $(APK_FILE)"

android-apk-debug: ## Build a debug APK in Docker (WebView debugging on, no keystore)
	cd client && VITE_PROXY_URL=$(PROXY_URL) npm run build
	cd client && npx cap sync android
	@mkdir -p $(ANDROID_GRADLE_CACHE)
	@test -w $(ANDROID_GRADLE_CACHE) || docker run --rm -v $(ANDROID_GRADLE_CACHE):/c $(ANDROID_BUILDER_IMAGE) chown -R $(shell id -u):$(shell id -g) /c
	docker run --rm \
		--user $(shell id -u):$(shell id -g) \
		-e HOME=/tmp/home \
		-v $(CURDIR)/client:/workspace/client \
		-v $(ANDROID_GRADLE_CACHE):/gradle-cache \
		-w /workspace/client/android \
		$(ANDROID_BUILDER_IMAGE) \
		./gradlew assembleDebug --no-daemon
	@echo "APK: $(APK_DEBUG_FILE)"

# ======================================================================
# Desktop (Tauri)
# ======================================================================

tauri-dev: ## Start Tauri desktop dev mode
	cd client && npm run tauri:dev

tauri-build: ## Build desktop installers (Windows MSI/NSIS, macOS DMG, Linux deb/AppImage)
	cd client && VITE_PROXY_URL=$(PROXY_URL) npm run tauri:build
	@echo "Bundles: client/src-tauri/target/release/bundle/"

linux-install: ## Install the newest built .deb system-wide (needs sudo)
	@test -n "$(DEB_FILE)" || { echo "ERROR: no .deb found — run 'make tauri-build' first"; exit 1; }
	@echo "Installing $(DEB_FILE)"
	sudo apt install -y "$(CURDIR)/$(DEB_FILE)"

linux-uninstall: ## Remove the installed Lex package (needs sudo)
	sudo apt remove -y lex

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
	@rm -f /tmp/lex-deploy-stamp && touch /tmp/lex-deploy-stamp
	cd client && npm ci && npm run build
	@test -f client/dist/index.html || { echo "ERROR: client/dist/index.html is missing — deploy aborted"; exit 1; }
	@test client/dist/index.html -nt /tmp/lex-deploy-stamp || { echo "ERROR: client/dist was not refreshed by the build (killed by OOM?) — deploy aborted"; exit 1; }
	@rm -f /tmp/lex-deploy-stamp
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