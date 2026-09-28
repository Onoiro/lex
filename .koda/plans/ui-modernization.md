# UI-модернизация Lex — Фаза 0 (токены и радиусы) и Фаза 1 (компоненты, шрифт, иконки)

## Статус выполнения

- [x] **Фаза 0 — токены и радиусы** (закоммичено 44d34f0, v1.27.1, versionCode 72)
- [x] **Фикс текста сохранения настроек** (`settings.lang_updated` → `settings.saved`, «Настройки сохранены.»)
- [ ] **1.1** Структура стилей: `styles/tokens.css` + `styles/components.css` + токены типографики
- [ ] **1.2** Классы `.lex-*` вместо inline-стилей (цель: 221 → ≤ 40)
- [ ] **1.3** Self-hosted шрифт Manrope + precache woff2
- [ ] **1.4** SVG-иконки вместо эмодзи (`components/icons.tsx`)
- [ ] **1.5** Floating bottom-nav + safe-area
- [ ] **1.6** Покосопутные: i18n OfflineIndicator, viewport (pinch-zoom), theme-color/статус-бар
- [ ] **1.7** Проверка (lint/test/build + офлайн + визуально)
- [ ] **1.8** Документация + semver minor 1.27.1 → 1.28.0 (versionCode 73)

## Принятые решения пользователя

1. Шрифт — **Manrope** (`@fontsource-variable/manrope`, cyrillic). Если не понравится — альтернатива Plus Jakarta Sans.
2. Основные кнопки — **скругление 12px** (не pill). Pill остаётся у поиска и bottom-nav.
3. Шаг 1.6 — **оба пункта «да»**: убрать запрет pinch-zoom (`user-scalable=0` → `viewport-fit=cover`) И синхронизировать `theme-color`/статус-бар Android со скином.
4. Фаза 0 — **отдельным релизом** 1.27.1 (уже сделано). Фаза 1 — отдельный minor 1.28.0.


## Контекст и диагноз

Приложение целиком стилизовано через Pico CSS 2.1.1 (`client/src/main.tsx`:
`import "@picocss/pico/css/pico.min.css"`, затем `./index.css`). Классы Pico
используются как есть: `article`, `grid`, `hgroup`, `role="button"`, `outline`,
`secondary`, `contrast`, `details`, `table`, `nav`.

Что делает интерфейс «устаревшим» (проверено по коду, не на глаз):

1. **Один радиус на всё и он минимальный.** Pico: `--pico-border-radius: 0.25rem`
   (4px) — применяется к кнопкам, `input`/`select`/`textarea`, `article`,
   `details.dropdown`, `code`, трекам `range`. В `client/src/index.css` ровно ОДНО
   упоминание `border-radius` — строка 616 (`.flip-card-front/back`), и оно ссылается
   на тот же `var(--pico-border-radius)`. Итог: при высоте контрола ~48px радиус 4px
   даёт отношение 1:12 — глаз читает это как прямоугольник.
   Современные ориентиры: M3 — кнопки 20dp, поля 4dp, карточки 12dp;
   Tailwind — `rounded-lg` 8px, `rounded-xl` 12px, `rounded-2xl` 16px.
2. **Внутреннее противоречие.** В Pico `[type=search]` и `[role=search]` уже имеют
   `--pico-border-radius: 5rem` (пилюля). В приложении пилюля — исключение, а не правило.
   Тот же разнобой в Настройках: свотчи скинов — круглые (`borderRadius: "50%"`),
   рядом обычные кнопки с 4px.
3. **Скины покрывают ~15 переменных из ~90.** В `index.css` 12 блоков
   (`data-skin` × light/dark: ocean, forest, sunset, midnight, rose, mono), но в них
   только цвета. НЕ переопределены и просвечивают дефолтами Pico:
   - `--pico-card-sectioning-background-color` — фон `article > header/footer`
     (серые полосы внутри цветных карточек; в dark-скинах особенно заметно:
     `ocean` dark карточка `#112238`, а полосы `#1a1e28`);
   - `--pico-form-element-background-color` (`#1c212b` в dark) и
     `--pico-form-element-border-color` — поля ввода выглядят чужими серыми
     прямоугольниками на фоне скина;
   - `--pico-box-shadow`, `--pico-card-box-shadow`, `--pico-outline-width`,
     `--pico-font-family`.
4. **Карточки Home — эталон «Pico-демо»:** `article` + `header` (серая полоса) +
   `p` + `footer` (серая полоса) + outline-кнопка. Две карточки = четыре серых плашки.
   Плюс двойной слой: у `article` и тень, и граница одновременно.
5. **Типографика без характера и вне шкалы:** системный шрифт, размеры заданы руками
   (0.7 / 0.75 / 0.8 / 0.85 / 0.9 / 0.95 / 1.05 / 1.1 / 1.2 / 1.4 / 1.5 rem), `h2`
   в Home принудительно 1.5rem (Pico — 1.75rem), `h3` в Настройках 1.1rem (Pico — 1.5rem).
6. **Эмодзи как иконки:** `🏠 🌍 🧠 📖 ⚙` в навигации, `✏️ 🗑️` в словаре,
   `⇄ 🔊 🔇 ⚡ 💡` в Add/Review/Dictionary. Рендерятся разными шрифтами на разных ОС,
   имеют собственные цвета, не подчиняются теме и не масштабируются как иконки.
7. **Нет интерактивных состояний:** `--pico-outline-width: 0.0625rem` (1px focus-ring),
   transition только на цвет, нет press-фидбека и hover-элевации.
8. **221 inline-стиль** на 7 страницах + 4 в компонентах: Review 53, Dictionary 53,
   Settings 49, Add 29, Privacy 14, Terms 12, Home 9, Layout 1, OfflineIndicator 1,
   Mascot 1. Инлайновые стили не участвуют в медиазапросах и не имеют `:hover`/`:focus`
   — структурное ограничение: эти поверхности нельзя стилизовать системно, не вынеся их
   в CSS-классы.

## Скоуп

- **В scope:** Фаза 0 (токены, радиусы, недостающие переменные скинов, press-фидбек)
  и Фаза 1 (токены-обёртки и классы вместо inline-стилей, self-hosted шрифт,
  SVG-иконки, floating bottom-nav, единая типографическая шкала).
- **НЕ в scope (переносится):** скины на палитрах Pico (`pico.jade.css` и т.п.),
  собственные React-компоненты Button/Card/Field, уход от Pico, motion-система,
  графики активности, ребрендинг маскота, смена визуального языка. Текущие скины
  сохранены как есть — добавлены только недостающие переменные.

## Фаза 0 — «Токены и радиусы» (1 вечер, только CSS)

Файл: `client/src/index.css` (+60…90 строк). TSX не трогаем вообще.

### 0.1 Базовые токены

В начало `index.css` (после шапки-комментария, до блоков скинов) добавить блок:

```css
/* Design tokens — Lex visual layer on top of Pico.
   Radius scale: sm = chips/badges, md = form fields, lg = cards, pill = CTAs. */
:root {
  --pico-border-radius: 0.5rem;           /* 8px — базовый радиус контролов */
  --pico-outline-width: 0.125rem;         /* 2px — читаемый focus-ring */
  --lex-radius-sm: 0.375rem;
  --lex-radius-md: 0.75rem;
  --lex-radius-lg: 1rem;
  --lex-radius-pill: 999px;
  --lex-shadow-1: 0 1px 2px rgba(15, 23, 42, 0.06), 0 1px 3px rgba(15, 23, 42, 0.10);
  --lex-shadow-2: 0 2px 6px rgba(15, 23, 42, 0.08), 0 8px 24px rgba(15, 23, 42, 0.10);
  --lex-press: translateY(1px);
}
```

Правило по значениям: контролы 8px, карточки 16px, CTA-кнопки pill. `[type=search]`
и `[role=search]` остаются pill (уже так) — теперь это согласуется с остальными
контролами, а не противоречит им.

### 0.2 Радиусы по типам поверхностей

```css
article {
  border-radius: var(--lex-radius-lg);
}

/* Main actions read as pills, secondary/outline stay rectangular */
:is(button, [role="button"], [type="submit"]):not(.outline):not(.secondary) {
  border-radius: var(--lex-radius-pill);
}

.flip-card-front,
.flip-card-back {
  border-radius: var(--lex-radius-lg);   /* была var(--pico-border-radius), строка ~616 */
}
```

`--lex-radius-md` и `--lex-shadow-*` заводятся сейчас и используются в Фазе 1 —
это осознанно, чтобы не переписывать токены позже.

### 0.3 Недостаточные переменные в скинах

В КАЖДЫЙ из 12 блоков (`ocean`, `forest`, `sunset`, `midnight`, `rose`, `mono`
× light/dark) добавить 4 переменные. Для light-блоков — производные от
`--pico-card-background-color`, для dark — чуть светлее фона карточки:

```css
/* light-пример (ocean) */
--pico-card-sectioning-background-color: #f6fbfd;
--pico-form-element-background-color: #fbfdfe;
--pico-form-element-border-color: #cfe2ec;
--pico-box-shadow: var(--lex-shadow-1);

/* dark-пример (ocean) */
--pico-card-sectioning-background-color: #16293f;
--pico-form-element-background-color: #0e2138;
--pico-form-element-border-color: #24415c;
--pico-box-shadow: none;   /* в dark тень нечитабельна, границы достаточно */
```

Точные значения — по каждому скину, по правилу: sectioning = card-background,
осветлённый/затемнённый на ~4% (light) / +8% светлее (dark); form-element background
= между фоном страницы и фоном карточки; border = существующий `--pico-border-color`
скина. Дефолтная тема (без `data-skin`) не правится — там дефолты Pico согласованы.

### 0.4 Press-фидбек и переходы

```css
:is(button, [role="button"], [type="submit"], .bottom-nav-item):active {
  transform: var(--lex-press);
}

@media (prefers-reduced-motion: no-preference) {
  :is(button, [role="button"], [type="submit"]) {
    transition: background-color var(--pico-transition),
                border-color var(--pico-transition),
                color var(--pico-transition),
                box-shadow var(--pico-transition),
                transform 0.08s ease-out;
  }
}
```

`prefers-reduced-motion` обязателен — в проекте уже есть прецедент
(`.mascot-bounce`, строка ~757).

### 0.5 Проверка Фазы 0

- `cd client && npm run lint && npm run test && npm run build` — ожидается 0 ошибок
  eslint, все тесты зелёные, build OK. Тесты к радиусам не привязаны
  (проверяются только inline `style.color` таймера — `Review.test.tsx:639,645,674` —
  и inline размеры маскота — `Mascot.test.tsx:38-39`), Фаза 0 их не затрагивает.
- Визуально на `npm run dev`: 6 скинов × light/dark на страницах Home, Add, Review,
  Dictionary, Settings. Смотреть: серые полосы в `article > header/footer` пропали,
  поля ввода в тон скину, focus-ring виден, карточка Повтора скруглена.

### 0.6 Документация и semver (Фаза 0)

- `KODA.md`: в раздел «Client → Правила разработки» добавить пункт про токены
  `--lex-radius-*` / `--lex-shadow-*` и правило «радиусы только через токены».
  Обновить «Текущая версия».
- `README.md`: строку «Pico CSS for styling» уточнить до «Pico CSS + Lex design tokens».
- semver: **patch** 1.27.0 → **1.27.1**, versionCode 71 → **72**
  (визуальные токены, поведение не меняется). Файлы: `pyproject.toml`,
  `client/package.json`, `client/src-tauri/tauri.conf.json`,
  `client/android/app/build.gradle` + `uv lock`.
- Ветка: `round-btns-forms` (уже создана от master, HEAD = 279d9b3).

## Фаза 1 — «Компоненты, шрифт, иконки» (1–2 дня)

### 1.1 Структура стилей

- `client/src/index.css` разделить: `client/src/styles/tokens.css` (токены + скины),
  `client/src/styles/components.css` (классы Lex), `client/src/index.css` — layout
  и то, что осталось (bottom-nav, flip-card, mascot, hero-блоки). Импорт в `main.tsx`
  не меняется (`./index.css` → `@import` двух файлов).
- Токены пространства и типографики:

```css
:root {
  --lex-text-xs: 0.75rem;
  --lex-text-sm: 0.875rem;
  --lex-text-base: 1rem;
  --lex-text-lg: 1.25rem;
  --lex-text-xl: 1.5rem;
  --lex-text-2xl: 2rem;
}
```

Существующие ручные значения (0.8 / 0.85 / 0.9 / 0.95 / 1.05 / 1.1 / 1.4)
округляются до ближайшего шага этой шкалы.

### 1.2 Классы вместо inline-стилей

Новые классы в `components.css`:

| Класс | Для чего | Заменяет |
|---|---|---|
| `.lex-card` | карточка без серых `header`/`footer`-полос, `--lex-shadow-1` | инлайн-паддинги `article` в Dictionary/Home |
| `.lex-alert` | цветные сообщения (`--pico-ins-color` / `--pico-del-color`) | 4 блока в Add.tsx, OfflineIndicator.tsx |
| `.lex-chip` | маленький статус/бейдж (квота, язык карточки, streak) | инлайн-`small` в Add/Review/Dictionary |
| `.lex-stat` | строка метрики (число + подпись) | блоки статистики Review/Settings |
| `.lex-icon-btn` | иконочная кнопка без рамки/фона | `✏️ 🗑️ ⇄ 🔊` в Dictionary/Add/Review |
| `.lex-hint` | muted-текст-подсказка | `style={{ color: "var(--pico-muted-color)" }}` (встречается ~20 раз) |

Порядок выноса (от самого ценного к остаткам): Review (53) → Dictionary (53) →
Settings (49) → Add (29) → Home (9) → Privacy/Terms (26) → Layout/OfflineIndicator (2).

Цель по числу inline-стилей: с 221 до ≤ 40. Оставшиеся — только динамические
значения, вычисляемые в рантайме (например `color: timerColor` у таймера,
`width/height` у `<Mascot />`).

**Жёсткое ограничение по тестам** (не ломать):
- `Review.test.tsx:639,645,674` читают `timerEl.style.color` — инлайн-цвет таймера
  остаётся инлайн-цветом;
- `Mascot.test.tsx:38-39` читают `img.style.width/height` — размеры маскота остаются
  инлайн;
- `Layout.test.tsx:60-66` ищут `.bottom-nav-item` (5 шт.) и эмодзи через `getByText` —
  при переходе на SVG (шаг 1.4) этот тест обновляется на `getByRole(..., { name: … })`
  по `aria-label`/тексту ссылки.

### 1.3 Self-hosted шрифт

- Зависимость: `@fontsource-variable/manrope` (latin + cyrillic, переменный —
  один файл вместо 6 начертаний). Ставим через `npm i @fontsource-variable/manrope`
  в `client/`. **Не** Google Fonts CDN: приложение офлайн-PWA, внешние запросы
  недопустимы.
- В `main.tsx` импорт шрифта ДО Pico; в `tokens.css`:
  `--pico-font-family: "Manrope Variable", system-ui, sans-serif;`
  (в `--pico-font-family-sans-serif` не лезем — Pico подставляет его сам).
- Проверить `vite-plugin-pwa` precache: шрифт должен попасть в `globPatterns`
  (в `client/vite.config.ts` добавить `**/*.{woff2,woff}`, если его там нет).
  Иначе — офлайн-запуск покажет fallback, а это регресс.
- Альтернатива, если Manrope не понравится: `@fontsource-variable/plus-jakarta-sans`
  (тоже cyrillic). Решение принимает пользователь на скриншотах.

### 1.4 SVG-иконки вместо эмодзи

- Новый файл `client/src/components/icons.tsx`: инлайновые SVG (`stroke="currentColor"`,
  `fill="none"`, 24×24, `aria-hidden`), набор: `HomeIcon`, `GlobeIcon`, `BrainIcon`,
  `BookIcon`, `GearIcon`, `PencilIcon`, `TrashIcon`, `SwapIcon`, `SoundOnIcon`,
  `SoundOffIcon`, `BoltIcon`, `BulbIcon`, `WarnIcon`. Иконки рисуются вручную
  (простая геометрия, без внешних зависимостей) — новые npm-пакеты иконок не заводим,
  чтобы не тащить рантайм-зависимость.
- `Layout.tsx`: в `navItems` вместо `icon: "🏠"` — `icon: HomeIcon` (компонент).
  `Layout.test.tsx` обновляется (см. 1.2).
- `Dictionary.tsx` (`✏️ 🗑️`), `Add.tsx` (`⇄ ✕`), `Review.tsx` (`🔊 🔇`),
  `OfflineIndicator.tsx` (`⚠️`) — на компоненты из `icons.tsx`.
- `⚡ 💡` в Dictionary (строки статистики) — допустимо оставить текстом: они идут
  вперемешку с числами и читаются как маркеры, а не как иконки UI.

### 1.5 Floating bottom-nav + safe-area

- `Layout.tsx`: инлайн-стили `bottom-nav` (7 свойств) вынести в класс `.bottom-nav`
  в `index.css`; добавить `bottom: calc(0.75rem + env(safe-area-inset-bottom))`,
  `left/right: 0.75rem`, `border-radius: var(--lex-radius-pill)`,
  `background: color-mix(in srgb, var(--pico-card-background-color) 88%, transparent)`,
  `backdrop-filter: blur(12px)`, `box-shadow: var(--lex-shadow-2)`.
- Активный пункт — pill-подсветка за иконкой (фон `color-mix(primary 14%, transparent)`),
  а не только смена цвета текста.
- `main { padding-bottom }` увеличить с `4rem` до `calc(5.5rem + env(safe-area-inset-bottom))`.
- `prefers-reduced-motion`: transition на сдвиг активной пилюли — только в
  `no-preference`.

### 1.6 Покосопутные исправления (мелкие, в рамках Фазы 1)

- `client/src/components/OfflineIndicator.tsx`: текст «⚠️ Offline — translation
  requires internet connection» захардкожен по-английски мимо `t()` — нарушает
  соглашение проекта о i18n. Новый ключ `offline.banner` в `ru.json` и `en.json`.
- `client/index.html`: `user-scalable=0` запрещает pinch-zoom (доступность, и это
  же требование части магазинов). Заменить на `viewport-fit=cover` без запрета масштаба.
  **Требует подтверждения пользователя** — трогает поведение на телефоне.
- `theme-color` в `index.html` = `#1095c1` не совпадает с акцентами скинов.
  Правка: в `applyTheme()` (`client/src/services/theme.ts`) обновлять
  `<meta name="theme-color">` из `--pico-primary-background`; плюс статус-бар
  Capacitor в `main.tsx` (`#1095C1`) — синхронизировать. **Требует подтверждения**
  (тронет нативный статус-бар Android).

### 1.7 Проверка Фазы 1

- `cd client && npm run lint && npm run test && npm run build`.
- `npm run test:coverage` — покрыть новые `icons.tsx` не нужно (чистая геометрия),
  но обновить затронутые `Layout.test.tsx`, `Review.test.tsx`, `Dictionary.test.tsx`,
  `OfflineIndicator.test.tsx`.
- Офлайн-проверка: build → `npx serve client/dist` → DevTools offline → страница
  открывается, шрифт из precache (не системный fallback).
- Визуально: 6 скинов × light/dark × (Home, Add, Review, Dictionary, Settings)
  на 375px и 1280px; отдельный чек — Tauri-окно (desktop-навигация) и Android
  (safe-area на устройстве с вырезом).

### 1.8 Документация и semver (Фаза 1)

- `KODA.md`: пункт про `styles/tokens.css` + `styles/components.css`, правило
  «inline-стили только для рантайм-значений», список классов `.lex-*`, шрифт
  Manrope + требование precache, правило «иконки — SVG с `currentColor`, эмодзи
  запрещены», обновление «Текущая версия» и структуры (`src/styles/`, `icons.tsx`).
- `README.md`: Technologies → добавить self-hosted шрифт; «Pico CSS for styling» →
  «Pico CSS + Lex design tokens and `.lex-*` component classes».
- Навык `docs-update` в конце.
- semver: **minor** 1.27.1 → **1.28.0**, versionCode 72 → **73** (новый шрифт,
  иконки, классы — видимое изменение продукта без ломающих API). 4 файла + `uv lock`.
- Ветка: `ui-modernization` (или `ui-modernization-1`, если Фазу 0 коммитим отдельно).

## Порядок работы и коммиты

1. Фаза 0 целиком → самопроверка → docs+semver → коммит
   `style(client): modern radius and shadow tokens, complete skin palettes`
   (`Bump version: 1.27.0 → 1.27.1 (patch)`).
2. Фаза 1 подсекциями: 1.1+1.2 (классы) → 1.3 (шрифт) → 1.4 (иконки) →
   1.5 (bottom-nav) → 1.6 (по согласованию) → 1.8 (docs+semver). Итого 3–5 коммитов,
   каждый с зелёными lint/test/build.
3. Перед каждым коммитом — навык `semver-checker`; перед финальным — `docs-update`.

## Риски и как их снимаем

| Риск | Снятие |
|---|---|
| Pill-кнопки сломают компактные кнопки (`⇄`, `✕`, `🔊`) | они помечены `.outline`/получают `.lex-icon-btn` с `--lex-radius-sm`; pill только у основных CTA |
| Серые полосы в скинах появятся в новом месте | шаг 0.3 покрывает `card-sectioning` во всех 12 блоках; проверка — grep, что ни один блок не пропущен |
| Шрифт сломает офлайн-PWA | precache woff2 + офлайн-проверка из 1.7 |
| Cyrillic отсутствует в выбранном шрифте | Manrope/Plus Jakarta Sans оба имеют cyrillic; проверяем `ru.json`-локаль на dev-сервере |
| `Layout.test.tsx` падает после замены эмодзи на SVG | тест обновляется в том же коммите, что и иконки; `aria-label` на кнопках навигации |
| `backdrop-filter` не поддерживается в старых WebView (Capacitor) | graceful: цвет фона задан и без blur, `@supports not (backdrop-filter: blur(1px))` → непрозрачный фон |
| Смена `theme-color`/статус-бара Android | вынесено в 1.6 как отдельный, подтверждаемый пользователем шаг |

## Открытые вопросы — ЗАКРЫТЫ (см. «Принятые решения пользователя» выше)

1. Шрифт: Manrope (нейтральный geometric) или Plus Jakarta Sans (чуть более «округлый»)?
2. Pill у основных кнопок — ок, или держим скругление 12px (мягче, но не «капсула»)?
3. Разрешаем ли убрать запрет pinch-zoom (`user-scalable=0`) и синхронизировать
   `theme-color`/статус-бар со скином (шаг 1.6)?
4. Коммитим Фазу 0 отдельным релизом 1.27.1 или идём одним minor 1.28.0?
