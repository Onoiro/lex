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


# Mapping of language codes to Russian names
LANGUAGE_NAMES_RU = {
    "af": "Африкаанс",
    "sq": "Албанский",
    "am": "Амхарский",
    "ar": "Арабский",
    "hy": "Армянский",
    "az": "Азербайджанский",
    "ba": "Башкирский",
    "be": "Белорусский",
    "bn": "Бенгальский",
    "bs": "Боснийский",
    "bg": "Болгарский",
    "ca": "Каталанский",
    "zh": "Китайский",
    "hr": "Хорватский",
    "cs": "Чешский",
    "da": "Датский",
    "nl": "Нидерландский",
    "en": "Английский",
    "et": "Эстонский",
    "fi": "Финский",
    "fr": "Французский",
    "ka": "Грузинский",
    "de": "Немецкий",
    "el": "Греческий",
    "gu": "Гуджарати",
    "ha": "Хауса",
    "he": "Иврит",
    "hi": "Хинди",
    "hu": "Венгерский",
    "is": "Исландский",
    "id": "Индонезийский",
    "ga": "Ирландский",
    "it": "Итальянский",
    "ja": "Японский",
    "jv": "Яванский",
    "kn": "Каннада",
    "kk": "Казахский",
    "km": "Кхмерский",
    "tlh": "Клингонский",
    "ko": "Корейский",
    "ky": "Киргизский",
    "lo": "Лаосский",
    "la": "Латинский",
    "lv": "Латышский",
    "ms": "Малайский",
    "mt": "Мальтийский",
    "mk": "Македонский",
    "mr": "Маратхи",
    "my": "Мьянма",
    "mn": "Монгольский",
    "ne": "Непальский",
    "no": "Норвежский",
    "fa": "Персидский",
    "pl": "Польский",
    "pt": "Португальский",
    "pa": "Панджаби",
    "ro": "Румынский",
    "ru": "Русский",
    "sr": "Сербский",
    "si": "Сингальский",
    "sk": "Словацкий",
    "sl": "Словенский",
    "so": "Сомалийский",
    "es": "Испанский",
    "sw": "Суахили",
    "sv": "Шведский",
    "tg": "Таджикский",
    "ta": "Тамильский",
    "te": "Телугу",
    "th": "Тайский",
    "to": "Тонганский",
    "tr": "Турецкий",
    "tk": "Туркменский",
    "uk": "Украинский",
    "ur": "Урду",
    "uz": "Узбекский",
    "vi": "Вьетнамский",
    "cy": "Валлийский",
    "zu": "Зулу",
    "ce": "Чеченский",
    "cv": "Чувашский",
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
    
    Uses a direct code-to-name mapping for the current UI locale.
    Falls back to the code itself if unknown.
    
    Args:
        code: ISO language code (e.g. 'en', 'ce', 'ru').
        
    Returns:
        Human-readable language name in the current locale.
    """
    locale = _current_locale.get("en", "en")
    
    if locale == "ru":
        return LANGUAGE_NAMES_RU.get(code, code)
    
    # Default: return the code
    return code
