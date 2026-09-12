"""Тесты для модуля дневных квот."""

import pytest
from proxy.security.quota import DailyQuota, GlobalBudget, PersistentQuotaStore, PersistentDailyQuota


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


@pytest.fixture
def budget():
    """Fresh GlobalBudget instance (10 chars/day) for each test."""
    return GlobalBudget(max_chars_per_day=10)


class TestGlobalBudget:
    """Тесты GlobalBudget."""

    def test_consume_within_limit(self, budget):
        """Списание в пределах лимита разрешено."""
        assert budget.try_consume(5) is True
        assert budget.try_consume(5) is True

    def test_blocks_over_limit(self, budget):
        """Блокирует списание сверх лимита."""
        assert budget.try_consume(7) is True
        assert budget.try_consume(4) is False

    def test_remaining(self, budget):
        """remaining() возвращает остаток символов."""
        assert budget.remaining() == 10
        budget.try_consume(3)
        assert budget.remaining() == 7

    def test_remaining_never_negative(self, budget):
        """remaining() не бывает отрицательным."""
        budget.try_consume(10)
        assert budget.remaining() == 0

    def test_reset(self, budget):
        """reset() очищает состояние."""
        budget.try_consume(10)
        budget.reset()
        assert budget.remaining() == 10
        assert budget.try_consume(10) is True

    def test_day_rollover(self, budget, monkeypatch):
        """При смене UTC-дня учёт начинается заново."""
        budget.try_consume(10)
        assert budget.try_consume(1) is False

        monkeypatch.setattr(DailyQuota, "_today", staticmethod(lambda: "2000-01-02"))
        assert budget.remaining() == 10
        assert budget.try_consume(5) is True


@pytest.fixture
def store(tmp_path):
    """Fresh PersistentQuotaStore on a temp DB for each test."""
    return PersistentQuotaStore(db_path=str(tmp_path / "quota.db"))


class TestPersistentQuotaStore:
    """Тесты PersistentQuotaStore."""

    def test_try_consume_within_limit(self, store):
        """Списание в пределах лимита разрешено."""
        assert store.try_consume("tr:dev:dev1", "2026-09-12", 5, 10) is True
        assert store.try_consume("tr:dev:dev1", "2026-09-12", 5, 10) is True

    def test_try_consume_over_limit(self, store):
        """Блокирует списание сверх лимита."""
        assert store.try_consume("tr:dev:dev1", "2026-09-12", 7, 10) is True
        assert store.try_consume("tr:dev:dev1", "2026-09-12", 4, 10) is False

    def test_try_consume_exact_limit(self, store):
        """Списание ровно до лимита разрешено."""
        assert store.try_consume("tr:dev:dev1", "2026-09-12", 10, 10) is True
        assert store.try_consume("tr:dev:dev1", "2026-09-12", 1, 10) is False

    def test_get_used(self, store):
        """get_used возвращает израсходованные символы за день."""
        store.try_consume("tr:dev:dev1", "2026-09-12", 3, 10)
        assert store.get_used("tr:dev:dev1", "2026-09-12") == 3
        assert store.get_used("tr:dev:dev1", "2026-09-13") == 0
        assert store.get_used("tr:dev:unknown", "2026-09-12") == 0

    def test_day_rollover_resets_counter(self, store):
        """При смене дня счётчик сбрасывается при следующем списании."""
        store.try_consume("tr:dev:dev1", "2026-09-12", 10, 10)
        assert store.try_consume("tr:dev:dev1", "2026-09-12", 1, 10) is False
        assert store.try_consume("tr:dev:dev1", "2026-09-13", 10, 10) is True
        assert store.get_used("tr:dev:dev1", "2026-09-13") == 10

    def test_keys_are_isolated(self, store):
        """Разные ключи имеют независимые счётчики."""
        assert store.try_consume("tr:dev:a", "2026-09-12", 10, 10) is True
        assert store.try_consume("tr:dev:b", "2026-09-12", 10, 10) is True
        assert store.try_consume("tts:dev:a", "2026-09-12", 10, 10) is True

    def test_persists_between_store_instances(self, tmp_path):
        """Состояние переживает пересоздание store (симуляция рестарта)."""
        db = str(tmp_path / "quota.db")
        store1 = PersistentQuotaStore(db_path=db)
        store1.try_consume("tr:dev:dev1", "2026-09-12", 4, 10)

        store2 = PersistentQuotaStore(db_path=db)
        assert store2.get_used("tr:dev:dev1", "2026-09-12") == 4
        assert store2.try_consume("tr:dev:dev1", "2026-09-12", 7, 10) is False
        assert store2.try_consume("tr:dev:dev1", "2026-09-12", 6, 10) is True

    def test_clear(self, store):
        """clear() удаляет все записи."""
        store.try_consume("tr:dev:dev1", "2026-09-12", 5, 10)
        store.clear()
        assert store.get_used("tr:dev:dev1", "2026-09-12") == 0

    def test_unwritable_path_degrades(self, tmp_path):
        """Недоступная БД: списание запрещено, исключений нет."""
        blocker = tmp_path / "no-such-dir"
        blocker.write_text("not a dir")
        bad_store = PersistentQuotaStore(
            db_path=str(tmp_path / "no-such-dir" / "sub" / "quota.db")
        )
        assert bad_store.try_consume("tr:dev:dev1", "2026-09-12", 5, 10) is False
        assert bad_store.get_used("tr:dev:dev1", "2026-09-12") == 0
        bad_store.clear()  # must not raise


class TestPersistentDailyQuota:
    """Тесты PersistentDailyQuota."""

    def test_consume_and_remaining(self, store):
        """Списание и остаток работают как у DailyQuota."""
        quota = PersistentDailyQuota(10, "tr:dev", store)
        assert quota.try_consume("dev1", 3) is True
        assert quota.remaining("dev1") == 7
        assert quota.remaining("dev2") == 10

    def test_blocks_over_limit(self, store):
        """Блокирует списание сверх лимита."""
        quota = PersistentDailyQuota(10, "tr:dev", store)
        assert quota.try_consume("dev1", 10) is True
        assert quota.try_consume("dev1", 1) is False

    def test_scope_isolation(self, store):
        """Разные scope имеют независимые счётчики."""
        tr = PersistentDailyQuota(10, "tr:dev", store)
        tts = PersistentDailyQuota(10, "tts:dev", store)
        assert tr.try_consume("dev1", 10) is True
        assert tts.try_consume("dev1", 10) is True

    def test_persists_between_quota_instances(self, tmp_path):
        """Квота переживает пересоздание (симуляция рестарта)."""
        db = str(tmp_path / "quota.db")
        shared = PersistentQuotaStore(db_path=db)
        q1 = PersistentDailyQuota(10, "tr:dev", shared)
        q1.try_consume("dev1", 6)

        q2 = PersistentDailyQuota(10, "tr:dev", PersistentQuotaStore(db_path=db))
        assert q2.remaining("dev1") == 4
        assert q2.try_consume("dev1", 5) is False
        assert q2.try_consume("dev1", 4) is True

    def test_day_rollover(self, store, monkeypatch):
        """При смене UTC-дня учёт начинается заново."""
        quota = PersistentDailyQuota(10, "tr:dev", store)
        quota.try_consume("dev1", 10)
        assert quota.try_consume("dev1", 1) is False

        monkeypatch.setattr(
            PersistentDailyQuota, "_today", staticmethod(lambda: "2000-01-02")
        )
        assert quota.remaining("dev1") == 10
        assert quota.try_consume("dev1", 5) is True

    def test_reset(self, store):
        """reset() очищает и хранилище, и fallback."""
        quota = PersistentDailyQuota(10, "tr:dev", store)
        quota.try_consume("dev1", 10)
        quota.reset()
        assert quota.remaining("dev1") == 10
        assert quota.try_consume("dev1", 10) is True

    def test_graceful_degradation_to_memory(self, tmp_path):
        """При недоступной БД квота работает через in-memory fallback."""
        blocker = tmp_path / "no-such-dir"
        blocker.write_text("not a dir")
        bad_store = PersistentQuotaStore(
            db_path=str(tmp_path / "no-such-dir" / "sub" / "quota.db")
        )
        quota = PersistentDailyQuota(10, "tr:dev", bad_store)

        assert quota.try_consume("dev1", 5) is True
        assert quota.try_consume("dev1", 6) is False
        assert quota.remaining("dev1") == 5
