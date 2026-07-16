# Phase 7: Desktop (Tauri) — План

## Контекст
- PWA из Phase 5, Vite build → `client/dist/`
- Tauri v2: обёртка web-приложения в нативный десктоп-шел (Rust + WebView)
- Системные библиотеки: ✅ webkit2gtk-4.1, gtk-3, librsvg2, build-essential
- Rust/Cargo: ❌ нет, нужно установить через rustup
- Цель: нативные инсталяторы Windows (MSI/NSIS), macOS (DMG), Linux (AppImage/deb)
- На этой машине: сборка Linux (AppImage/deb), крос-компиляция Windows/macOS требует CI

## Шаги

1. [x] **Install Rust toolchain via rustup**
   - curl rustup, установка stable toolchain
   - Проверка: cargo --version, rustc --version
   - Файлы:
     - ~/.cargo, ~/.rustup (system-level)

2. [x] **Install @tauri-apps/cli and initialize Tauri project**
   - npm install --save-dev @tauri-apps/cli@latest
   - Создать src-tauri/ вручную (tauri init интерактивный, зависнет)
   - Файлы:
     - client/package.json
     - client/src-tauri/Cargo.toml
     - client/src-tauri/tauri.conf.json
     - client/src-tauri/src/main.rs
     - client/src-tauri/build.rs

3. [x] **Configure tauri.conf.json**
   - productName: Lex, version: 0.11.7
   - frontendDist: ../dist, devUrl: http://localhost:5173
   - bundle: targets (deb, appimage, msi, nsis, dmg), icons
   - window: title, width, height, minWidth, resizable
   - Файлы:
     - client/src-tauri/tauri.conf.json

4. [x] **Generate Tauri app icons from existing PWA icons**
   - Использовать npx tauri icon с web-app-manifest-512x512.png
   - Файлы:
     - client/src-tauri/icons/ (generated)

5. [x] **Add npm scripts for Tauri**
   - tauri:dev, tauri:build в package.json
   - Файлы:
     - client/package.json

6. [x] **Build and verify Linux bundle**
   - npx tauri build (deb + AppImage)
   - deb: ✅ Lex_0.11.7_amd64.deb (3.1 MB)
   - AppImage: ❌ timeout downloading AppRun from GitHub (network issue)
   - Binary: ✅ lex (11 MB)

7. [x] **Verify: web build, lint, test all pass**
   - npx tsc --noEmit
   - npx vite build
   - npx eslint .
   - npx vitest run
