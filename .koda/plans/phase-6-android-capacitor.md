# Phase 6: Android (Capacitor) — План

## Контекст
- PWA из Phase 5 (Vite build → `client/dist/`)
- Capacitor оборачивает web-приложение в нативный Android-шел
- На машине нет Java/Gradle/Android SDK — сборка APK будет недоступна локально
- Цель: полностью настроенный Capacitor-проект, готовый к сборке на машине с Android SDK
- Дистрибуция: RuStore + AppGallery (не Google Play)

## Шаги

1. [x] **Install Capacitor core, CLI, and Android platform**
   - npm install @capacitor/core @capacitor/cli @capacitor/android
   - npx cap init "Lex" "ru.lex.app" --web-dir=dist
   - Файлы:
     - client/package.json
     - client/capacitor.config.ts

2. [x] **Configure capacitor.config.ts**
   - appId: ru.lex.app, appName: Lex, webDir: dist
   - server: { androidScheme: "https" }, backgroundColor: #ffffff
   - Файлы:
     - client/capacitor.config.ts

3. [x] **Add Android platform and configure permissions**
   - npx cap add android
   - AndroidManifest.xml: INTERNET permission only
   - Файлы:
     - client/android/ (generated)
     - client/android/app/src/main/AndroidManifest.xml

4. [x] **Generate Android app icons from existing PWA icons**
   - Использовать существующие иконки (512x512) для mipmap
   - Создать adaptive icon (foreground + background)
   - Файлы:
     - client/android/app/src/main/res/mipmap-*/ic_launcher.png
     - client/android/app/src/main/res/mipmap-*/ic_launcher_round.png

5. [x] **Configure build.gradle for RuStore/AppGallery publishing**
   - versionCode, versionName из package.json
   - buildTypes: release (signing config placeholder)
   - Файлы:
     - client/android/app/build.gradle
     - client/android/app/src/main/res/values/strings.xml

6. [x] **Add Capacitor status bar and splash screen plugins**
   - npm install @capacitor/status-bar @capacitor/splash-screen
   - Настроить цвет status bar (#1095c1), splash screen
   - Файлы:
     - client/package.json
     - client/src/main.tsx
     - client/android/app/src/main/res/drawable/splash.png

7. [x] **Sync web build to Android and verify project structure**
   - npx vite build && npx cap sync android
   - Проверить, что dist/ скопирован в android/app/src/main/assets/public/
   - Файлы:
     - client/android/app/src/main/assets/public/ (synced)

8. [x] **Verify: build, lint, test all pass**
   - npx tsc --noEmit
   - npx vite build
   - npx eslint .
   - npx vitest run
   - npx cap sync android (verify no errors)
