"""Translate proxy: thin FastAPI service that hides Yandex API key.

Provides these endpoints:
  POST /translate — translate a word
  GET  /languages — list supported languages
  POST /tts       — synthesize speech (text-to-speech)
  GET  /quota     — remaining daily chars for this device/IP

Protected by rate limiting, daily char quotas (per device / per IP / anon),
a global daily budget and an app token check (X-App-Token header, disabled
when APP_TOKENS is unset). CORS is restricted to a whitelist of client app
origins.
"""

import os
import asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timezone

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
from proxy.services.metrics import metrics
from proxy.services import notifier
from proxy.services.report import (
    build_report_text,
    seconds_until_next_report,
    report_days,
)
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

# Alert thresholds (env-configurable, same pattern as other proxy settings).
# Budget warn: alert once per day when global budget usage crosses this
# percent. Spikes: alert once per hour bucket when the count of the given
# status code reaches the threshold.
ALERT_BUDGET_WARN_PERCENT = int(os.getenv("ALERT_BUDGET_WARN_PERCENT", "80"))
ALERT_HOURLY_502 = int(os.getenv("ALERT_HOURLY_502", "5"))
ALERT_HOURLY_403 = int(os.getenv("ALERT_HOURLY_403", "100"))
ALERT_HOURLY_426 = int(os.getenv("ALERT_HOURLY_426", "50"))
ALERT_HOURLY_429 = int(os.getenv("ALERT_HOURLY_429", "100"))


def _today() -> str:
    """Current UTC date as YYYY-MM-DD."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _note_request(endpoint: str, request: Request) -> None:
    """Count a request and today's unique device/IP (no content logged)."""
    metrics.inc(f"req_{endpoint}")
    device_id = (request.headers.get("X-Device-Id") or "").strip()
    if device_id:
        metrics.note_unique("device", device_id)
    metrics.note_unique("ip", get_client_ip(request))


def _note_status(status_code: int) -> None:
    """Count a response status code; fire a spike alert on thresholds."""
    metrics.inc(f"status_{status_code}")
    thresholds = {
        502: ALERT_HOURLY_502,
        403: ALERT_HOURLY_403,
        426: ALERT_HOURLY_426,
        429: ALERT_HOURLY_429,
    }
    threshold = thresholds.get(status_code)
    if threshold is None:
        return
    count = metrics.inc_hourly(f"status_{status_code}")
    if count == threshold:
        hour = metrics.current_hour()
        notifier.notify(
            f"🚨 Spike: {count}× HTTP {status_code} in the {hour} UTC hour bucket",
            dedup_key=f"spike:{status_code}:{hour}",
            cooldown_hours=1,
        )


def _note_budget_alert(consumed: bool) -> None:
    """Alert on global budget exhaustion (503) or crossing the warn percent.

    The dedup key includes the percent bucket, so crossing 80% and later
    90% both alert once, but staying at 80-89% alerts only once per day.
    """
    day = _today()
    if not consumed:
        notifier.notify(
            f"🛑 Global daily budget exhausted ({GLOBAL_DAILY_CHAR_LIMIT} chars), "
            "all API requests get 503 until midnight UTC",
            dedup_key=f"budget:100:{day}",
            cooldown_hours=24,
        )
        return
    used = GLOBAL_DAILY_CHAR_LIMIT - global_budget.remaining()
    percent = used * 100 // GLOBAL_DAILY_CHAR_LIMIT
    if percent >= ALERT_BUDGET_WARN_PERCENT:
        bucket = percent // 10 * 10  # alert once per 10% bucket
        notifier.notify(
            f"⚠️ Global budget {percent}% used ({used}/{GLOBAL_DAILY_CHAR_LIMIT} chars)",
            dedup_key=f"budget:{bucket}:{day}",
            cooldown_hours=24,
        )


async def _daily_report_loop() -> None:
    """Background task: send the daily report at 00:05 UTC, forever."""
    while True:
        await asyncio.sleep(seconds_until_next_report(datetime.now(timezone.utc)))
        day, prev_day = report_days(datetime.now(timezone.utc))
        await notifier.send_alert(
            build_report_text(day, prev_day),
            dedup_key=f"report:{day}",
            cooldown_hours=24,
        )


@asynccontextmanager
async def lifespan(app: FastAPI):
    # The report task only makes sense with Telegram configured.
    if notifier.is_configured():
        task = asyncio.create_task(_daily_report_loop())
        yield
        task.cancel()
    else:
        yield


app = FastAPI(title="Lex Translate Proxy", version="1.0.0", lifespan=lifespan)


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
        _note_status(403)
        return JSONResponse(
            status_code=403,
            content={"error": "unauthorized"},
        )
    if not version_gate.is_supported(request.headers.get("X-App-Version")):
        _note_status(426)
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


@app.get("/metrics")
async def get_metrics():
    """Today's counters (UTC) for debugging and external monitoring."""
    day = _today()
    counters = metrics.get_day(day)
    return {
        "day": day,
        "counters": counters,
        "uniques": {
            "devices": metrics.count_uniques("device", day),
            "ips": metrics.count_uniques("ip", day),
        },
    }


@app.get("/quota")
async def quota(request: Request):
    """
    Remaining daily chars for this client (translate and tts separately).

    With a device ID the effective remaining is min(device, IP) — the IP
    (antibot) quota is consumed by every device request, so it can run
    out first. Without a device ID the anon quota (per IP) applies.
    Read-only: consumes nothing.
    """
    _note_request("quota", request)
    ip = get_client_ip(request)
    device_id = (request.headers.get("X-Device-Id") or "").strip()

    def level(quotas: dict) -> dict:
        if device_id:
            remaining = min(
                quotas["device"].remaining(device_id),
                quotas["ip"].remaining(ip),
            )
            limit = quotas["device"].max_chars_per_day
        else:
            remaining = quotas["anon"].remaining(ip)
            limit = quotas["anon"].max_chars_per_day
        return {
            "used": limit - remaining,
            "limit": limit,
            "remaining": remaining,
        }

    return {
        "translate": level(translate_quotas),
        "tts": level(tts_quotas),
    }


@app.post("/feedback")
async def feedback(request: Request, body: FeedbackRequest):
    _note_request("feedback", request)

    # Rate limit
    ip = get_client_ip(request)
    if not feedback_limiter.is_allowed(ip):
        _note_status(429)
        return JSONResponse(
            status_code=429,
            content={"error": "Rate limit exceeded. Try again later."},
            headers={"Retry-After": "3600"},
        )

    category = body.category.strip()
    if category not in ("bug", "idea", "other"):
        _note_status(400)
        return JSONResponse(
            status_code=400,
            content={"error": "Invalid category. Use: bug, idea, or other."},
        )

    message = body.message.strip()
    if len(message) < 10:
        _note_status(400)
        return JSONResponse(
            status_code=400,
            content={"error": "Message must be at least 10 characters."},
        )

    contact = body.contact.strip()

    if not feedback_configured():
        _note_status(503)
        return JSONResponse(
            status_code=503,
            content={"error": "Feedback service is not configured."},
        )

    success = await send_feedback(category, message, contact)

    if not success:
        _note_status(502)
        return JSONResponse(
            status_code=502,
            content={"error": "Failed to send feedback. Try again later."},
        )

    _note_status(200)
    metrics.inc("feedback_received")
    return {"status": "sent"}


@app.post("/translate")
async def translate(request: Request, body: TranslateRequest):
    _note_request("translate", request)

    # Rate limit
    ip = get_client_ip(request)
    if not translate_limiter.is_allowed(ip):
        _note_status(429)
        return JSONResponse(
            status_code=429,
            content={"error": "Rate limit exceeded. Try again later."},
            headers={"Retry-After": "60"},
        )

    word = body.word.strip()
    if not word:
        _note_status(400)
        return JSONResponse(
            status_code=400,
            content={"error": "Word is required."},
        )

    if len(word) > MAX_TEXT_LENGTH:
        _note_status(400)
        return JSONResponse(
            status_code=400,
            content={"error": "text_too_long", "max_length": MAX_TEXT_LENGTH},
        )

    # Cache hits don't consume the global budget or per-IP quota
    cached = get_cached_translation(word, body.source_lang, body.target_lang)
    if cached:
        _note_status(200)
        metrics.inc("translate_cached")
        return {"translation": cached, "detected_language": "", "cached": True}

    if not global_budget.try_consume(len(word)):
        _note_status(503)
        _note_budget_alert(consumed=False)
        return JSONResponse(
            status_code=503,
            content={"error": "service_overloaded"},
        )

    device_id = (request.headers.get("X-Device-Id") or "").strip()
    if not consume_daily_quota(translate_quotas, ip, device_id, len(word)):
        _note_status(429)
        return JSONResponse(
            status_code=429,
            content={"error": "daily_quota_exceeded"},
        )

    translation, detected = await translate_word(
        word, body.source_lang, body.target_lang
    )

    if translation:
        _note_status(200)
        metrics.inc("chars_translate", len(word))
        _note_budget_alert(consumed=True)
        return {
            "translation": translation,
            "detected_language": detected or "",
            "cached": False,
        }

    _note_status(502)
    return JSONResponse(
        status_code=502,
        content={"error": "Translation failed. Check API key or network."},
    )


@app.get("/languages")
async def languages(request: Request):
    _note_request("languages", request)
    supported = get_supported_languages()
    names = get_api_language_names()

    lang_list = [
        {"code": code, "name": names.get(code, code)}
        for code in sorted(supported.keys())
    ]

    _note_status(200)
    return {"languages": lang_list}


@app.get("/cache/stats")
async def cache_stats():
    return {"size": translation_cache.size()}


@app.post("/tts")
async def tts(request: Request, body: TtsRequest):
    _note_request("tts", request)

    # Rate limit
    ip = get_client_ip(request)
    if not tts_limiter.is_allowed(ip):
        _note_status(429)
        return JSONResponse(
            status_code=429,
            content={"error": "Rate limit exceeded. Try again later."},
            headers={"Retry-After": "60"},
        )

    text = body.text.strip()
    if not text:
        _note_status(400)
        return JSONResponse(
            status_code=400,
            content={"error": "Text is required."},
        )

    if len(text) > MAX_TEXT_LENGTH:
        _note_status(400)
        return JSONResponse(
            status_code=400,
            content={"error": "text_too_long", "max_length": MAX_TEXT_LENGTH},
        )

    # Cache hits don't consume the global budget or per-IP quota
    cached_audio = speech_cache.get(text, body.lang)
    if cached_audio is not None:
        _note_status(200)
        metrics.inc("tts_cached")
        return Response(
            content=cached_audio,
            media_type="audio/mpeg",
            headers={
                "Cache-Control": "public, max-age=86400",
                "X-Cached": "1",
            },
        )

    if not global_budget.try_consume(len(text)):
        _note_status(503)
        _note_budget_alert(consumed=False)
        return JSONResponse(
            status_code=503,
            content={"error": "service_overloaded"},
        )

    device_id = (request.headers.get("X-Device-Id") or "").strip()
    if not consume_daily_quota(tts_quotas, ip, device_id, len(text)):
        _note_status(429)
        return JSONResponse(
            status_code=429,
            content={"error": "daily_quota_exceeded"},
        )

    audio = await synthesize_speech(text, body.lang)

    if audio is None:
        _note_status(502)
        return JSONResponse(
            status_code=502,
            content={"error": "Speech synthesis failed. Check API key or network."},
        )

    _note_status(200)
    metrics.inc("chars_tts", len(text))
    _note_budget_alert(consumed=True)
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
    _note_request("dictionary", request)

    # Rate limit
    ip = get_client_ip(request)
    if not dictionary_limiter.is_allowed(ip):
        _note_status(429)
        return JSONResponse(
            status_code=429,
            content={"error": "Rate limit exceeded. Try again later."},
            headers={"Retry-After": "60"},
        )

    word = body.word.strip()
    if not word:
        _note_status(400)
        return JSONResponse(
            status_code=400,
            content={"error": "Word is required."},
        )

    lang_pair = body.lang_pair.strip()
    if not lang_pair:
        _note_status(400)
        return JSONResponse(
            status_code=400,
            content={"error": "Language pair is required."},
        )

    examples = await lookup_word(word, lang_pair)

    if examples is None:
        _note_status(502)
        return JSONResponse(
            status_code=502,
            content={"error": "Dictionary lookup failed. Check API key or network."},
        )

    _note_status(200)
    return {"examples": examples}


@app.get("/dictionary/cache/stats")
async def dictionary_cache_stats():
    return {"size": dictionary_cache.size()}
