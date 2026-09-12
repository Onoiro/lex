"""Тесты для модуля кэширования."""

import time
import pytest
from proxy.services.cache import TranslationCache


class TestTranslationCache:
    """Тесты кэша переводов."""

    @pytest.fixture
    def cache(self, tmp_path):
        return TranslationCache(ttl_seconds=60, db_path=str(tmp_path / "c.db"))

    def test_set_and_get(self, cache):
        """Установка и получение значения."""
        cache.set("hello", "привет")
        assert cache.get("hello") == "привет"

    def test_get_missing_key(self, cache):
        """Получение отсутствующего ключа."""
        assert cache.get("nonexistent") is None

    def test_ttl_expiration(self, tmp_path):
        """Истечение времени жизни записи."""
        cache = TranslationCache(ttl_seconds=1, db_path=str(tmp_path / "c.db"))

        cache.set("hello", "привет")
        assert cache.get("hello") == "привет"

        time.sleep(1.1)  # Ждём истечения TTL

        assert cache.get("hello") is None

    def test_overwrite(self, cache):
        """Перезапись значения."""
        cache.set("hello", "привет")
        cache.set("hello", "здравствуй")

        assert cache.get("hello") == "здравствуй"

    def test_clear(self, cache):
        """Очистка кэша."""
        cache.set("hello", "привет")
        cache.set("world", "мир")

        assert cache.size() == 2

        cache.clear()

        assert cache.size() == 0
        assert cache.get("hello") is None

    def test_size(self, cache):
        """Размер кэша."""
        assert cache.size() == 0

        cache.set("one", "1")
        assert cache.size() == 1

        cache.set("two", "2")
        assert cache.size() == 2

    def test_auto_cleanup_on_set(self, tmp_path):
        """Автоматическая очистка при добавлении."""
        cache = TranslationCache(ttl_seconds=1, db_path=str(tmp_path / "c.db"))

        cache.set("hello", "привет")
        time.sleep(1.1)

        # Добавляем новую запись, должна сработать очистка
        cache.set("world", "мир")

        assert cache.get("hello") is None
        assert cache.get("world") == "мир"

    def test_thread_safety(self, cache):
        """Потокобезопасность (базовый тест)."""
        import threading

        errors = []

        def worker(n):
            try:
                for i in range(100):
                    cache.set(f"key_{n}_{i}", f"value_{i}")
                    cache.get(f"key_{n}_{i}")
            except Exception as e:
                errors.append(e)

        threads = [threading.Thread(target=worker, args=(i,)) for i in range(5)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert len(errors) == 0, f"Errors occurred: {errors}"
        assert cache.size() > 0