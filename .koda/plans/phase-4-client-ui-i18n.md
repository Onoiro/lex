# Phase 4: Client-side UI & i18n — План

## Контекст
- 5 экранов: Home, Add, Review, Dictionary, Settings
- i18n: en.json + ru.json (80+ ключей), languages.py (LANGUAGE_NAMES_EN/RU, NATIVE_NAMES, get_language_name)
- Валидация: портирование validators.py на TypeScript
- Review — самый сложный экран: таймер, авто-ответ, пауза, prefetch
- Proxy: POST /translate, GET /languages (из Phase 1)
- Data layer: wordRepository, settingsRepository (из Phase 2)
- Domain: srs.ts, stats.ts (из Phase 3)

## Шаги

1. [x] **Port i18n system to TypeScript (i18n module)**
   - Загрузка en.json/ru.json как TypeScript-импортов
   - t(key, params?) — функция перевода с интерполяцией {param}
   - useLocale() — хук для текущей локали (из settings)
   - SUPPORTED_LOCALES = ["en", "ru"]
   - Файлы:
     - client/src/i18n/index.ts
     - client/src/i18n/en.json
     - client/src/i18n/ru.json

2. [x] **Port language metadata and validators**
   - LANGUAGE_NAMES_EN, LANGUAGE_NAMES_RU, NATIVE_NAMES — из languages.py
   - getLanguageName(code, locale) — формат "Name (Native, code)"
   - validateWord(word), validateTranslation(translation) — из validators.py
   - MAX_WORD_LENGTH, MAX_TRANSLATION_LENGTH
   - Файлы:
     - client/src/i18n/languages.ts
     - client/src/domain/validators.ts

3. [x] **Create API client for translate proxy**
   - translateWord(word, sourceLang, targetLang) → {translation, detectedLanguage}
   - getLanguages() → [{code, name}]
   - Configurable base URL (env var VITE_PROXY_URL)
   - Файлы:
     - client/src/services/translateApi.ts

4. [x] **Implement Layout with i18n navigation**
   - Обновить Layout: nav-метки через t(), footer через t() с версией
   - useLocale() для переключения языка интерфейса
   - Файлы:
     - client/src/components/Layout.tsx

5. [x] **Implement Home page**
   - Dashboard с 2 карточками (Translate, Review), портирование index.html
   - Все тексты через t()
   - Файлы:
     - client/src/pages/Home.tsx

6. [x] **Implement Add page**
   - Форма: word textarea, translate button (→ proxy), translation textarea, save button
   - Валидация ввода, проверка дубликата, success/error сообщения
   - Auto-resize textarea, detected language display
   - Чтение source/target lang из settings
   - Файлы:
     - client/src/pages/Add.tsx

7. [x] **Implement Dictionary page**
   - Таблица: word, translation, known/no, time (best/avg), interval, %, delete
   - Поиск, подтверждение удаления
   - Пустое состояние
   - Файлы:
     - client/src/pages/Dictionary.tsx

8. [x] **Implement Settings page**
   - Селекторы: app language, source lang, target lang
   - Сохранение через settingsRepository
   - Предупреждение при совпадении source/target
   - Загрузка языков из proxy /languages
   - Файлы:
     - client/src/pages/Settings.tsx

9. [x] **Implement Review page**
   - Стартовый экран → тренировка → пауза
   - Таймер (0→5s orange→10s red→auto-answer)
   - Кнопки "Know"/"Forgot", показ перевода, next word
   - Авто-ответ через 10s, пауза после 3 подряд авто или 30s бездействия
   - SRS: applyReviewResult + updateResponseTime → updateWord
   - Prefetch следующего слова
   - Статистика: best/avg time, know/forgot count, %
   - Файлы:
     - client/src/pages/Review.tsx

10. [x] **Add tests for i18n, validators, and key UI components**
    - i18n: t() interpolation, fallback to key
    - validators: valid/invalid words, length limits
    - Layout: nav links localized
    - Файлы:
      - client/src/i18n/index.test.ts
      - client/src/domain/validators.test.ts
      - client/src/test/Layout.test.tsx (update)

11. [x] **Verify: build, lint, test all pass**
    - npx tsc --noEmit
    - npx vite build
    - npx eslint .
    - npx vitest run
