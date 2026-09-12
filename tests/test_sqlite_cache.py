"""Tests for the SQLite-backed cache (persistence, TTL, eviction, isolation)."""

import time
import pytest

from proxy.services.cache import SqliteCache, TextCache, TranslationCache


class TestPersistence:
    """Cache survives instance recreation (simulates container restart)."""

    def test_persists_between_instances(self, tmp_path):
        db = str(tmp_path / "cache.db")
        cache1 = TextCache(table="translations", ttl_seconds=60, db_path=db)
        cache1.set("hello", "привет")

        cache2 = TextCache(table="translations", ttl_seconds=60, db_path=db)
        assert cache2.get("hello") == "привет"

    def test_bytes_persist_between_instances(self, tmp_path):
        db = str(tmp_path / "cache.db")
        cache1 = SqliteCache(table="tts_audio", db_path=db)
        cache1.set("en:hello", b"mp3-bytes")

        cache2 = SqliteCache(table="tts_audio", db_path=db)
        assert cache2.get("en:hello") == b"mp3-bytes"


class TestTtl:
    """TTL expiration behavior."""

    def test_expired_entry_returns_none(self, tmp_path):
        cache = TextCache(table="t", ttl_seconds=1, db_path=str(tmp_path / "c.db"))
        cache.set("key", "value")
        assert cache.get("key") == "value"

        time.sleep(1.1)
        assert cache.get("key") is None

    def test_no_ttl_never_expires(self, tmp_path):
        cache = TextCache(table="t", db_path=str(tmp_path / "c.db"))
        cache.set("key", "value")
        assert cache.get("key") == "value"

    def test_expired_rows_deleted_on_set(self, tmp_path):
        cache = TextCache(table="t", ttl_seconds=1, db_path=str(tmp_path / "c.db"))
        cache.set("old", "value")
        time.sleep(1.1)
        cache.set("new", "value")

        assert cache.size() == 1
        assert cache.get("old") is None
        assert cache.get("new") == "value"

    def test_size_excludes_expired(self, tmp_path):
        cache = TextCache(table="t", ttl_seconds=1, db_path=str(tmp_path / "c.db"))
        cache.set("key", "value")
        time.sleep(1.1)
        assert cache.size() == 0


class TestMaxEntries:
    """Eviction of oldest entries when max_entries is exceeded."""

    def test_evicts_oldest(self, tmp_path):
        cache = TextCache(table="t", max_entries=3, db_path=str(tmp_path / "c.db"))
        for i in range(5):
            cache.set(f"key{i}", f"value{i}")

        assert cache.size() == 3
        assert cache.get("key0") is None
        assert cache.get("key1") is None
        assert cache.get("key2") == "value2"
        assert cache.get("key4") == "value4"

    def test_update_refreshes_entry(self, tmp_path):
        cache = TextCache(table="t", max_entries=2, db_path=str(tmp_path / "c.db"))
        cache.set("a", "1")
        cache.set("b", "2")
        cache.set("a", "1-updated")  # a becomes the newest

        assert cache.size() == 2
        assert cache.get("a") == "1-updated"
        assert cache.get("b") == "2"


class TestTableIsolation:
    """Separate tables in the same DB don't interfere."""

    def test_tables_are_isolated(self, tmp_path):
        db = str(tmp_path / "cache.db")
        cache_a = TextCache(table="a", db_path=db)
        cache_b = TextCache(table="b", db_path=db)

        cache_a.set("key", "value-a")
        cache_b.set("key", "value-b")

        assert cache_a.get("key") == "value-a"
        assert cache_b.get("key") == "value-b"

        cache_a.clear()
        assert cache_a.get("key") is None
        assert cache_b.get("key") == "value-b"


class TestGracefulDegradation:
    """Unusable DB path degrades to cache misses instead of raising."""

    def test_unwritable_path_returns_none(self, tmp_path):
        bad_path = str(tmp_path / "no-such-dir" / "sub" / "c.db")
        # Make parent dir a file so makedirs fails
        blocker = tmp_path / "no-such-dir"
        blocker.write_text("not a dir")

        cache = SqliteCache(table="t", db_path=bad_path)
        cache.set("key", "value")  # must not raise
        assert cache.get("key") is None
        assert cache.size() == 0
        cache.clear()  # must not raise


class TestGlobalInstances:
    """Global cache instances use the configured DB path."""

    def test_translation_cache_persists(self, tmp_path, monkeypatch):
        from proxy.services.cache import translation_cache

        monkeypatch.setenv("SQLITE_CACHE_PATH", str(tmp_path / "g.db"))
        fresh = TranslationCache(ttl_seconds=60)
        fresh.set("auto:ru:hello", "привет")
        assert fresh.get("auto:ru:hello") == "привет"

    def test_tts_and_dictionary_caches_are_sqlite(self):
        from proxy.services.tts import speech_cache
        from proxy.services.dictionary import dictionary_cache

        assert isinstance(speech_cache, SqliteCache)
        assert isinstance(dictionary_cache, SqliteCache)
