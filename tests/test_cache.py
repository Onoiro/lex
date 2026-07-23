"""Тесты для модуля кэширования."""

import time
from proxy.services.cache import CacheEntry, TranslationCache


class TestCacheEntry:
    """Тесты элемента кэша."""

    def test_entry_not_expired(self):
        """Запись не истекла."""
        entry = CacheEntry("translation", ttl_seconds=60)
        assert entry.is_expired() is False
        assert entry.value == "translation"

    def test_entry_expired(self):
        """Запись истекла."""
        entry = CacheEntry("translation", ttl_seconds=0)
        time.sleep(0.1)  # Небольшая задержка
        assert entry.is_expired() is True


class TestTranslationCache:
    """Тесты кэша переводов."""

    def test_set_and_get(self):
        """Установка и получение значения."""
        cache = TranslationCache(ttl_seconds=60)
        
        cache.set("hello", "привет")
        assert cache.get("hello") == "привет"

    def test_get_missing_key(self):
        """Получение отсутствующего ключа."""
        cache = TranslationCache(ttl_seconds=60)
        
        assert cache.get("nonexistent") is None

    def test_ttl_expiration(self):
        """Истечение времени жизни записи."""
        cache = TranslationCache(ttl_seconds=1)
        
        cache.set("hello", "привет")
        assert cache.get("hello") == "привет"
        
        time.sleep(1.1)  # Ждём истечения TTL
        
        assert cache.get("hello") is None

    def test_overwrite(self):
        """Перезапись значения."""
        cache = TranslationCache(ttl_seconds=60)
        
        cache.set("hello", "привет")
        cache.set("hello", "здравствуй")
        
        assert cache.get("hello") == "здравствуй"

    def test_clear(self):
        """Очистка кэша."""
        cache = TranslationCache(ttl_seconds=60)
        
        cache.set("hello", "привет")
        cache.set("world", "мир")
        
        assert cache.size() == 2
        
        cache.clear()
        
        assert cache.size() == 0
        assert cache.get("hello") is None

    def test_size(self):
        """Размер кэша."""
        cache = TranslationCache(ttl_seconds=60)
        
        assert cache.size() == 0
        
        cache.set("one", "1")
        assert cache.size() == 1
        
        cache.set("two", "2")
        assert cache.size() == 2

    def test_auto_cleanup_on_set(self):
        """Автоматическая очистка при добавлении."""
        cache = TranslationCache(ttl_seconds=1)
        
        cache.set("hello", "привет")
        time.sleep(1.1)
        
        # Добавляем новую запись, должна сработать очистка
        cache.set("world", "мир")
        
        assert cache.get("hello") is None
        assert cache.get("world") == "мир"

    def test_thread_safety(self):
        """Потокобезопасность (базовый тест)."""
        import threading
        
        cache = TranslationCache(ttl_seconds=60)
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
