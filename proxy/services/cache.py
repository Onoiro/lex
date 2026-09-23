"""SQLite-backed caching for proxy services.

Persistent caches survive container restarts, so the same word is translated
via the Yandex API only once per server lifetime. The database file lives in
a Docker volume (see docker-compose.yml); path is configurable via the
SQLITE_CACHE_PATH env var (default: data/cache.db).
"""

import os
import sqlite3
import time
from threading import Lock
from typing import Optional

# Default DB path relative to the working directory (/app/data inside Docker).
DEFAULT_DB_PATH = "data/cache.db"


def _resolve_db_path() -> str:
    """Resolve the cache DB path from SQLITE_CACHE_PATH or the default."""
    return os.getenv("SQLITE_CACHE_PATH", DEFAULT_DB_PATH)


class SqliteCache:
    """Persistent key-value cache backed by a single SQLite table.

    Thread-safe: one shared connection guarded by a Lock. All failures
    (missing file, corrupted DB, read-only filesystem) degrade gracefully
    to cache misses instead of raising.
    """

    def __init__(
        self,
        table: str,
        ttl_seconds: Optional[int] = None,
        max_entries: Optional[int] = None,
        db_path: Optional[str] = None,
    ):
        """
        Args:
            table: SQLite table name (isolates caches within one DB).
            ttl_seconds: Entry time-to-live in seconds; None = no expiry.
            max_entries: Max entries; oldest (by insertion) evicted. None = unlimited.
            db_path: Explicit DB path; defaults to SQLITE_CACHE_PATH env or
                DEFAULT_DB_PATH.
        """
        self.table = table
        self.ttl_seconds = ttl_seconds
        self.max_entries = max_entries
        self._db_path = db_path or _resolve_db_path()
        self._lock = Lock()
        self._init_lock = Lock()
        self._conn: Optional[sqlite3.Connection] = None
        self._init_failed = False

    def _connect(self) -> Optional[sqlite3.Connection]:
        """Lazily open the DB on first use; None if unavailable.

        Guarded by a dedicated lock: concurrent first calls (e.g. WAL pragma
        racing on a fresh DB) must not corrupt each other's connection.
        """
        if self._conn is not None or self._init_failed:
            return self._conn
        with self._init_lock:
            if self._conn is not None or self._init_failed:
                return self._conn
            try:
                directory = os.path.dirname(self._db_path)
                if directory:
                    os.makedirs(directory, exist_ok=True)
                conn = sqlite3.connect(
                    self._db_path, check_same_thread=False
                )
                conn.execute("PRAGMA journal_mode=WAL")
                conn.execute(
                    f"""
                    CREATE TABLE IF NOT EXISTS {self.table} (
                        key TEXT PRIMARY KEY,
                        value BLOB NOT NULL,
                        expires_at REAL,
                        created_at REAL NOT NULL
                    )
                    """
                )
                conn.commit()
                self._conn = conn
            except (sqlite3.Error, OSError):
                self._init_failed = True
                self._conn = None
                _note_db_fallback()
        return self._conn

    def _is_expired(self, expires_at: Optional[float]) -> bool:
        if expires_at is None:
            return False
        return time.time() > expires_at

    def get(self, key: str) -> Optional[bytes]:
        """Return the cached value, or None if missing/expired/DB unavailable."""
        if self._connect() is None:
            return None
        with self._lock:
            try:
                row = self._conn.execute(
                    f"SELECT value, expires_at FROM {self.table} WHERE key = ?",
                    (key,),
                ).fetchone()
            except sqlite3.Error:
                return None
            if row is None:
                return None
            value, expires_at = row
            if self._is_expired(expires_at):
                try:
                    self._conn.execute(
                        f"DELETE FROM {self.table} WHERE key = ?", (key,)
                    )
                    self._conn.commit()
                except sqlite3.Error:
                    pass
                return None
            return bytes(value)

    def set(self, key: str, value: bytes) -> None:
        """Store a value; cleans up expired entries and enforces max_entries."""
        if self._connect() is None:
            return
        expires_at = (
            time.time() + self.ttl_seconds if self.ttl_seconds is not None else None
        )
        with self._lock:
            try:
                self._cleanup_expired()
                self._conn.execute(
                    f"""
                    INSERT INTO {self.table} (key, value, expires_at, created_at)
                    VALUES (?, ?, ?, ?)
                    ON CONFLICT(key) DO UPDATE SET
                        value = excluded.value,
                        expires_at = excluded.expires_at,
                        created_at = excluded.created_at
                    """,
                    (key, sqlite3.Binary(value), expires_at, time.time()),
                )
                self._evict_oldest()
                self._conn.commit()
            except sqlite3.Error:
                pass

    def _cleanup_expired(self) -> None:
        """Delete expired rows (caller holds the lock)."""
        if self.ttl_seconds is None:
            return
        self._conn.execute(
            f"DELETE FROM {self.table} WHERE expires_at IS NOT NULL AND expires_at < ?",
            (time.time(),),
        )

    def _evict_oldest(self) -> None:
        """Enforce max_entries by deleting the oldest rows (caller holds the lock)."""
        if self.max_entries is None:
            return
        self._conn.execute(
            f"""
            DELETE FROM {self.table} WHERE key IN (
                SELECT key FROM {self.table} ORDER BY created_at DESC
                LIMIT -1 OFFSET ?
            )
            """,
            (self.max_entries,),
        )

    def clear(self) -> None:
        """Delete all entries in this cache's table."""
        if self._connect() is None:
            return
        with self._lock:
            try:
                self._conn.execute(f"DELETE FROM {self.table}")
                self._conn.commit()
            except sqlite3.Error:
                pass

    def size(self) -> int:
        """Return the number of non-expired entries."""
        if self._connect() is None:
            return 0
        with self._lock:
            try:
                if self.ttl_seconds is None:
                    row = self._conn.execute(
                        f"SELECT COUNT(*) FROM {self.table}"
                    ).fetchone()
                else:
                    row = self._conn.execute(
                        f"SELECT COUNT(*) FROM {self.table} "
                        "WHERE expires_at IS NULL OR expires_at >= ?",
                        (time.time(),),
                    ).fetchone()
                return row[0]
            except sqlite3.Error:
                return 0


class TextCache(SqliteCache):
    """SqliteCache variant that stores and returns UTF-8 text."""

    def get(self, key: str) -> Optional[str]:
        value = super().get(key)
        if value is None:
            return None
        return value.decode("utf-8")

    def set(self, key: str, value: str) -> None:
        super().set(key, value.encode("utf-8"))


class TranslationCache(TextCache):
    """Persistent cache for translations (kept name for backward compatibility)."""

    def __init__(self, ttl_seconds: int = 86400 * 7, db_path: Optional[str] = None):
        super().__init__(
            table="translations", ttl_seconds=ttl_seconds, db_path=db_path
        )


# Global cache instance for translations (7 days TTL)
translation_cache = TranslationCache(ttl_seconds=86400 * 7)


def _note_db_fallback() -> None:
    """Notify metrics that SQLite became unavailable (alert once per day).

    Imported lazily to avoid a circular import (metrics imports cache).
    """
    try:
        from proxy.services.metrics import metrics

        metrics.note_db_fallback()
    except Exception:
        pass  # Metrics must never break the cache.