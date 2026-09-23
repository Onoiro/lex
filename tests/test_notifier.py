"""Tests for the Telegram notifier (dedup, cooldown, fire-and-forget)."""

import asyncio
from unittest.mock import patch

import pytest

from proxy.services import notifier


@pytest.fixture(autouse=True)
def reset_dedup():
    """Fresh dedup state for each test."""
    notifier._dedup = notifier._Dedup()
    yield
    notifier._dedup = notifier._Dedup()


@pytest.fixture
def configured(monkeypatch):
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "test-token")
    monkeypatch.setenv("TELEGRAM_CHAT_ID", "test-chat")


class TestIsConfigured:
    def test_not_configured_by_default(self):
        assert notifier.is_configured() is False

    def test_configured(self, configured):
        assert notifier.is_configured() is True

    def test_partial_config(self, monkeypatch):
        monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "token")
        monkeypatch.delenv("TELEGRAM_CHAT_ID", raising=False)
        assert notifier.is_configured() is False


class TestSendAlert:
    @pytest.mark.asyncio
    async def test_sends_once_per_key(self, configured):
        with patch.object(notifier, "_send_sync", return_value=True) as send:
            assert await notifier.send_alert("text", "key1", cooldown_hours=1) is True
            assert await notifier.send_alert("text", "key1", cooldown_hours=1) is False
            assert send.call_count == 1

    @pytest.mark.asyncio
    async def test_different_keys_both_send(self, configured):
        with patch.object(notifier, "_send_sync", return_value=True) as send:
            assert await notifier.send_alert("text", "key1", cooldown_hours=1) is True
            assert await notifier.send_alert("text", "key2", cooldown_hours=1) is True
            assert send.call_count == 2

    @pytest.mark.asyncio
    async def test_cooldown_expiry_allows_resend(self, configured):
        with patch.object(notifier, "_send_sync", return_value=True) as send, \
             patch.object(notifier, "time") as fake_time:
            fake_time.monotonic.return_value = 1000.0
            assert await notifier.send_alert("text", "key1", cooldown_hours=1) is True
            # Still within the 1-hour cooldown
            fake_time.monotonic.return_value = 1000.0 + 1800.0
            assert await notifier.send_alert("text", "key1", cooldown_hours=1) is False
            # Cooldown expired
            fake_time.monotonic.return_value = 1000.0 + 3601.0
            assert await notifier.send_alert("text", "key1", cooldown_hours=1) is True
            assert send.call_count == 2

    @pytest.mark.asyncio
    async def test_not_configured_never_sends(self):
        with patch.object(notifier, "_send_sync", return_value=True) as send:
            assert await notifier.send_alert("text", "key1", cooldown_hours=1) is False
            assert send.call_count == 0

    @pytest.mark.asyncio
    async def test_send_failure_returns_false(self, configured):
        with patch.object(notifier, "_send_sync", return_value=False):
            assert await notifier.send_alert("text", "key1", cooldown_hours=1) is False


class TestNotify:
    """Fire-and-forget wrapper: sync dedup, scheduled send, no exceptions."""

    @pytest.mark.asyncio
    async def test_notify_sends_once_per_key(self, configured):
        with patch.object(notifier, "_send_sync", return_value=True) as send:
            notifier.notify("text", "key1", cooldown_hours=1)
            notifier.notify("text", "key1", cooldown_hours=1)  # deduped
            await asyncio.sleep(0)
            await asyncio.sleep(0)
            assert send.call_count == 1

    @pytest.mark.asyncio
    async def test_notify_not_configured_no_task(self):
        with patch.object(notifier, "_send_sync", return_value=True) as send:
            notifier.notify("text", "key1", cooldown_hours=1)
            await asyncio.sleep(0)
            assert send.call_count == 0

    def test_notify_without_event_loop_does_not_raise(self):
        # No running loop in a sync context — must be a silent no-op.
        notifier.notify("text", "key1", cooldown_hours=1)

    @pytest.mark.asyncio
    async def test_notify_swallows_exceptions(self, configured):
        async def boom(*args, **kwargs):
            raise RuntimeError("boom")

        with patch.object(notifier, "_send", side_effect=boom):
            notifier.notify("text", "key1", cooldown_hours=1)
            await asyncio.sleep(0)
            await asyncio.sleep(0)  # Let the exception surface (it must not)