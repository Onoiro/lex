"""Daily report text builder and scheduling helper.

The report is sent at 00:05 UTC for the previous UTC day: spend, uniques,
requests per endpoint, cache hit rates, errors, feedback count. Pure
functions — no I/O except reading metrics from the shared SQLite DB.
"""

from datetime import datetime, timedelta, timezone

from proxy.services.metrics import metrics

# Report time: 5 minutes after midnight UTC (let the day fully close first).
REPORT_HOUR = 0
REPORT_MINUTE = 5

ENDPOINTS = [
    ("translate", "req_translate"),
    ("tts", "req_tts"),
    ("dictionary", "req_dictionary"),
    ("languages", "req_languages"),
    ("quota", "req_quota"),
    ("feedback", "req_feedback"),
]

ERROR_CODES = ["400", "403", "426", "429", "502", "503"]


def _delta(current: int, previous: int) -> str:
    """Comparison arrow vs the previous day (empty when both are zero)."""
    if current > previous:
        return " ↑"
    if current < previous:
        return " ↓"
    return ""


def _hit_rate(hits: int, total: int) -> str:
    """Cache hit rate as a percentage (— when no requests)."""
    if total == 0:
        return "—"
    return f"{hits * 100 // total}%"


def build_report_text(day: str, prev_day: str) -> str:
    """Build the daily report text from persisted metrics."""
    today = metrics.get_day(day)
    yesterday = metrics.get_day(prev_day)

    lines = [f"📊 Lex daily report — {day} (UTC)", ""]

    # Spend
    tr_chars = today.get("chars_translate", 0)
    tts_chars = today.get("chars_tts", 0)
    prev_chars = (
        yesterday.get("chars_translate", 0) + yesterday.get("chars_tts", 0)
    )
    total_chars = tr_chars + tts_chars
    lines.append(
        "💰 Spend: "
        f"{total_chars} chars ({tr_chars} translate / {tts_chars} TTS)"
        f"{_delta(total_chars, prev_chars)}"
    )

    # Uniques
    devices = metrics.count_uniques("device", day)
    ips = metrics.count_uniques("ip", day)
    lines.append(f"👥 Uniques: {devices} devices / {ips} IPs")

    # Requests per endpoint
    lines.append("")
    lines.append("📈 Requests:")
    for label, key in ENDPOINTS:
        lines.append(
            f"  {label}: {today.get(key, 0)}"
            f"{_delta(today.get(key, 0), yesterday.get(key, 0))}"
        )

    # Cache hit rates
    lines.append("")
    tr_total = today.get("req_translate", 0)
    tr_hits = today.get("translate_cached", 0)
    tts_total = today.get("req_tts", 0)
    tts_hits = today.get("tts_cached", 0)
    lines.append(
        f"💾 Cache hit rate: translate {_hit_rate(tr_hits, tr_total)}, "
        f"TTS {_hit_rate(tts_hits, tts_total)}"
    )

    # Errors
    lines.append("")
    lines.append("❗ Errors:")
    for code in ERROR_CODES:
        count = today.get(f"status_{code}", 0)
        lines.append(f"  {code}: {count}")

    # Feedback
    lines.append("")
    lines.append(f"💬 Feedback received: {today.get('feedback_received', 0)}")

    return "\n".join(lines)


def seconds_until_next_report(now: datetime) -> float:
    """Seconds from `now` until the next 00:05 UTC.

    `now` must be timezone-aware (UTC or offset — compared as UTC).
    """
    now_utc = now.astimezone(timezone.utc)
    target = now_utc.replace(
        hour=REPORT_HOUR, minute=REPORT_MINUTE, second=0, microsecond=0
    )
    if now_utc >= target:
        target += timedelta(days=1)
    return (target - now_utc).total_seconds()


def report_days(now: datetime) -> tuple[str, str]:
    """(day, prev_day) the next report should cover, given the current time.

    The report runs at 00:05 UTC and covers the previous UTC day.
    """
    now_utc = now.astimezone(timezone.utc)
    yesterday = now_utc.date() - timedelta(days=1)
    return (
        yesterday.strftime("%Y-%m-%d"),
        (yesterday - timedelta(days=1)).strftime("%Y-%m-%d"),
    )
