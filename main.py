from fastapi import FastAPI, Depends, Form, Request, HTTPException
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy.orm import Session
import jinja2
import random
import time
from dotenv import load_dotenv

from database import engine, get_db
from models import Base, Word
from translator import translate_word
from validators import validate_word, validate_translation

# Загрузка переменных окружения из .env
load_dotenv()

Base.metadata.create_all(bind=engine)

app = FastAPI()

# Raw Jinja2 loader — no caching issues
loader = jinja2.FileSystemLoader("templates")
env = jinja2.Environment(loader=loader, autoescape=True)


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
    return tpl.render(added=added, translated=translated)


@app.post("/add")
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
async def add_translate(
    word: str = Form(...),
):
    """API для автоперевода слова (вызывается с фронтенда)."""
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

    tpl = env.get_template("review.html")
    return tpl.render(word=chosen, total_due=len(all_words))


@app.post("/review/result")
async def review_result(
    word_id: int = Form(...),
    correct: bool = Form(...),
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
    db.commit()

    return RedirectResponse(url="/review", status_code=303)