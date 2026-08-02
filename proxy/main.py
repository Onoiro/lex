"""Translate proxy: thin FastAPI service that hides Yandex API key.

Provides three endpoints:
  POST /translate — translate a word
  GET  /languages — list supported languages
  POST /tts       — synthesize speech (text-to-speech)

No auth or CSRF: protected by rate limiting. CORS enabled for client apps.
"""

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel
from dotenv import load_dotenv

from proxy.services.translator import translate_word, get_supported_languages, get_api_language_names
from proxy.services.cache import translation_cache
from proxy.services.tts import synthesize_speech, speech_cache
from proxy.services.dictionary import lookup_word, dictionary_cache
from proxy.security.rate_limiter import RateLimiter, get_client_ip

load_dotenv()

app = FastAPI(title="Lex Translate Proxy", version="1.0.0")

# CORS: allow client apps from any origin
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# Rate limiters: 30 requests per minute per endpoint
translate_limiter = RateLimiter(max_requests=30, window_seconds=60)
tts_limiter = RateLimiter(max_requests=30, window_seconds=60)
dictionary_limiter = RateLimiter(max_requests=30, window_seconds=60)


class TranslateRequest(BaseModel):
    word: str
    source_lang: str = "auto"
    target_lang: str = "ru"


class TtsRequest(BaseModel):
    text: str
    lang: str


class DictionaryRequest(BaseModel):
    word: str
    lang_pair: str


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


@app.post("/tts")
async def tts(request: Request, body: TtsRequest):
    # Rate limit
    ip = get_client_ip(request)
    if not tts_limiter.is_allowed(ip):
        return JSONResponse(
            status_code=429,
            content={"error": "Rate limit exceeded. Try again later."},
            headers={"Retry-After": "60"},
        )

    text = body.text.strip()
    if not text:
        return JSONResponse(
            status_code=400,
            content={"error": "Text is required."},
        )

    audio = await synthesize_speech(text, body.lang)

    if audio is None:
        return JSONResponse(
            status_code=502,
            content={"error": "Speech synthesis failed. Check API key or network."},
        )

    return Response(
        content=audio,
        media_type="audio/mpeg",
        headers={"Cache-Control": "public, max-age=86400"},
    )


@app.get("/tts/cache/stats")
async def tts_cache_stats():
    return {"size": speech_cache.size()}


@app.post("/dictionary")
async def dictionary(request: Request, body: DictionaryRequest):
    # Rate limit
    ip = get_client_ip(request)
    if not dictionary_limiter.is_allowed(ip):
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

    lang_pair = body.lang_pair.strip()
    if not lang_pair:
        return JSONResponse(
            status_code=400,
            content={"error": "Language pair is required."},
        )

    examples = await lookup_word(word, lang_pair)

    if examples is None:
        return JSONResponse(
            status_code=502,
            content={"error": "Dictionary lookup failed. Check API key or network."},
        )

    return {"examples": examples}


@app.get("/dictionary/cache/stats")
async def dictionary_cache_stats():
    return {"size": dictionary_cache.size()}
