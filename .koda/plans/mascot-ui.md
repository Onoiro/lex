# План: интеграция маскота-попугая в UI Lex

Дата: 20 сентября 2026
Ветка: `feature/mascot` (создать в начале)
Ассеты: `client/public/mascot/` — 9 PNG 512×512, прозрачный фон (base, happy, sad, hint, thinking, sleeping, tired, celebrate, empty). Эталон: `design/mascot/base.jpg`.
Важно: наушники на всех изображениях — **чёрные** (не белые, как в ранних промптах).

## Ключевые решения (утверждено пользователем)

- **Дозированность:** не более одного маскота в поле зрения; только там, где есть эмоция или пауза.
- **Три размера:** hero (120–160px), inline (44–56px), micro (28–32px).
- **Add — без маскота** в обычном режиме (плотная страница); только `tired` в сообщении о лимите и `thinking` во время автоперевода.
- **Review — главная интеграция:** micro над карточкой со сменой эмоций по событиям; hero на старте/пауза/done.
- **Анимация:** только CSS (bounce при смене эмоции ~200ms, лёгкое покачивание idle), уважать `prefers-reduced-motion`.
- **Производительность:** конвертация в WebP (~30–40 КБ/шт), в precache SW — только `base`, остальные lazy.
- **Архитектура:** один компонент `Mascot.tsx`, union-тип эмоций, весь маппинг в одном месте.
- **Доступность:** `aria-hidden="true"`, `loading="lazy"` (кроме hero).

## Маппинг «место → эмоция»

| Экран | Эмоция | Размер |
|---|---|---|
| Home (hero над заголовком) | base | hero |
| Add: автоперевод идёт | thinking | inline |
| Add: лимит исчерпан (сообщение) | tired | inline |
| Review: старт, блок «Сегодня» | base | hero |
| Review: тренировка, над карточкой | thinking → hint → happy/sad | micro |
| Review: пауза | sleeping | hero |
| Review: done + streak | celebrate | hero |
| Dictionary: пустое состояние | empty | hero |
| OfflineIndicator | sleeping | inline |
| Settings: раздел лимитов | tired | inline |
| UpdateScreen | tired | inline |

## Шаги

### Шаг 1. Оптимизация ассетов
- Конвертировать 9 PNG → WebP (sharp или cwebp, quality ~80): `client/public/mascot/*.webp` рядом с PNG.
- Цель: ≤40 КБ каждый, суммарно ≤350 КБ.
- PNG-исходники в `client/public/mascot/` оставить (fallback для старых WebView без WebP — проверить поддержку: Capacitor/Tauri WebView WebP поддерживают, PNG можно удалить после проверки; решение принять на шаге).
- Скрипт конвертации положить в `design/mascot/convert.sh` (или one-off командой, без коммита скрипта — решить по ходу).

### Шаг 2. Компонент Mascot.tsx
- `client/src/components/Mascot.tsx`:
  - `type MascotEmotion = "base" | "happy" | "sad" | "hint" | "thinking" | "sleeping" | "tired" | "celebrate" | "empty"`
  - `type MascotSize = "hero" | "inline" | "micro"`
  - Props: `emotion`, `size`, опционально `animated` (default true).
  - `<img src="/mascot/{emotion}.webp" aria-hidden="true" loading="lazy" />` (hero — eager).
  - Размеры через inline-стили (Pico-подход проекта): hero 140px, inline 48px, micro 32px.
- CSS в `client/src/index.css`: класс `.mascot` (display block, margin auto), `.mascot-bounce` (keyframes bounce ~200ms, срабатывает при смене emotion — через key на img или animation restart), `@media (prefers-reduced-motion: reduce) { animation: none }`.
- VITE_PROXY_URL не влияет: `/mascot/...` — относительный путь, работает в PWA/Capacitor/Tauri.

### Шаг 3. Home.tsx
- Hero `base` над `<hgroup>` (по центру, margin-bottom ~1rem).
- Больше ничего не менять.

### Шаг 4. Review.tsx
- Старт (`phase === "start"`): hero `base` в блоке «Сегодня» (слева от статистики или над ней — по вёрстке).
- Тренировка: micro над карточкой:
  - состояние `mascotEmotion` в state: `thinking` при показе новой карточки, `hint` при открытии подсказки, `happy`/`sad` на ~1.2 сек после ответа, затем обратно `thinking` при следующей карточке.
  - таймер авто-ответа и логика не трогаются.
- Пауза (`phase === "paused"`): hero `sleeping`.
- Done (`phase === "done"`): hero `celebrate`.
- Пусто (`phase === "empty"`): hero `empty` (вместо/рядом с текстом).

### Шаг 5. Add.tsx
- Во время автоперевода (loading-состояние запроса): inline `thinking` рядом со спиннером/полем перевода.
- Сообщение о лимите (quotaExceeded / text_too_long): inline `tired` в сообщении.
- Остальной UI не трогать.

### Шаг 6. Dictionary.tsx
- Пустое состояние (`dictionary.empty`): hero `empty` над текстом.

### Шаг 7. Служебные места
- `OfflineIndicator.tsx`: inline `sleeping` слева от текста (вместо ⚠️ или рядом).
- `Settings.tsx` раздел «Лимиты использования»: inline `tired` в заголовке/теле раздела.
- `UpdateScreen.tsx`: inline `tired` над текстом.

### Шаг 8. PWA / service worker
- `vite.config.ts`: в `workbox.globPatterns` добавить `mascot/*.webp` (или проверить, что `**/*.{js,css,html,png,webp...}` уже покрывает).
- В precache попадут все WebP — проверить итоговый размер precache (~350 КБ допустимо; если больше — runtimeCaching для эмоций, precache только base).
- Решение по PNG: если WebView-поддержка WebP подтверждена (Capacitor 8 / Tauri 2 — да), PNG из `client/public/mascot/` удалить, оставить только WebP.

### Шаг 9. Тёмная тема — визуальная проверка
- Прогнать экраны с маскотом в light/dark (скриншоты или ручная проверка пользователем).
- Риск: светлые части персонажа без контура растворяются на тёмном фоне. Если проблема — лёгкая обводка через CSS `filter: drop-shadow(0 0 1px rgba(0,0,0,.35))` только в dark.

### Шаг 10. i18n
- Маскот декоративный (`aria-hidden`), тексты не нужны.
- Единственное: если в сообщениях рядом с маскотом меняются формулировки (например, оффлайн-сообщение станет дружелюбнее) — ключи `offline.*`, `limits.*` обновить в `en.json` + `ru.json`. Решить по ходу; минимум — без изменений текстов.

### Шаг 11. Тесты (Vitest)
- `Mascot.test.tsx`: рендер всех эмоций/размеров, `aria-hidden`, `loading` (lazy/eager), src-путь.
- Review: смена `mascotEmotion` по событиям (thinking → happy/sad → thinking; hint при подсказке) — через `data-testid="mascot"`.
- Add: `tired` появляется при quotaExceeded.
- Dictionary: `empty` в пустом состоянии.
- Готча из памяти: в Add-тестах квоты использовать `fireEvent.change` (не user.type); mockRejectedValue протекает — восстанавливать в конце теста.

### Шаг 12. Верификация
- `cd client && npm run lint && npm run test && npm run build`.
- Проверить размер бандла/precache в выводе build.
- Прогон dev-сервера, визуальная проверка пользователем (light/dark, мобильная ширина).

### Шаг 13. Документация + semver
- README: маскот в описании фич/структуры (кратко).
- KODA.md: раздел про маскот (компонент, эмоции, размеры, ассеты, правило дозированности).
- `.koda/mascot-prompts.md`: пометка, что наушники в финальных ассетах чёрные (исправить упоминания белых).
- semver: minor bump 1.24.3 → 1.25.0 (versionCode 69) в 4 файлах (pyproject.toml, client/package.json, client/src-tauri/tauri.conf.json, client/android/app/build.gradle) + `uv lock` (uv.lock). Тип: новая фича.
- Коммит на ветке `feature/mascot`.

## Риски и готчи

- **Размер precache:** 9 WebP × ~35 КБ ≈ 315 КБ — приемлемо, но проверить итог в `dist/sw.js` manifest.
- **Тёмная тема:** светлые зоны персонажа без контура — возможен drop-shadow фикс (шаг 9).
- **Review — плотный экран:** micro-размер обязателен, не раздувать отступы; проверить мобильную ширину 360px.
- **Анимация bounce:** перезапуск анимации при смене emotion — через `key={emotion}` на img (React перемонтирует элемент, animation проиграется заново). Не забыть `prefers-reduced-motion`.
- **Тесты jsdom:** картинки не грузятся реально — проверять только атрибуты/src, не naturalWidth.
- **Vite dev:** изменения vite.config.ts (workbox patterns) требуют перезапуска dev-сервера.
