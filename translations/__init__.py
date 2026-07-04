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


# Mapping of language codes to native names (language name written in its own language)
NATIVE_NAMES = {
    "en": "English",
    "es": "Español",
    "fr": "Français",
    "de": "Deutsch",
    "it": "Italiano",
    "pt": "Português",
    "ru": "Русский",
    "zh": "中文",
    "ja": "日本語",
    "ko": "한국어",
    "ar": "العربية",
    "hi": "हिन्दी",
    "tr": "Türkçe",
    "pl": "Polski",
    "nl": "Nederlands",
    "uk": "Українська",
    "sv": "Svenska",
    "cs": "Čeština",
    "el": "Ελληνικά",
    "hu": "Magyar",
    "fi": "Suomi",
    "no": "Norsk",
    "da": "Dansk",
    "ro": "Română",
    "th": "ไทย",
    "vi": "Tiếng Việt",
    "id": "Bahasa Indonesia",
    "he": "עברית",
    "bg": "Български",
    "ca": "Català",
    "hr": "Hrvatski",
    "sk": "Slovenčina",
    "sl": "Slovenščina",
    "sr": "Српски",
    "ms": "Bahasa Melayu",
    "tl": "Filipino",
    "af": "Afrikaans",
    "sq": "Shqip",
    "am": "አማርኛ",
    "az": "Azərbaycan",
    "be": "Беларуская",
    "bn": "বাংলা",
    "bs": "Bosanski",
    "cy": "Cymraeg",
    "et": "Eesti",
    "fa": "فارسی",
    "ga": "Gaeilge",
    "gl": "Galego",
    "gu": "ગુજરાતી",
    "ha": "Hausa",
    "hy": "Հայերեն",
    "is": "Íslenska",
    "jw": "Basa Jawa",
    "jv": "Basa Jawa",
    "ka": "ქართული",
    "kk": "Қазақша",
    "km": "ខ្មែរ",
    "kn": "ಕನ್ನಡ",
    "ky": "Кыргызча",
    "lo": "ລາວ",
    "la": "Latina",
    "lt": "Lietuvių",
    "lv": "Latviešu",
    "mk": "Македонски",
    "ml": "മലയാളം",
    "mn": "Монгол",
    "mr": "मराठी",
    "mt": "Malti",
    "my": "မြန်မာ",
    "ne": "नेपाली",
    "ps": "پښتو",
    "pa": "ਪੰਜਾਬੀ",
    "si": "සිංහල",
    "so": "Soomaali",
    "sw": "Kiswahili",
    "ta": "தமிழ்",
    "te": "తెలుగు",
    "tg": "Тоҷикӣ",
    "tk": "Türkmençe",
    "tlh": "tlhIngan Hol",
    "to": "lea fakatonga",
    "tt": "Татарча",
    "ur": "اردو",
    "uz": "Oʻzbekcha",
    "xh": "isiXhosa",
    "yi": "ייִדיש",
    "zu": "isiZulu",
    "ba": "Башҡортса",
    "ce": "Доьллат",
    "cv": "Чӑвашла",
    "bua": "Буряад хэлэн",
    "ceb": "Bisayâ",
    "eu": "euskara",
    "mg": "Malagasy",
    "pap": "Papiamentu",
    "su": "basa Sunda",
    "emj": "Emoji",
    "lb": "Lëtzebuergesch",
    "mi": "reo Māori",
    "ht": "Kreyòl ayisyen",
    "eo": "Esperanto",
    "kv": "Коми кыв",
    "ab": "Аԥсуа бызшәа",
    "abq": "Абаза бызшва",
    "gd": "Gàidhlig",
    "kazlat": "Қазақша",
    "kbd": "Адыгэбзэ",
    "kjh": "Хакас тілі",
    "krc": "Къарачай-малкъар тил",
    "mdf": "Мокшень кяль",
    "mhr": "Олык марий",
    "mns": "Ма̄ньщи ла̄тыӈ",
    "mrj": "Кырык мары",
    "myv": "Эрзянь кель",
    "nog": "Ногай тили",
    "os": "Ирон",
    "pt-BR": "Português",
    "sah": "Саха тыла",
    "sr-Latn": "srpskohrvatski",
    "tyv": "Тыва дыл",
    "udm": "Удмурт кыл",
    "uzbcyr": "Ўзбекча",
}


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
    "eo": "Эсперанто",
    "et": "Эстонский",
    "ht": "Гаитянский креольский",
    "fi": "Финский",
    "kv": "Коми",
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
    "bua": "Бурятский",
    "ceb": "Себуанский",
    "eu": "Баскский",
    "gl": "Галисийский",
    "mg": "Малагасийский",
    "pap": "Папьяменто",
    "xh": "Коса",
    "tl": "Филиппинский",
    "su": "Сунданский",
    "emj": "Эмоджи",
    "lb": "Люксембургский",
    "mi": "Маори",
    "tt": "Татарский",
    "yi": "Идиш",
    "ab": "Абхазский",
    "abq": "Абазинский",
    "gd": "Шотландский гэльский",
    "kazlat": "Казахский (латиница)",
    "kbd": "Кабардинский",
    "kjh": "Хакасский",
    "krc": "Карачаево-балкарский",
    "mdf": "Мокшанский",
    "mhr": "Луговомарийский",
    "mns": "Мансийский",
    "mrj": "Горномарийский",
    "myv": "Эрзянский",
    "nog": "Ногайский",
    "os": "Осетинский",
    "pt-BR": "Португальский (Бразилия)",
    "sah": "Якутский",
    "sr-Latn": "Сербскохорватский (латиница)",
    "tyv": "Тувинский",
    "udm": "Удмуртский",
    "uzbcyr": "Узбекский (кириллица)",
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

# Mapping of language codes to English names
LANGUAGE_NAMES_EN = {
    "af": "Afrikaans",
    "sq": "Albanian",
    "am": "Amharic",
    "ar": "Arabic",
    "hy": "Armenian",
    "az": "Azerbaijani",
    "ba": "Bashkir",
    "bua": "Buryat",
    "be": "Belarusian",
    "bn": "Bengali",
    "bs": "Bosnian",
    "bg": "Bulgarian",
    "ca": "Catalan",
    "ceb": "Cebuano",
    "zh": "Chinese",
    "hr": "Croatian",
    "cs": "Czech",
    "da": "Danish",
    "nl": "Dutch",
    "en": "English",
    "eo": "Esperanto",
    "et": "Estonian",
    "ht": "Haitian Creole",
    "kv": "Komi",
    "fi": "Finnish",
    "fr": "French",
    "ka": "Georgian",
    "de": "German",
    "el": "Greek",
    "gu": "Gujarati",
    "ha": "Hausa",
    "he": "Hebrew",
    "hi": "Hindi",
    "hu": "Hungarian",
    "is": "Icelandic",
    "id": "Indonesian",
    "ga": "Irish",
    "it": "Italian",
    "ja": "Japanese",
    "jv": "Javanese",
    "kn": "Kannada",
    "kk": "Kazakh",
    "km": "Khmer",
    "tlh": "Klingon",
    "ko": "Korean",
    "ky": "Kyrgyz",
    "lo": "Lao",
    "la": "Latin",
    "lt": "Lithuanian",
    "lv": "Latvian",
    "ms": "Malay",
    "mt": "Maltese",
    "mk": "Macedonian",
    "mr": "Marathi",
    "my": "Myanmar",
    "mn": "Mongolian",
    "ne": "Nepali",
    "no": "Norwegian",
    "fa": "Persian",
    "pl": "Polish",
    "pt": "Portuguese",
    "pa": "Punjabi",
    "ro": "Romanian",
    "ru": "Russian",
    "sr": "Serbian",
    "si": "Sinhala",
    "sk": "Slovak",
    "sl": "Slovenian",
    "so": "Somali",
    "es": "Spanish",
    "sw": "Swahili",
    "sv": "Swedish",
    "tg": "Tajik",
    "ta": "Tamil",
    "te": "Telugu",
    "th": "Thai",
    "to": "Tongan",
    "tr": "Turkish",
    "tk": "Turkmen",
    "uk": "Ukrainian",
    "ur": "Urdu",
    "uz": "Uzbek",
    "vi": "Vietnamese",
    "cy": "Welsh",
    "zu": "Zulu",
    "ce": "Chechen",
    "cv": "Chuvash",
    "eu": "Basque",
    "gl": "Galician",
    "mg": "Malagasy",
    "pap": "Papiamento",
    "xh": "Xhosa",
    "tl": "Filipino",
    "su": "Sundanese",
    "emj": "Emoji",
    "lb": "Luxembourgish",
    "mi": "Maori",
    "tt": "Tatar",
    "yi": "Yiddish",
    "ab": "Abkhaz",
    "abq": "Abaza",
    "gd": "Scottish Gaelic",
    "kazlat": "Kazakh (Latin)",
    "kbd": "Kabardian",
    "kjh": "Khakas",
    "krc": "Karachay-Balkar",
    "mdf": "Moksha",
    "mhr": "Eastern Mari",
    "mns": "Mansi",
    "mrj": "Western Mari",
    "myv": "Erzya",
    "nog": "Nogai",
    "os": "Ossetian",
    "pt-BR": "Portuguese (Brazil)",
    "sah": "Yakut",
    "sr-Latn": "Serbo-Croatian (Latin)",
    "tyv": "Tuvan",
    "udm": "Udmurt",
    "uzbcyr": "Uzbek (Cyrillic)",
}


def get_language_name(code: str) -> str:
    """Return a human-readable language name for a code in the current locale.
    
    Uses static dictionaries as the primary source, Yandex API names as fallback.
    Also appends the native name of the language in its own language,
    e.g. "English (English, en)" or "Английский (English, en)".
    
    Args:
        code: ISO language code (e.g. 'en', 'ce', 'ru').
        
    Returns:
        Human-readable language name in the current locale with native name.
    """
    locale = _current_locale.get("en", "en")
    
    # Use static English dictionary as the primary source
    en_name = LANGUAGE_NAMES_EN.get(code)
    
    # Fall back to Yandex API name if not in static dict
    if not en_name:
        api_names = _get_api_language_names()
        en_name = api_names.get(code)
    
    # Fall back to code itself
    if not en_name:
        en_name = code
    
    # Resolve Russian name from static dict using the code
    if locale == "ru":
        ru_name = LANGUAGE_NAMES_RU.get(code, en_name)
    else:
        ru_name = en_name  # Show English name for non-Russian locales
    
    # Get native name (language name written in its own language)
    native = NATIVE_NAMES.get(code, en_name)
    
    if locale == "ru":
        return f"{ru_name} ({native}, {code})"
    
    return f"{en_name} ({native}, {code})"
