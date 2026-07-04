from fastapi import FastAPI, Depends, Form, Request, HTTPException
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text, inspect
from sqlalchemy.orm import Session
import jinja2
import random
import time
from dotenv import load_dotenv

from database import engine, get_db
from models import Base, Word
from translator import translate_word
from validators import validate_word, validate_translation
from rate_limiter import rate_limit, add_rate_limiter, translate_rate_limiter
from auth import require_auth
from csrf import csrf_protect_form, csrf_protection
from translator import get_supported_languages, get_api_language_names, SUPPORTED_LANGUAGES
from translations import _t, set_locale, set_api_language_names, SUPPORTED_LOCALES, get_language_name

# Загрузка переменных окружения из .env
load_dotenv()

# Версия проекта из pyproject.toml
def get_version():
    try:
        import tomllib
    except ImportError:
        import tomli as tomllib
    with open("pyproject.toml", "rb") as f:
        return tomllib.load(f)["project"]["version"]

VERSION = get_version()

# Default language settings
DEFAULT_SOURCE_LANG = "auto"
DEFAULT_TARGET_LANG = "ru"
DEFAULT_LOCALE = "en"

app = FastAPI()

# Статические файлы (favicon, логотип и др.)
app.mount("/static", StaticFiles(directory="static"), name="static")

# Авто-миграция: добавляем недостающие столбцы
def auto_migrate():
    inspector = inspect(engine)
    columns = [col['name'] for col in inspector.get_columns('words')]
    if 'last_direction' not in columns:
        with engine.connect() as conn:
            conn.execute(text("ALTER TABLE words ADD COLUMN last_direction VARCHAR DEFAULT 'en_ru'"))
            conn.commit()
        print("[auto-migrate] Added last_direction column to words table")

    if 'best_time' not in columns:
        with engine.connect() as conn:
            conn.execute(text("ALTER TABLE words ADD COLUMN best_time FLOAT DEFAULT NULL"))
            conn.execute(text("ALTER TABLE words ADD COLUMN avg_time FLOAT DEFAULT NULL"))
            conn.commit()
        print("[auto-migrate] Added best_time and avg_time columns to words table")

    if 'know_count' not in columns:
        with engine.connect() as conn:
            conn.execute(text("ALTER TABLE words ADD COLUMN know_count INTEGER DEFAULT 0"))
            conn.execute(text("ALTER TABLE words ADD COLUMN forgot_count INTEGER DEFAULT 0"))
            conn.commit()
        print("[auto-migrate] Added know_count and forgot_count columns to words table")

Base.metadata.create_all(bind=engine)
auto_migrate()

# Загружаем список поддерживаемых языков Yandex при старте
SUPPORTED_LANGUAGES.update(get_supported_languages())
if SUPPORTED_LANGUAGES:
    print(f"[translator] Loaded {len(SUPPORTED_LANGUAGES)} source languages from Yandex API")
    # Загружаем названия языков для i18n
    api_names = get_api_language_names()
    if api_names:
        set_api_language_names(api_names)
        print(f"[translator] Loaded {len(api_names)} language names from Yandex API")
    else:
        print("[translator] WARNING: Could not load language names from Yandex API")
else:
    print("[translator] WARNING: Could not load supported languages from Yandex API")

# Raw Jinja2 loader — no caching issues
loader = jinja2.FileSystemLoader("templates")
env = jinja2.Environment(loader=loader, autoescape=True)
env.globals["version"] = VERSION
env.globals["_get_language_name"] = get_language_name  # localized language name
env.globals["_t"] = _t  # translation function
env.globals["_locale"] = DEFAULT_LOCALE  # current UI locale

# Default language settings
DEFAULT_SOURCE_LANG = "auto"
DEFAULT_TARGET_LANG = "ru"

# ---------- middleware ----------

@app.middleware("http")
async def set_locale_middleware(request: Request, call_next):
    """Set the current locale from cookie for each request."""
    locale = request.cookies.get("locale", DEFAULT_LOCALE)
    if locale not in SUPPORTED_LOCALES:
        locale = DEFAULT_LOCALE
    set_locale(locale)
    # Update Jinja2 global
    env.globals["_locale"] = locale
    response = await call_next(request)
    return response

# ---------- helpers ----------

def _get_language_codes() -> list[str]:
    """Return a list of language codes for UI selectors.
    
    Uses SUPPORTED_LANGUAGES from Yandex API if available,
    otherwise falls back to hardcoded LANGUAGE_NAMES.
    Always includes 'auto' as the first option.
    """
    from translator import LANGUAGE_NAMES
    codes = ["auto"]
    if SUPPORTED_LANGUAGES:
        codes.extend(sorted(SUPPORTED_LANGUAGES.keys()))
    else:
        codes.extend(sorted(LANGUAGE_NAMES.keys()))
    return codes


def _get_source_lang(request: Request) -> str:
    """Get source language from cookie, fallback to default."""
    return request.cookies.get("source_lang", DEFAULT_SOURCE_LANG)


def _get_target_lang(request: Request) -> str:
    """Get target language from cookie, fallback to default."""
    return request.cookies.get("target_lang", DEFAULT_TARGET_LANG)


def _set_lang_cookie(response, key: str, value: str):
    """Set a language cookie with 365-day expiry."""
    response.set_cookie(
        key=key,
        value=value,
        max_age=365 * 24 * 3600,
        path="/",
        httponly=True,
        samesite="lax",
    )


# ---------- страницы ----------

@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    tpl = env.get_template("index.html")
    return tpl.render()


@app.get("/add", response_class=HTMLResponse)
async def add_page(request: Request):
    tpl = env.get_template("add.html")
    added = request.query_params.get("added") == "1"
    translated = request.query_params.get("translated") == "1"
    error_type = request.query_params.get("error", "")
    error_word = request.query_params.get("word", "")
    # Генерируем CSRF токен для формы
    csrf_token = csrf_protection.get_token_for_form()
    return tpl.render(
        added=added, translated=translated, error_type=error_type,
        error_word=error_word, csrf_token=csrf_token,
    )


@app.post("/add")
@rate_limit(add_rate_limiter)
@require_auth
@csrf_protect_form
async def add_word(
    request: Request,
    word: str = Form(...),
    translation: str = Form(...),
    db: Session = Depends(get_db),
):
    # Валидация входных данных
    word = validate_word(word)
    translation = validate_translation(translation)

    existing = db.query(Word).filter(Word.word == word).first()
    if existing:
        return RedirectResponse(url=f"/add?error=duplicate&word={word}", status_code=303)

    db.add(Word(
        word=word,
        translation=translation,
        next_review=0,
    ))
    db.commit()
    return RedirectResponse(url="/add?added=1&translated=0", status_code=303)


@app.post("/add/translate")
@rate_limit(translate_rate_limiter)
@require_auth
async def add_translate(
    request: Request,
    word: str = Form(...),
    source_lang: str = Form(default=""),
):
    """API for auto-translating a word (called from frontend)."""
    # CSRF check via header
    from csrf import get_csrf_token_from_request, validate_csrf_form_token
    
    csrf_token = get_csrf_token_from_request(request)
    validate_csrf_form_token(csrf_token)
    
    try:
        word = validate_word(word)
    except HTTPException as e:
        return {"translation": "", "detected_language": "", "error": e.detail}

    # Use form source_lang if provided, otherwise fall back to cookie (default is "auto")
    lang = source_lang if source_lang else _get_source_lang(request)
    translation, detected = await translate_word(word, lang)
    if translation:
        from translator import _get_language_name
        lang_name = _get_language_name(detected) if detected else ""
        return {"translation": translation, "detected_language": lang_name}
    return {"translation": "", "detected_language": "", "error": "Translation not found. Check your API key."}


@app.get("/debug/translate")
async def debug_translate():
    """Debug: shows raw Yandex API response."""
    import asyncio
    loop = asyncio.get_running_loop()
    from translator import _translate_sync
    result, detected, debug = await loop.run_in_executor(None, _translate_sync, "hello", "en")
    return {"result": result, "detected": detected, "debug": debug}


@app.get("/settings", response_class=HTMLResponse)
@require_auth
async def settings_page(request: Request):
    """Settings page: choose source and target languages."""
    source_lang = _get_source_lang(request)
    target_lang = _get_target_lang(request)
    csrf_token = csrf_protection.get_token_for_form()
    
    # Get all available language codes (API or hardcoded fallback)
    supported_sources = _get_language_codes()
    # Get target codes for the selected source language
    supported_targets = SUPPORTED_LANGUAGES.get(source_lang, [DEFAULT_TARGET_LANG])
    
    # Get current locale
    current_locale = request.cookies.get("locale", DEFAULT_LOCALE)
    if current_locale not in SUPPORTED_LOCALES:
        current_locale = DEFAULT_LOCALE
    
    tpl = env.get_template("settings.html")
    return tpl.render(
        source_lang=source_lang,
        target_lang=target_lang,
        csrf_token=csrf_token,
        supported_sources=supported_sources,
        supported_targets=supported_targets,
        current_locale=current_locale,
        supported_locales=SUPPORTED_LOCALES,
    )


@app.post("/settings")
@require_auth
@csrf_protect_form
async def update_settings(
    request: Request,
    source_lang: str = Form(...),
    target_lang: str = Form(...),
    locale: str = Form(default=""),
):
    """Update language settings via cookies."""
    response = RedirectResponse(url="/settings", status_code=303)
    _set_lang_cookie(response, "source_lang", source_lang)
    _set_lang_cookie(response, "target_lang", target_lang)
    if locale and locale in SUPPORTED_LOCALES:
        _set_lang_cookie(response, "locale", locale)
    return response


@app.post("/settings/update")
@require_auth
async def update_settings_api(
    request: Request,
    source_lang: str = Form(...),
    target_lang: str = Form(...),
):
    """AJAX endpoint: update language settings and return JSON."""
    return JSONResponse({
        "source_lang": source_lang,
        "target_lang": target_lang,
        "message": "Language settings updated.",
    })


@app.get("/api/languages")
async def get_languages():
    """Return supported language codes for frontend language selectors."""
    return JSONResponse({"languages": list(SUPPORTED_LANGUAGES.keys())})


@app.get("/dictionary", response_class=HTMLResponse)
async def dictionary_page(request: Request, db: Session = Depends(get_db)):
    """Страница со списком всех слов и переводов."""
    all_words = db.query(Word).order_by(Word.word).all()
    csrf_token = csrf_protection.get_token_for_form()
    tpl = env.get_template("dictionary.html")
    return tpl.render(words=all_words, total=len(all_words), csrf_token=csrf_token)


@app.post("/dictionary/delete/{word_id}")
@require_auth
@csrf_protect_form
async def delete_word(
    request: Request,
    word_id: int,
    db: Session = Depends(get_db),
):
    """Удаление слова из словаря."""
    w = db.query(Word).get(word_id)
    if not w:
        raise HTTPException(404, "Слово не найдено")
    
    db.delete(w)
    db.commit()
    
    return RedirectResponse(url="/dictionary", status_code=303)


@app.get("/review", response_class=HTMLResponse)
async def review_page(request: Request, db: Session = Depends(get_db)):
    # Берём все слова из базы
    all_words = db.query(Word).all()

    if not all_words:
        tpl = env.get_template("review.html")
        return tpl.render(message="Словарь пуст. Добавьте слова для повторения.")

    # Weighted selection: lower interval means higher chance of being picked
    # Weight = 1 / (interval + 1) → interval 0 gives weight 1, interval 10 gives weight ~0.09
    weights = [1.0 / (w.interval + 1) for w in all_words]
    total = sum(weights)
    weights = [t / total for t in weights]

    chosen = random.choices(all_words, weights=weights, k=1)[0]

    # Random direction: 50/50
    direction = random.choice(['en_ru', 'ru_en'])

    tpl = env.get_template("review.html")
    return tpl.render(word=chosen, total_due=len(all_words), direction=direction, know_count=chosen.know_count, forgot_count=chosen.forgot_count)


@app.post("/review/result")
async def review_result(
    word_id: int = Form(...),
    correct: bool = Form(...),
    direction: str = Form(...),
    db: Session = Depends(get_db),
):
    w = db.query(Word).get(word_id)
    if not w:
        raise HTTPException(404)

    if correct:
        if w.repetitions == 0:
            w.interval = 1
        elif w.repetitions == 1:
            w.interval = 6
        else:
            w.interval = int(w.interval * 2.5)
        # Cap interval to prevent unbounded growth (max 30 days)
        if w.interval > 30:
            w.interval = 30
        w.repetitions += 1
        w.know_count += 1
    else:
        w.repetitions = 0
        w.interval = 0
        w.forgot_count += 1

    w.next_review = time.time() + w.interval * 86400
    w.last_direction = direction
    db.commit()

    return RedirectResponse(url="/review", status_code=303)


@app.post("/review/next")
async def review_next(
    word_id: int = Form(...),
    correct: bool = Form(...),
    direction: str = Form(...),
    elapsed: float = Form(default=0.0),
    db: Session = Depends(get_db),
):
    """AJAX route: saves result and returns next word in JSON."""
    w = db.query(Word).get(word_id)
    if not w:
        raise HTTPException(404)

    if correct:
        if w.repetitions == 0:
            w.interval = 1
        elif w.repetitions == 1:
            w.interval = 6
        else:
            w.interval = int(w.interval * 2.5)
        # Cap interval to prevent unbounded growth (max 30 days)
        if w.interval > 30:
            w.interval = 30
        w.repetitions += 1
        w.know_count += 1
    else:
        w.repetitions = 0
        w.interval = 0
        w.forgot_count += 1

    w.next_review = time.time() + w.interval * 86400
    w.last_direction = direction

    # Обновляем время ответа
    if elapsed > 0:
        if w.best_time is None or elapsed < w.best_time:
            w.best_time = elapsed
        if w.avg_time is None:
            w.avg_time = elapsed
        else:
            # Простое среднее арифметическое
            w.avg_time = (w.avg_time + elapsed) / 2.0

    db.commit()

    # Получить следующее и следующее+1 слово для предзагрузки
    all_words = db.query(Word).all()
    if not all_words:
        return JSONResponse({"done": True, "message": "Словарь пуст."})

    weights = [1.0 / (wi.interval + 1) for wi in all_words]
    total = sum(weights)
    weights = [t / total for t in weights]
    chosen = random.choices(all_words, weights=weights, k=1)[0]
    new_direction = random.choice(['en_ru', 'ru_en'])

    weights2 = [1.0 / (wi.interval + 1) for wi in all_words]
    total2 = sum(weights2)
    weights2 = [t / total2 for t in weights2]
    chosen2 = random.choices(all_words, weights=weights2, k=1)[0]
    new_direction2 = random.choice(['en_ru', 'ru_en'])

    return JSONResponse({
        "done": False,
        "word": chosen.word,
        "translation": chosen.translation,
        "id": chosen.id,
        "direction": new_direction,
        "total_due": len(all_words),
        # Statistics for the word just reviewed
        "current_best_time": w.best_time,
        "current_avg_time": w.avg_time,
        "current_know_count": w.know_count,
        "current_forgot_count": w.forgot_count,
        # Preloaded next word
        "next_word": chosen2.word,
        "next_translation": chosen2.translation,
        "next_id": chosen2.id,
        "next_direction": new_direction2,
        "next_best_time": chosen2.best_time,
        "next_avg_time": chosen2.avg_time,
        "next_know_count": chosen2.know_count,
        "next_forgot_count": chosen2.forgot_count,
    })