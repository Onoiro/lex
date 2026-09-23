"""Tests for metrics counters and daily SQLite persistence."""

import pytest

from proxy.services.metrics import Metrics


@pytest.fixture
def metrics_instance(tmp_path):
    """Fresh Metrics instance on a temp DB for each test."""
    return Metrics(db_path=str(tmp_path / "metrics.db"))


class TestCounters:
    """In-memory counters and daily persistence."""

    def test_inc(self, metrics_instance):
        metrics_instance.inc("status_200")
        metrics_instance.inc("status_200")
        metrics_instance.inc("chars_translate", 5)

        day = metrics_instance.today()
        assert metrics_instance.get_day(day) == {
            "status_200": 2,
            "chars_translate": 5,
        }

    def test_inc_accumulates(self, metrics_instance):
        metrics_instance.inc("req_translate", 1)
        metrics_instance.inc("req_translate", 2)

        assert metrics_instance.get_day(metrics_instance.today())["req_translate"] == 3

    def test_get_day_unknown(self, metrics_instance):
        assert metrics_instance.get_day("2000-01-01") == {}


class TestHourlyBuckets:
    """Hour buckets for spike alerts."""

    def test_inc_hourly_returns_running_count(self, metrics_instance):
        assert metrics_instance.inc_hourly("status_502") == 1
        assert metrics_instance.inc_hourly("status_502") == 2
        assert metrics_instance.inc_hourly("status_502") == 3

    def test_get_hourly(self, metrics_instance):
        metrics_instance.inc_hourly("status_502")
        hour = metrics_instance.current_hour()
        assert metrics_instance.get_hourly("status_502", hour) == 1
        assert metrics_instance.get_hourly("status_502", "2000-01-01T00") == 0
        assert metrics_instance.get_hourly("status_403", hour) == 0


class TestUniques:
    """Unique devices/IPs: dedup within a day, separate per day."""

    def test_count_uniques_dedups(self, metrics_instance):
        metrics_instance.note_unique("device", "dev1")
        metrics_instance.note_unique("device", "dev1")  # duplicate
        metrics_instance.note_unique("device", "dev2")
        metrics_instance.note_unique("ip", "10.0.0.1")

        day = metrics_instance.today()
        assert metrics_instance.count_uniques("device", day) == 2
        assert metrics_instance.count_uniques("ip", day) == 1

    def test_uniques_separate_per_day(self, metrics_instance):
        metrics_instance.note_unique("device", "dev1")
        assert metrics_instance.count_uniques("device", "2000-01-01") == 0


class TestPersistence:
    """Daily counters survive instance recreation (container restart)."""

    def test_persists_between_instances(self, tmp_path):
        db = str(tmp_path / "metrics.db")
        m1 = Metrics(db_path=db)
        m1.inc("status_200", 7)
        m1.note_unique("device", "dev1")

        m2 = Metrics(db_path=db)
        day = m2.today()
        assert m2.get_day(day)["status_200"] == 7
        assert m2.count_uniques("device", day) == 1

    def test_uniques_dedup_across_instances(self, tmp_path):
        """The same device seen by two processes counts once."""
        db = str(tmp_path / "metrics.db")
        m1 = Metrics(db_path=db)
        m1.note_unique("device", "dev1")

        m2 = Metrics(db_path=db)
        m2.note_unique("device", "dev1")
        assert m2.count_uniques("device", m2.today()) == 1


class TestGracefulDegradation:
    """Unusable DB path: no exceptions, counters degrade to memory-only."""

    def test_unwritable_path(self, tmp_path):
        blocker = tmp_path / "no-such-dir"
        blocker.write_text("not a dir")
        m = Metrics(db_path=str(tmp_path / "no-such-dir" / "sub" / "m.db"))

        m.inc("status_200")  # must not raise
        m.note_unique("device", "dev1")  # must not raise
        assert m.get_day(m.today()) == {}
        assert m.count_uniques("device", m.today()) == 0
        assert m._init_failed is True

    def test_hourly_buckets_work_without_db(self, tmp_path):
        blocker = tmp_path / "no-such-dir"
        blocker.write_text("not a dir")
        m = Metrics(db_path=str(tmp_path / "no-such-dir" / "sub" / "m.db"))

        assert m.inc_hourly("status_502") == 1
        assert m.get_hourly("status_502", m.current_hour()) == 1


class TestReset:
    """reset() clears everything and reconnects to the DB."""

    def test_reset(self, metrics_instance):
        metrics_instance.inc("status_200")
        metrics_instance.note_unique("device", "dev1")
        metrics_instance.reset()

        assert metrics_instance.get_day(metrics_instance.today()) == {}
        assert metrics_instance.count_uniques("device", metrics_instance.today()) == 0
        assert metrics_instance.get_hourly("status_502", metrics_instance.current_hour()) == 0

        # Still usable after reset
        metrics_instance.inc("status_200")
        assert metrics_instance.get_day(metrics_instance.today())["status_200"] == 1
