"""Translate proxy: thin FastAPI service that hides Yandex API key.

Provides three endpoints:
  POST /translate — translate a word
  GET  /languages — list supported languages
  POST /tts       — synthesize speech (text-to-speech)

Protected by rate limiting, daily char quotas (per device / per IP / anon),
a global daily budget and an app token check (X-App-Token header, disabled
when APP_TOKENS is unset). CORS is restricted to a whitelist of client app
origins.
"""

import os

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel
from dotenv import load_dotenv

from proxy.services.translator import (
    translate_word,
    get_supported_languages,
    get_api_language_names,
    get_cached_translation,
)
from proxy.services.cache import translation_cache
from proxy.services.tts import synthesize_speech, speech_cache
from proxy.services.dictionary import lookup_word, dictionary_cache
from proxy.services.feedback import send_feedback, is_configured as feedback_configured
from proxy.security.rate_limiter import RateLimiter, get_client_ip
from proxy.security.quota import GlobalBudget, PersistentQuotaStore, PersistentDailyQuota
from proxy.security.token_auth import AppTokenAuth
from proxy.security.version_gate import VersionGate

load_dotenv()

app = FastAPI(title="Lex Translate Proxy", version="1.0.0")

# Max text length per request (protects against bulk text abuse)
MAX_TEXT_LENGTH = 500

# Global daily char budget across ALL users (translate + tts combined).
# Financial safety net: hard stop for Yandex API spending. Configurable
# via env var without rebuilding the image.
GLOBAL_DAILY_CHAR_LIMIT = int(os.getenv("GLOBAL_DAILY_CHAR_LIMIT", "300000"))
global_budget = GlobalBudget(max_chars_per_day=GLOBAL_DAILY_CHAR_LIMIT)

# Daily char quotas (free tier, resets at midnight UTC). Three levels per
# endpoint: device quota (primary, follows X-Device-Id), IP quota (antibot
# layer, consumed by ALL requests with a device ID) and anon quota (heavily
# reduced, for requests WITHOUT a device ID). Persistent in SQLite so they
# survive restarts; limits configurable via env vars.
DEVICE_DAILY_CHAR_LIMIT = int(os.getenv("DEVICE_DAILY_CHAR_LIMIT", "500"))
IP_DAILY_CHAR_LIMIT = int(os.getenv("IP_DAILY_CHAR_LIMIT", "3000"))
ANON_DAILY_CHAR_LIMIT = int(os.getenv("ANON_DAILY_CHAR_LIMIT", "100"))

quota_store = PersistentQuotaStore()
translate_quotas = {
    "device": PersistentDailyQuota(DEVICE_DAILY_CHAR_LIMIT, "tr:dev", quota_store),
    "ip": PersistentDailyQuota(IP_DAILY_CHAR_LIMIT, "tr:ip", quota_store),
    "anon": PersistentDailyQuota(ANON_DAILY_CHAR_LIMIT, "tr:anon", quota_store),
}
tts_quotas = {
    "device": PersistentDailyQuota(DEVICE_DAILY_CHAR_LIMIT, "tts:dev", quota_store),
    "ip": PersistentDailyQuota(IP_DAILY_CHAR_LIMIT, "tts:ip", quota_store),
    "anon": PersistentDailyQuota(ANON_DAILY_CHAR_LIMIT, "tts:anon", quota_store),
}


def consume_daily_quota(quotas: dict, ip: str, device_id: str, chars: int) -> bool:
    """
    Consume chars from the daily quota levels in order: device quota
    (only when a device ID is present), then IP quota (antibot) or
    anon quota for clients without a device ID.
    """
    if device_id:
        if not quotas["device"].try_consume(device_id, chars):
            return False
        return quotas["ip"].try_consume(ip, chars)
    return quotas["anon"].try_consume(ip, chars)

# App token check (X-App-Token header). Disabled when APP_TOKENS is unset.
token_auth = AppTokenAuth()

# Client version gate (X-App-Version header). Disabled when
# MIN_APP_VERSION is unset — outdated clients get 426 Upgrade Required.
version_gate = VersionGate()


# CORS: whitelist of client app origins. Configurable via ALLOWED_ORIGINS
# (comma-separated). Defaults cover web, Capacitor (Android/iOS) and Tauri
# (Windows/Linux use http://tauri.localhost, macOS uses tauri://localhost).
DEFAULT_ALLOWED_ORIGINS = [
    "https://lex.2-way.ru",
    "https://localhost",
    "capacitor://localhost",
    "http://tauri.localhost",
    "tauri://localhost",
]


def load_allowed_origins() -> list[str]:
    """Resolve the CORS origin list from ALLOWED_ORIGINS or the default."""
    raw = os.getenv("ALLOWED_ORIGINS", "")
    if raw.strip():
        return [o.strip() for o in raw.split(",") if o.strip()]
    return list(DEFAULT_ALLOWED_ORIGINS)


ALLOWED_ORIGINS = load_allowed_origins()

# Token middleware is added first so CORS (added second) wraps it and
# attaches CORS headers to 403 responses as well.
@app.middleware("http")
async def app_token_middleware(request: Request, call_next):
    # Preflight requests are handled by CORSMiddleware, health check
    # stays open for uptime monitoring.
    if request.method == "OPTIONS" or request.url.path == "/":
        return await call_next(request)
    if not token_auth.is_valid(request.headers.get("X-App-Token")):
        return JSONResponse(
            status_code=403,
            content={"error": "unauthorized"},
        )
    if not version_gate.is_supported(request.headers.get("X-App-Version")):
        return JSONResponse(
            status_code=426,
            content={
                "error": "update_required",
                "min_version": version_gate.min_version,
            },
        )
    return await call_next(request)


app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "X-App-Token", "X-App-Version", "X-Device-Id"],
    max_age=86400,
)

# Rate limiters: 30 requests per minute per endpoint
translate_limiter = RateLimiter(max_requests=30, window_seconds=60)
tts_limiter = RateLimiter(max_requests=30, window_seconds=60)
dictionary_limiter = RateLimiter(max_requests=30, window_seconds=60)
# Feedback: stricter limit — 3 per hour per IP
feedback_limiter = RateLimiter(max_requests=3, window_seconds=3600)


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


class FeedbackRequest(BaseModel):
    category: str
    message: str
    contact: str = ""


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

    if len(word) > MAX_TEXT_LENGTH:
        return JSONResponse(
            status_code=400,
            content={"error": "text_too_long", "max_length": MAX_TEXT_LENGTH},
        )

    # Cache hits don't consume the global budget or per-IP quota
    cached = get_cached_translation(word, body.source_lang, body.target_lang)
    if cached:
        return {"translation": cached, "detected_language": ""}

    if not global_budget.try_consume(len(word)):
        return JSONResponse(
            status_code=503,
            content={"error": "service_overloaded"},
        )

    device_id = (request.headers.get("X-Device-Id") or "").strip()
    if not consume_daily_quota(translate_quotas, ip, device_id, len(word)):
        return JSONResponse(
            status_code=429,
            content={"error": "daily_quota_exceeded"},
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

    if len(text) > MAX_TEXT_LENGTH:
        return JSONResponse(
            status_code=400,
            content={"error": "text_too_long", "max_length": MAX_TEXT_LENGTH},
        )

    # Cache hits don't consume the global budget or per-IP quota
    if speech_cache.get(text, body.lang) is not None:
        return Response(
            content=speech_cache.get(text, body.lang),
            media_type="audio/mpeg",
            headers={"Cache-Control": "public, max-age=86400"},
        )

    if not global_budget.try_consume(len(text)):
        return JSONResponse(
            status_code=503,
            content={"error": "service_overloaded"},
        )

    device_id = (request.headers.get("X-Device-Id") or "").strip()
    if not consume_daily_quota(tts_quotas, ip, device_id, len(text)):
        return JSONResponse(
            status_code=429,
            content={"error": "daily_quota_exceeded"},
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


@app.post("/feedback")
async def feedback(request: Request, body: FeedbackRequest):
    # Rate limit
    ip = get_client_ip(request)
    if not feedback_limiter.is_allowed(ip):
        return JSONResponse(
            status_code=429,
            content={"error": "Rate limit exceeded. Try again later."},
            headers={"Retry-After": "3600"},
        )

    category = body.category.strip()
    if category not in ("bug", "idea", "other"):
        return JSONResponse(
            status_code=400,
            content={"error": "Invalid category. Use: bug, idea, or other."},
        )

    message = body.message.strip()
    if len(message) < 10:
        return JSONResponse(
            status_code=400,
            content={"error": "Message must be at least 10 characters."},
        )

    contact = body.contact.strip()

    if not feedback_configured():
        return JSONResponse(
            status_code=503,
            content={"error": "Feedback service is not configured."},
        )

    success = await send_feedback(category, message, contact)

    if not success:
        return JSONResponse(
            status_code=502,
            content={"error": "Failed to send feedback. Try again later."},
        )

    return {"status": "sent"}
