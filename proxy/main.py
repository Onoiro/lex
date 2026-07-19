"""Translate proxy: thin FastAPI service that hides Yandex API key.

Provides two endpoints:
  POST /translate — translate a word
  GET  /languages — list supported languages

No auth or CSRF: protected by rate limiting. CORS enabled for client apps.
"""

import os
import sys

# Add project root to path so we can import services/ and security/
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from dotenv import load_dotenv

from services.translator import translate_word, get_supported_languages, get_api_language_names
from services.cache import translation_cache
from security.rate_limiter import RateLimiter, get_client_ip

load_dotenv()

app = FastAPI(title="Lex Translate Proxy", version="1.0.0")

# CORS: allow client apps from any origin
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# Rate limiter: 30 translate requests per minute
translate_limiter = RateLimiter(max_requests=30, window_seconds=60)


class TranslateRequest(BaseModel):
    word: str
    source_lang: str = "auto"
    target_lang: str = "ru"


@app.get("/")
async def health():
    return {"status": "ok"}


@app.post("/translate")
async def translate(request: Request, body: TranslateRequest):
    # Rate limit
    ip = get_client_ip(request)
    if not translate_limiter.is_allowed(ip):
        return JSONResponse(
            status_code=429,
            content={"error": "Rate limit exceeded. Try again later."},
            headers={"Retry-After": "60"},
        )

    word = body.word.strip()
    if not word:
        return JSONResponse(
            status_code=400,
            content={"error": "Word is required."},
        )

    translation, detected = await translate_word(
        word, body.source_lang, body.target_lang
    )

    if translation:
        return {
            "translation": translation,
            "detected_language": detected or "",
        }

    return JSONResponse(
        status_code=502,
        content={"error": "Translation failed. Check API key or network."},
    )


@app.get("/languages")
async def languages():
    supported = get_supported_languages()
    names = get_api_language_names()

    lang_list = [
        {"code": code, "name": names.get(code, code)}
        for code in sorted(supported.keys())
    ]

    return {"languages": lang_list}


@app.get("/cache/stats")
async def cache_stats():
    return {"size": translation_cache.size()}
