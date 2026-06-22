from fastapi import FastAPI, Depends, Form, Request, HTTPException
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse
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

app = FastAPI()

# Авто-миграция: добавляем last_direction, если столбца нет
def auto_migrate():
    inspector = inspect(engine)
    columns = [col['name'] for col in inspector.get_columns('words')]
    if 'last_direction' not in columns:
        with engine.connect() as conn:
            conn.execute(text("ALTER TABLE words ADD COLUMN last_direction VARCHAR DEFAULT 'en_ru'"))
            conn.commit()
        print("[auto-migrate] Added last_direction column to words table")

Base.metadata.create_all(bind=engine)
auto_migrate()

# Raw Jinja2 loader — no caching issues
loader = jinja2.FileSystemLoader("templates")
env = jinja2.Environment(loader=loader, autoescape=True)
env.globals["version"] = VERSION


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
    # Генерируем CSRF токен для формы
    csrf_token = csrf_protection.get_token_for_form()
    return tpl.render(added=added, translated=translated, csrf_token=csrf_token)


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
        raise HTTPException(400, f"Слово '{word}' уже есть в словаре")

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
):
    """API для автоперевода слова (вызывается с фронтенда)."""
    # CSRF проверка через заголовок
    from csrf import get_csrf_token_from_request, validate_csrf_form_token
    
    csrf_token = get_csrf_token_from_request(request)
    validate_csrf_form_token(csrf_token)
    
    try:
        word = validate_word(word)
    except HTTPException as e:
        return {"translation": "", "error": e.detail}

    translation = await translate_word(word)
    if translation:
        return {"translation": translation}
    return {"translation": "", "error": "Перевод не найден. Проверьте API ключ."}


@app.get("/debug/translate")
async def debug_translate():
    """Отладка: показывает сырой ответ Yandex API."""
    import asyncio
    loop = asyncio.get_running_loop()
    from translator import _translate_sync
    result, debug = await loop.run_in_executor(None, _translate_sync, "hello")
    return {"result": result, "debug": debug}


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

    # Взвешенный выбор: чем меньше интервал (чаще забывал), тем выше шанс
    # Вес = 1 / (interval + 1) → интервал 0 даёт вес 1, интервал 10 даёт вес ~0.09
    weights = [1.0 / (w.interval + 1) for w in all_words]
    total = sum(weights)
    weights = [t / total for t in weights]

    chosen = random.choices(all_words, weights=weights, k=1)[0]

    # Случайный выбор направления: 50/50
    direction = random.choice(['en_ru', 'ru_en'])

    tpl = env.get_template("review.html")
    return tpl.render(word=chosen, total_due=len(all_words), direction=direction)


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
            w.interval = round(w.interval * 2.5)
        w.repetitions += 1
    else:
        w.repetitions = 0
        w.interval = 0

    w.next_review = time.time() + w.interval * 86400
    w.last_direction = direction
    db.commit()

    return RedirectResponse(url="/review", status_code=303)


@app.post("/review/next")
async def review_next(
    word_id: int = Form(...),
    correct: bool = Form(...),
    direction: str = Form(...),
    db: Session = Depends(get_db),
):
    """AJAX-маршрут: сохраняет результат и возвращает следующее слово в JSON."""
    w = db.query(Word).get(word_id)
    if not w:
        raise HTTPException(404)

    if correct:
        if w.repetitions == 0:
            w.interval = 1
        elif w.repetitions == 1:
            w.interval = 6
        else:
            w.interval = round(w.interval * 2.5)
        w.repetitions += 1
    else:
        w.repetitions = 0
        w.interval = 0

    w.next_review = time.time() + w.interval * 86400
    w.last_direction = direction
    db.commit()

    # Получить следующее слово
    all_words = db.query(Word).all()
    if not all_words:
        return JSONResponse({"done": True, "message": "Словарь пуст."})

    weights = [1.0 / (wi.interval + 1) for wi in all_words]
    total = sum(weights)
    weights = [t / total for t in weights]
    chosen = random.choices(all_words, weights=weights, k=1)[0]
    new_direction = random.choice(['en_ru', 'ru_en'])

    return JSONResponse({
        "done": False,
        "word": chosen.word,
        "translation": chosen.translation,
        "id": chosen.id,
        "direction": new_direction,
        "total_due": len(all_words),
    })