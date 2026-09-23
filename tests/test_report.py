"""Tests for the daily report builder and scheduling helper."""

from datetime import datetime, timedelta, timezone

from proxy.services.report import (
    build_report_text,
    seconds_until_next_report,
    report_days,
)
from proxy.services.metrics import Metrics


def _utc(year, month, day, hour=0, minute=0, second=0):
    return datetime(year, month, day, hour, minute, second, tzinfo=timezone.utc)


class TestBuildReportText:
    """All report sections, comparison with the previous day."""

    def _seed(self, m, day, **counts):
        """Write counters for an explicit day (bypasses today())."""
        with m._lock:
            m._connect()
            for key, value in counts.items():
                m._bump_daily(day, key, value)

    def test_report_contains_all_sections(self, tmp_path, monkeypatch):
        m = Metrics(db_path=str(tmp_path / "metrics.db"))
        monkeypatch.setattr("proxy.services.report.metrics", m)

        self._seed(
            m,
            "2026-09-21",
            chars_translate=100,
            chars_tts=50,
            req_translate=10,
            translate_cached=4,
            req_tts=5,
            tts_cached=5,
            req_dictionary=3,
            req_languages=2,
            req_quota=1,
            req_feedback=1,
            status_400=1,
            status_502=2,
            feedback_received=1,
        )
        # Uniques are recorded via note_unique (today's date) — seed the
        # table directly for the report day instead.
        with m._lock:
            m._connect()
            for ident in ("dev1", "dev2"):
                m._conn.execute(
                    "INSERT OR IGNORE INTO metrics_uniques (day, kind, ident) "
                    "VALUES (?, 'device', ?)",
                    ("2026-09-21", ident),
                )
            m._conn.execute(
                "INSERT OR IGNORE INTO metrics_uniques (day, kind, ident) "
                "VALUES (?, 'ip', ?)",
                ("2026-09-21", "10.0.0.1"),
            )
            m._conn.commit()

        text = build_report_text("2026-09-21", "2026-09-20")

        assert "2026-09-21" in text
        assert "150 chars (100 translate / 50 TTS)" in text
        assert "2 devices / 1 IPs" in text
        assert "translate: 10" in text
        assert "tts: 5" in text
        assert "dictionary: 3" in text
        assert "languages: 2" in text
        assert "quota: 1" in text
        assert "feedback: 1" in text
        assert "translate 40%" in text  # 4/10 cache hits
        assert "TTS 100%" in text  # 5/5 cache hits
        assert "400: 1" in text
        assert "502: 2" in text
        assert "Feedback received: 1" in text

    def test_report_comparison_arrows(self, tmp_path, monkeypatch):
        m = Metrics(db_path=str(tmp_path / "metrics.db"))
        monkeypatch.setattr("proxy.services.report.metrics", m)

        self._seed(m, "2026-09-21", chars_translate=100)
        self._seed(m, "2026-09-20", chars_translate=50)

        text = build_report_text("2026-09-21", "2026-09-20")
        assert "100 chars (100 translate / 0 TTS) ↑" in text

    def test_report_down_arrow(self, tmp_path, monkeypatch):
        m = Metrics(db_path=str(tmp_path / "metrics.db"))
        monkeypatch.setattr("proxy.services.report.metrics", m)

        self._seed(m, "2026-09-21", chars_translate=10)
        self._seed(m, "2026-09-20", chars_translate=50)

        text = build_report_text("2026-09-21", "2026-09-20")
        assert "10 chars (10 translate / 0 TTS) ↓" in text

    def test_empty_days_no_division_by_zero(self, tmp_path, monkeypatch):
        m = Metrics(db_path=str(tmp_path / "metrics.db"))
        monkeypatch.setattr("proxy.services.report.metrics", m)

        text = build_report_text("2026-09-21", "2026-09-20")
        assert "0 chars (0 translate / 0 TTS)" in text
        assert "translate —" in text  # no requests → no hit rate
        assert "TTS —" in text


class TestSecondsUntilNextReport:
    """Scheduling boundaries around 00:05 UTC."""

    def test_before_report_time_same_day(self):
        now = _utc(2026, 9, 22, 0, 0, 0)
        assert seconds_until_next_report(now) == 300.0

    def test_after_report_time_next_day(self):
        now = _utc(2026, 9, 22, 0, 6, 0)
        expected = (24 * 3600) - 60
        assert seconds_until_next_report(now) == expected

    def test_exactly_at_report_time(self):
        now = _utc(2026, 9, 22, 0, 5, 0)
        assert seconds_until_next_report(now) == 24 * 3600.0

    def test_midday(self):
        now = _utc(2026, 9, 22, 12, 0, 0)
        expected = (12 * 3600) + 300
        assert seconds_until_next_report(now) == expected

    def test_non_utc_timezone_converted(self):
        # 03:00 UTC+3 == 00:00 UTC
        now = datetime(2026, 9, 22, 3, 0, 0, tzinfo=timezone(timedelta(hours=3)))
        assert seconds_until_next_report(now) == 300.0


class TestReportDays:
    """The report covers the previous UTC day."""

    def test_after_report_time(self):
        now = _utc(2026, 9, 22, 0, 6, 0)
        day, prev_day = report_days(now)
        assert day == "2026-09-21"
        assert prev_day == "2026-09-20"

    def test_midday(self):
        now = _utc(2026, 9, 22, 12, 0, 0)
        day, prev_day = report_days(now)
        assert day == "2026-09-21"
        assert prev_day == "2026-09-20"
