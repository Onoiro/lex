"""Internationalization (i18n) support for the Lex application.

Loads translation JSON files and provides a _t() filter for Jinja2 templates.
Default locale is English. Supported locales: en, ru.
"""

import json
from pathlib import Path

TRANSLATIONS_DIR = Path(__file__).parent
SUPPORTED_LOCALES = ["en", "ru"]

# Cache loaded translations: {"en": {...}, "ru": {...}}
_TRANSLATIONS_CACHE: dict[str, dict] = {}


def _load_translations(locale: str) -> dict:
    """Load translation file for the given locale.
    
    Args:
        locale: Locale code (e.g. 'en', 'ru').
        
    Returns:
        Dictionary of translation key-value pairs.
    """
    if locale in _TRANSLATIONS_CACHE:
        return _TRANSLATIONS_CACHE[locale]
    
    path = TRANSLATIONS_DIR / f"{locale}.json"
    if path.exists():
        with open(path, "r", encoding="utf-8") as f:
            _TRANSLATIONS_CACHE[locale] = json.load(f)
    else:
        _TRANSLATIONS_CACHE[locale] = {}
    
    return _TRANSLATIONS_CACHE[locale]


def _t(key: str, **kwargs) -> str:
    """Translate a key to the current locale.
    
    Falls back to English, then to the key itself if not found.
    Supports simple string formatting with **kwargs.
    
    Args:
        key: Translation key (e.g. 'nav.translate').
        **kwargs: Values for string interpolation.
        
    Returns:
        Translated string.
    """
    # Get current locale from Flask/Jinja context if available
    locale = _get_locale()
    
    # Try current locale first
    translations = _load_translations(locale)
    value = translations.get(key)
    
    # Fallback to English
    if value is None:
        en_translations = _load_translations("en")
        value = en_translations.get(key)
    
    # Fallback to key itself
    if value is None:
        return key
    
    # Apply string formatting if kwargs provided
    if kwargs:
        try:
            value = value.format(**kwargs)
        except (KeyError, IndexError, ValueError):
            pass  # Return raw value if formatting fails
    
    return value


def get_locale() -> str:
    """Get the current user locale.
    
    Checks the 'locale' cookie, falls back to 'en'.
    
    Returns:
        Locale code string.
    """
    # This will be set by the request middleware
    return _current_locale.get("en", "en")


def _get_locale() -> str:
    """Internal locale getter. Used by _t()."""
    return _current_locale.get("en", "en")


def set_locale(locale: str) -> None:
    """Set the current locale for the request context.
    
    Args:
        locale: Locale code (e.g. 'en', 'ru').
    """
    if locale not in SUPPORTED_LOCALES:
        locale = "en"
    _current_locale["en"] = locale


# Simple context storage (will be replaced with request-scoped storage)
_current_locale: dict = {"en": "en"}


# Mapping of English language names (from Yandex API) to Russian
LANGUAGE_NAMES_RU = {
    "Afrikaans": "Африкаанс",
    "Albanian": "Албанский",
    "Amharic": "Амхарский",
    "Arabic": "Арабский",
    "Armenian": "Армянский",
    "Azerbaijani": "Азербайджанский",
    "Belarusian": "Белорусский",
    "Bengali": "Бенгальский",
    "Bosnian": "Боснийский",
    "Bulgarian": "Болгарский",
    "Catalan": "Каталанский",
    "Chinese": "Китайский",
    "Croatian": "Хорватский",
    "Czech": "Чешский",
    "Danish": "Датский",
    "Dutch": "Нидерландский",
    "English": "Английский",
    "Estonian": "Эстонский",
    "Finnish": "Финский",
    "French": "Французский",
    "Georgian": "Грузинский",
    "German": "Немецкий",
    "Greek": "Греческий",
    "Gujarati": "Гуджарати",
    "Hausa": "Хауса",
    "Hebrew": "Иврит",
    "Hindi": "Хинди",
    "Hungarian": "Венгерский",
    "Icelandic": "Исландский",
    "Indonesian": "Индонезийский",
    "Irish": "Ирландский",
    "Italian": "Итальянский",
    "Japanese": "Японский",
    "Javanese": "Яванский",
    "Kannada": "Каннада",
    "Kazakh": "Казахский",
    "Khmer": "Кхмерский",
    "Klingon": "Клингонский",
    "Korean": "Корейский",
    "Kyrgyz": "Киргизский",
    "Lao": "Лаосский",
    "Latin": "Латинский",
    "Latvian": "Латышский",
    "Malay": "Малайский",
    "Maltese": "Мальтийский",
    "Macedonian": "Македонский",
    "Marathi": "Маратхи",
    "Myanmar": "Мьянма",
    "Nepali": "Непальский",
    "Norwegian": "Норвежский",
    "Pashto": "Пушту",
    "Persian": "Персидский",
    "Polish": "Польский",
    "Portuguese": "Португальский",
    "Punjabi": "Панджаби",
    "Romanian": "Румынский",
    "Russian": "Русский",
    "Serbian": "Сербский",
    "Sinhala": "Сингальский",
    "Slovak": "Словацкий",
    "Slovenian": "Словенский",
    "Somali": "Сомалийский",
    "Spanish": "Испанский",
    "Swahili": "Суахили",
    "Swedish": "Шведский",
    "Tajik": "Таджикский",
    "Tamil": "Тамильский",
    "Telugu": "Телугу",
    "Thai": "Тайский",
    "Tongan": "Тонганский",
    "Turkish": "Турецкий",
    "Turkmen": "Туркменский",
    "Ukrainian": "Украинский",
    "Urdu": "Урду",
    "Uzbek": "Узбекский",
    "Vietnamese": "Вьетнамский",
    "Welsh": "Валлийский",
    "Zulu": "Зулу",
    # Add more as needed from Yandex API response
}


def _get_language_name(code: str, locale: str = "ru") -> str:
    """Return a human-readable language name for a code.
    
    Uses Yandex API names (English) and translates to the target locale.
    Falls back to the code itself if unknown.
    
    Args:
        code: ISO language code (e.g. 'en', 'ce', 'ru').
        locale: Target locale for the name.
        
    Returns:
        Human-readable language name.
    """
    # This will be populated from Yandex API at startup
    api_names = _get_api_language_names()
    
    # Get English name from API
    en_name = api_names.get(code, code)
    
    if locale == "ru":
        return LANGUAGE_NAMES_RU.get(en_name, code)
    
    # Default: return English name
    return en_name


def _get_api_language_names() -> dict:
    """Get language names from Yandex API.
    
    Returns:
        Dict mapping language codes to English names.
    """
    return _api_language_names_cache


# Cache for API language names: {code: "English"}
_api_language_names_cache: dict = {}


def set_api_language_names(names: dict) -> None:
    """Set the API language names cache.
    
    Args:
        names: Dict mapping language codes to English names.
    """
    global _api_language_names_cache
    _api_language_names_cache = names


def get_supported_locales() -> list:
    """Return list of supported locale codes."""
    return SUPPORTED_LOCALES


def get_language_name(code: str) -> str:
    """Return a human-readable language name for a code in the current locale.
    
    Uses Yandex API names (English) and translates to the current UI locale.
    Falls back to the code itself if unknown.
    
    Args:
        code: ISO language code (e.g. 'en', 'ce', 'ru').
        
    Returns:
        Human-readable language name in the current locale.
    """
    # Get English name from API cache
    en_name = _api_language_names_cache.get(code, code)
    
    # Get current locale from global context
    locale = _current_locale.get("en", "en")
    
    if locale == "ru":
        return LANGUAGE_NAMES_RU.get(en_name, code)
    
    # Default: return English name
    return en_name
