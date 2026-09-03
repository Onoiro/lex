"""Тесты для модуля дневных квот."""

import pytest
from proxy.security.quota import DailyQuota


@pytest.fixture
def quota():
    """Fresh DailyQuota instance (10 chars/day) for each test."""
    return DailyQuota(max_chars_per_day=10)


class TestDailyQuota:
    """Тесты DailyQuota."""

    def test_consume_within_limit(self, quota):
        """Списание в пределах лимита разрешено."""
        assert quota.try_consume("192.168.1.1", 5) is True
        assert quota.try_consume("192.168.1.1", 5) is True

    def test_blocks_over_limit(self, quota):
        """Блокирует списание сверх лимита."""
        assert quota.try_consume("192.168.1.1", 7) is True
        assert quota.try_consume("192.168.1.1", 4) is False

    def test_exact_limit_allowed(self, quota):
        """Списание ровно до лимита разрешено."""
        assert quota.try_consume("192.168.1.1", 10) is True
        assert quota.try_consume("192.168.1.1", 1) is False

    def test_different_ips_independent(self, quota):
        """Разные IP имеют независимые квоты."""
        assert quota.try_consume("192.168.1.1", 10) is True
        assert quota.try_consume("192.168.1.2", 10) is True

    def test_remaining(self, quota):
        """remaining() возвращает остаток символов."""
        assert quota.remaining("192.168.1.1") == 10
        quota.try_consume("192.168.1.1", 3)
        assert quota.remaining("192.168.1.1") == 7

    def test_remaining_never_negative(self, quota):
        """remaining() не бывает отрицательным."""
        quota.try_consume("192.168.1.1", 10)
        assert quota.remaining("192.168.1.1") == 0

    def test_remaining_unknown_ip(self, quota):
        """remaining() для неизвестного IP равен полному лимиту."""
        assert quota.remaining("10.0.0.1") == 10

    def test_reset(self, quota):
        """reset() очищает состояние."""
        quota.try_consume("192.168.1.1", 10)
        quota.reset()
        assert quota.remaining("192.168.1.1") == 10
        assert quota.try_consume("192.168.1.1", 10) is True

    def test_day_rollover(self, quota, monkeypatch):
        """При смене UTC-дня учёт начинается заново."""
        quota.try_consume("192.168.1.1", 10)
        assert quota.try_consume("192.168.1.1", 1) is False

        # Подменяем дату на "завтра"
        monkeypatch.setattr(DailyQuota, "_today", staticmethod(lambda: "2000-01-02"))
        assert quota.remaining("192.168.1.1") == 10
        assert quota.try_consume("192.168.1.1", 5) is True
