"""Tests for alert firing: budget thresholds, spikes, SQLite fallback.

All Telegram sends are mocked (notifier.notify / send_alert) — no real
messages. Yandex calls are mocked per the recurring gotcha (tests hitting
/translate or /tts must patch proxy.main.translate_word / synthesize_speech).
"""

import asyncio

import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient

from proxy.main import (
    app,
    translate_limiter,
    translate_quotas,
    tts_quotas,
    global_budget,
    translation_cache,
    speech_cache,
    metrics,
    _note_budget_alert,
    _note_status,
)
from proxy.services import notifier


@pytest.fixture(autouse=True)
def reset_state():
    """Clear rate limiter, quota, budget, cache and metrics state."""
    translate_limiter._requests.clear()
    global_budget.reset()
    translation_cache.clear()
    speech_cache.clear()
    metrics.reset()
    for quotas in (translate_quotas, tts_quotas):
        for quota in quotas.values():
            quota.reset()
    notifier._dedup = notifier._Dedup()
    yield
    translate_limiter._requests.clear()
    global_budget.reset()
    translation_cache.clear()
    speech_cache.clear()
    metrics.reset()
    for quotas in (translate_quotas, tts_quotas):
        for quota in quotas.values():
            quota.reset()
    notifier._dedup = notifier._Dedup()


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def notify_mock():
    """Mock the fire-and-forget notify wrapper (sync, deterministic)."""
    with patch.object(notifier, "notify") as mock:
        yield mock


@pytest.fixture
def configured(monkeypatch):
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "test-token")
    monkeypatch.setenv("TELEGRAM_CHAT_ID", "test-chat")


class TestBudgetAlerts:
    """Budget 80% alert once per day; 503 alert on exhaustion.

    The global budget limit is read at import time, so these tests patch
    the module attribute directly (GLOBAL_DAILY_CHAR_LIMIT=100, warn 80%).
    Async tests give notify() a running loop for its fire-and-forget task;
    the real dedup runs (only _send_sync is mocked).
    """

    @pytest.fixture(autouse=True)
    def small_budget(self, monkeypatch):
        from proxy.security.quota import GlobalBudget
        from proxy import main as main_module

        monkeypatch.setattr(main_module, "GLOBAL_DAILY_CHAR_LIMIT", 100)
        small = GlobalBudget(max_chars_per_day=100)
        with patch.object(main_module, "global_budget", small):
            yield small

    @pytest.mark.asyncio
    async def test_budget_80_alert_fires_once(self, small_budget, configured):
        with patch.object(notifier, "_send_sync", return_value=True) as send:
            # Budget 100 chars, warn at 80%: consume 80 → alert, 85 → silent
            small_budget.try_consume(80)
            _note_budget_alert(consumed=True)
            small_budget.try_consume(5)
            _note_budget_alert(consumed=True)
            await asyncio.sleep(0)
            await asyncio.sleep(0)

        assert send.call_count == 1
        assert "80%" in send.call_args[0][0]

    @pytest.mark.asyncio
    async def test_budget_below_threshold_no_alert(self, small_budget, configured):
        with patch.object(notifier, "_send_sync", return_value=True) as send:
            small_budget.try_consume(79)
            _note_budget_alert(consumed=True)
            await asyncio.sleep(0)
            await asyncio.sleep(0)

        assert send.call_count == 0

    @pytest.mark.asyncio
    async def test_budget_100_dedup_once_per_day(self, configured):
        with patch.object(notifier, "_send_sync", return_value=True) as send:
            _note_budget_alert(consumed=False)
            _note_budget_alert(consumed=False)
            await asyncio.sleep(0)
            await asyncio.sleep(0)

        assert send.call_count == 1
        assert "exhausted" in send.call_args[0][0]

    def test_budget_exhausted_endpoint_alerts(self, client, notify_mock):
        """The 503 path calls the alert helper (notify mocked, no dedup)."""
        with patch("proxy.main.translate_word", return_value=("тест", "en")):
            resp = client.post("/translate", json={"word": "a" * 200})
        assert resp.status_code == 503

        assert notify_mock.call_count == 1
        assert "exhausted" in notify_mock.call_args[0][0]


class TestSpikeAlerts:
    """Spike alerts fire exactly when the hourly bucket hits the threshold."""

    def test_spike_502_fires_at_threshold(self, notify_mock):
        for _ in range(5):
            _note_status(502)

        assert notify_mock.call_count == 1
        assert "502" in notify_mock.call_args[0][0]

    def test_spike_502_sixth_is_silent(self, notify_mock):
        for _ in range(6):
            _note_status(502)

        assert notify_mock.call_count == 1

    def test_spike_403_fires_at_threshold(self, notify_mock, monkeypatch):
        monkeypatch.setattr("proxy.main.ALERT_HOURLY_403", 3)
        for _ in range(3):
            _note_status(403)

        assert notify_mock.call_count == 1
        assert "403" in notify_mock.call_args[0][0]

    def test_spike_426_fires_at_threshold(self, notify_mock, monkeypatch):
        monkeypatch.setattr("proxy.main.ALERT_HOURLY_426", 2)
        for _ in range(2):
            _note_status(426)

        assert notify_mock.call_count == 1
        assert "426" in notify_mock.call_args[0][0]

    def test_spike_429_fires_at_threshold(self, notify_mock, monkeypatch):
        monkeypatch.setattr("proxy.main.ALERT_HOURLY_429", 2)
        for _ in range(2):
            _note_status(429)

        assert notify_mock.call_count == 1
        assert "429" in notify_mock.call_args[0][0]

    def test_no_spike_below_threshold(self, notify_mock):
        for _ in range(4):
            _note_status(502)

        assert notify_mock.call_count == 0

    def test_200_never_spikes(self, notify_mock):
        for _ in range(1000):
            _note_status(200)

        assert notify_mock.call_count == 0


class TestSqliteFallbackAlert:
    """note_db_fallback alerts once per day."""

    def test_fallback_alert_once_per_day(self, notify_mock):
        metrics.note_db_fallback()
        metrics.note_db_fallback()

        assert notify_mock.call_count == 1
        assert "SQLite" in notify_mock.call_args[0][0]

    def test_fallback_counts_metric(self, notify_mock):
        metrics.note_db_fallback()
        assert metrics.get_day(metrics.today())["db_fallback"] == 1


class TestMetricsEndpoint:
    """GET /metrics returns today's counters (token-protected)."""

    def test_metrics_endpoint(self, client):
        with patch("proxy.main.translate_word", return_value=("тест", "en")):
            client.post("/translate", json={"word": "hello"})

        resp = client.get("/metrics")
        assert resp.status_code == 200
        data = resp.json()
        assert data["counters"]["req_translate"] == 1
        assert data["counters"]["status_200"] == 1
        assert data["counters"]["chars_translate"] == 5
        assert data["uniques"]["ips"] == 1