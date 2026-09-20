# Промпты для генерации маскота Lex (попугай в очках)

Файл для хранения промптов для нейросетей генерации изображений.
После утверждения базового образа сюда добавляются промпты для эмоций.

> **Важно:** в финальных утверждённых ассетах (`design/mascot/`) наушники —
> **чёрные**. Упоминания красных/белых наушников ниже — история ранних
> вариантов промптов, финальные промпты эмоций используют чёрные.

## Workflow

1. Сгенерировать базовый образ (промпт ниже), 4–8 вариантов.
2. Утвердить лучший вариант (эталон).
3. Промпты для эмоций — с референсом утверждённого образа (img2img / character reference / seed).
4. Нарезать, оптимизировать (WebP/SVG), интегрировать в приложение.

---

## Базовый образ (эталон)

```
Character design of a cute cartoon parrot mascot for a language learning
app. Flat vector illustration style, clean rounded shapes, soft shading.
Small friendly parrot with big expressive eyes, chubby round body,
short stubby wings, standing pose. The parrot wears BIG round smart
glasses (oversized round eyeglasses with thick dark frames) that make
him look clever and bookish. Color palette: teal and green feathers
with orange beak and yellow accents, glasses frames in dark teal.
Simple modern mascot design suitable for a mobile app, similar style
to Duolingo owl but a parrot. Friendly confident pose, slight smile,
looking at the viewer. Full body, centered composition. Isolated on
plain white background, no text, no watermark.
```

### Советы по генерации

- **Midjourney:** добавить `--no text, watermark --style raw --v 6` (или актуальную версию).
- **DALL-E / GPT-4o:** промпт использовать как есть, попросить 4 варианта.
- **Stable Diffusion / Flux:** добавить негативный промпт: `text, watermark, realistic, photo, 3d render, blurry, extra wings, human`.
- Сгенерировать минимум 4–8 вариантов и выбрать эталон. Сохранить seed/референс выбранного варианта — он нужен для консистентности эмоций.

### Ключевые фиксируемые признаки эталона

- Очки: большие, круглые, тёмная оправа (делают «умнее», узнаваемый силуэт).
- Палитра: бирюзово-зелёное оперение, оранжевый клюв, жёлтые акценты.
- Стиль: flat vector, округлые формы, мягкие тени.
- Пропорции: маленький пухлый попугай, короткие крылья.

---

## Базовый образ — вариант 2 (жёлтый + голубой, наушники, минимализм)

```
Character design of a cute cartoon parrot mascot for a language learning
app. Small friendly parrot with big expressive eyes behind BIG round
smart glasses (oversized round eyeglasses with thick dark frames) that
make him look clever and bookish. Red wireless headphones hanging
around his neck (resting on his chest, not on his head). Chubby round
body, short stubby wings, standing pose, slight smile, looking at the
viewer. Color palette: two main colors — bright sunny yellow and sky
blue feathers (yellow head and chest, sky blue wings and belly), with
red and green details (red beak, green tail). Simple modern mascot
design suitable for a mobile app. Full body, centered composition.
Minimalist flat vector illustration, clean bold lines, solid vibrant
colors, no gradients, no 3D effects, pure white background, no text,
no watermark.
```

### Отличия от варианта 1

- **Палитра:** два основных цвета — яркий жёлтый и голубой (жёлтые голова/грудь, голубые крылья/живот), детали — красный (клюв, наушники) и зелёный (хвост).
- **Наушники:** красные беспроводные, висят на шее (отсылка к TTS/озвучке).
- **Стиль:** минимализм — чистые жирные контуры, сплошные яркие цвета, без градиентов и 3D-эффектов (указано один раз, в конце промпта).

### Ключевые фиксируемые признаки эталона (вариант 2)

- Очки: большие, круглые, тёмная оправа.
- Наушники: красные, беспроводные, на шее.
- Палитра: жёлтый + голубой (основные), красный + зелёный (детали).
- Стиль: minimalist flat vector, bold lines, solid colors, no gradients, no 3D.
- Пропорции: маленький пухлый попугай, короткие крылья.

---

## Базовый образ — вариант 3 (максимальный минимализм)

Короткий промпт намеренно: чем меньше слов, тем проще и чище результат.

```
Minimalist 2D flat mascot logo of a cute parrot. Very simple design,
few shapes, clean thin lines, no details, no gradients, no shading.
The parrot wears BIG round glasses with BLACK frames and BLACK
wireless headphones around its neck. Two colors only: yellow body
and light blue wings. Small orange beak. Friendly, simple, iconic.
Centered, full body, pure white background, no text.
```

### Отличия от варианта 2

- Промпт короткий — меньше слов = меньше «перегруза» у генератора, персонаж проще.
- Очки: чёрная оправа (жёстко зафиксировано).
- Наушники: чёрные, на шее.
- Цвета: только жёлтый корпус + голубые крылья, клюв оранжевый.
- Добавлено: `few shapes`, `no details`, `no shading`, `iconic` — усиливает минимализм.

### Если всё ещё сложно — укороченная версия

```
Super simple flat 2D parrot mascot icon. Big round black glasses,
black headphones around neck. Yellow body, light blue wings, orange
beak. Minimal shapes, clean lines, no gradients, no shading.
Pure white background, no text.
```

---

## Эмоции

Генерировать строго с референсом утверждённого базового образа
(`design/mascot/base.jpg`): img2img / character reference / тот же seed.
Менять только позу и выражение — цвета, очки, наушники и стиль не менять.

### Общий каркас промпта

База (повторять во всех промптах дословно):

```
Same minimalist 2D flat parrot mascot as the reference image: yellow
body, light blue wings, big round BLACK glasses, BLACK wireless
headphones around neck, orange beak. Few shapes, clean lines, no
gradients, no shading. Centered, full body, pure white background,
no text.
```

К базе ниже дописывается одна строка эмоции.

### Промпты по состояниям

**idle — приветствие (экран ожидания):**
```
...waving one wing hello, calm friendly smile, relaxed pose.
```

**happy — «знаю!» (верный ответ):**
```
...happy excited expression, eyes closed in a smile, both wings raised up, tiny jump.
```

**sad — «не помню» (неверный ответ):**
```
...sad drooping expression, head tilted down, wings hanging low, small tear.
```

**hint — подсказка:**
```
...one wing raised with a finger pointing up, knowing smile, one eyebrow raised.
```

**thinking — долго думает:**
```
...thinking pose, wing on chin, eyes looking up to the side, small question mark above head.
```

**sleeping — оффлайн / нет соединения:**
```
...sleeping, eyes closed, lying down, small "z z z" above head.
```

**tired — лимит исчерпан:**
```
...exhausted, slumped posture, half-closed eyes under glasses, sweat drop, headphones slipping.
```

**celebrate — streak / серия:**
```
...celebrating, both wings up, big open smile, tiny confetti dots around, energetic pose.
```

**empty — пустой словарь:**
```
...curious welcoming pose, both wings open wide as if presenting, gentle smile.
```

### Чек-лист консистентности эмоций

- [ ] Очки: большие, круглые, ЧЁРНАЯ оправа — без изменений.
- [ ] Наушники: ЧЁРНЫЕ, на шее — не на голове.
- [ ] Цвета: жёлтый корпус, голубые крылья, оранжевый клюв.
- [ ] Стиль: 2D flat, мало форм, без градиентов и теней.
- [ ] Фон: чистый белый; при вырезке — прозрачный PNG.
- [ ] Размер: генерировать ≥1024px, в UI — 512px.
