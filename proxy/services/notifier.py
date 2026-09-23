"""Telegram alerts for the developer (same bot as feedback).

Fire-and-forget: a failed send must never affect user responses. Alerts
are deduplicated per key with a cooldown to avoid flooding the chat
(anti-flapping). The dedup check in notify() is synchronous (before the
task is scheduled), so repeated threshold crossings within the cooldown
never even schedule a send. Not configured (empty TELEGRAM_* env) = no-op.
"""

import os
import asyncio
import time
from threading import Lock

import httpx

TELEGRAM_API_URL = "https://api.telegram.org/bot{token}/sendMessage"


def is_configured() -> bool:
    """Check if Telegram bot token and chat ID are configured."""
    return bool(os.getenv("TELEGRAM_BOT_TOKEN") and os.getenv("TELEGRAM_CHAT_ID"))


def _send_sync(text: str) -> bool:
    """Send a message via Telegram Bot API (sync). Returns True on success."""
    token = os.getenv("TELEGRAM_BOT_TOKEN", "")
    chat_id = os.getenv("TELEGRAM_CHAT_ID", "")
    if not token or not chat_id:
        return False
    try:
        with httpx.Client(timeout=10.0) as client:
            response = client.post(
                TELEGRAM_API_URL.format(token=token),
                json={"chat_id": chat_id, "text": text},
            )
            return response.status_code == 200
    except (httpx.HTTPStatusError, httpx.RequestError):
        return False


class _Dedup:
    """In-memory dedup: key -> last send time (monotonic)."""

    def __init__(self):
        self._sent: dict[str, float] = {}
        self._lock = Lock()

    def should_send(self, key: str, cooldown_hours: float) -> bool:
        """True if the key was not sent within the cooldown window."""
        now = time.monotonic()
        with self._lock:
            last = self._sent.get(key)
            if last is not None and (now - last) < cooldown_hours * 3600:
                return False
            self._sent[key] = now
            return True


_dedup = _Dedup()


async def _send(text: str) -> bool:
    """Send a message (no dedup — callers handle it)."""
    if not is_configured():
        return False
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, _send_sync, text)


async def send_alert(text: str, dedup_key: str, cooldown_hours: float) -> bool:
    """Send an alert unless the same key was sent within the cooldown.

    Used by the daily report loop (awaitable). Returns True if the message
    was actually sent and succeeded.
    """
    if not _dedup.should_send(dedup_key, cooldown_hours):
        return False
    return await _send(text)


def notify(text: str, dedup_key: str, cooldown_hours: float) -> None:
    """Fire-and-forget alert: sync dedup check, then schedule the send.

    Safe to call from sync request handlers (metrics hooks). All errors
    are swallowed — alerts must never break responses.
    """
    if not is_configured():
        return
    if not _dedup.should_send(dedup_key, cooldown_hours):
        return
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return  # No event loop (e.g. sync unit tests) — nothing to do.
    task = loop.create_task(_send(text))

    def _swallow(task: asyncio.Task) -> None:
        if not task.cancelled():
            task.exception()  # Retrieve to avoid "exception never retrieved".

    task.add_done_callback(_swallow)