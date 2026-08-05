"""Telegram feedback service.

Sends user feedback messages to the developer via Telegram Bot API.
Bot token and chat ID are read from environment variables.
"""

import os
import httpx
import asyncio

BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
CHAT_ID = os.getenv("TELEGRAM_CHAT_ID", "")
TELEGRAM_API_URL = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"


def is_configured() -> bool:
    """Check if Telegram bot token and chat ID are configured."""
    return bool(os.getenv("TELEGRAM_BOT_TOKEN") and os.getenv("TELEGRAM_CHAT_ID"))

CATEGORY_EMOJI = {
    "bug": "🐛",
    "idea": "💡",
    "other": "💬",
}

CATEGORY_LABEL = {
    "bug": "Bug",
    "idea": "Idea",
    "other": "Other",
}


def _format_message(category: str, message: str, contact: str) -> str:
    """Format feedback into a Telegram message."""
    emoji = CATEGORY_EMOJI.get(category, "💬")
    label = CATEGORY_LABEL.get(category, "Other")
    lines = [f"{emoji} {label}", "", message]
    if contact:
        lines += ["", f"📞 Contact: {contact}"]
    return "\n".join(lines)


def _send_sync(category: str, message: str, contact: str) -> bool:
    """Send feedback message via Telegram Bot API (sync).

    Returns True on success, False on error.
    """
    if not BOT_TOKEN or not CHAT_ID:
        return False

    text = _format_message(category, message, contact)

    try:
        with httpx.Client(timeout=10.0) as client:
            response = client.post(
                TELEGRAM_API_URL,
                json={
                    "chat_id": CHAT_ID,
                    "text": text,
                },
            )
            return response.status_code == 200
    except (httpx.HTTPStatusError, httpx.RequestError):
        return False


async def send_feedback(category: str, message: str, contact: str = "") -> bool:
    """Send feedback message via Telegram Bot API.

    Args:
        category: Feedback category ("bug", "idea", "other").
        message: Feedback text from the user.
        contact: Optional contact info (email or Telegram username).

    Returns:
        True if the message was sent successfully, False otherwise.
    """
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(
        None, _send_sync, category, message, contact
    )