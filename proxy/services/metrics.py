"""In-memory counters with daily SQLite persistence for observability.

Aggregates only (no request content): status codes, request counts, spent
chars, cache hits, unique devices/IPs. Counters live in memory (cheap dict
ops) and are persisted incrementally to the shared SQLite DB (same file as
the caches, SQLITE_CACHE_PATH) so the daily report survives restarts.
All DB failures degrade gracefully — metrics must never break responses.
"""

import os
import sqlite3
from datetime import datetime, timezone
from threading import Lock
from typing import Optional

from proxy.services.cache import _resolve_db_path
from proxy.services import notifier


class Metrics:
    """Counters, hourly buckets and daily aggregates in one SQLite DB.

    Thread-safe: one shared connection guarded by a Lock (same pattern as
    SqliteCache / PersistentQuotaStore). The DB path is resolved lazily on
    first use so the SQLITE_CACHE_PATH env var is honored even when the
    module is imported before the env is set (e.g. pytest collection).
    """

    def __init__(self, db_path: Optional[str] = None):
        self._explicit_db_path = db_path
        self._db_path: Optional[str] = None
        self._lock = Lock()
        self._init_lock = Lock()
        self._conn: Optional[sqlite3.Connection] = None
        self._init_failed = False
        # In-memory state (fast path, per process)
        self._counters: dict[str, int] = {}
        self._hourly: dict[tuple[str, str], int] = {}
        self._seen_uniques: set[tuple[str, str, str]] = set()
        self._fallback_alerted: set[str] = set()

    @staticmethod
    def today() -> str:
        """Current UTC date as YYYY-MM-DD."""
        return datetime.now(timezone.utc).strftime("%Y-%m-%d")

    @staticmethod
    def current_hour() -> str:
        """Current UTC hour bucket as YYYY-MM-DDTHH."""
        return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H")

    def _connect(self) -> Optional[sqlite3.Connection]:
        """Lazily open the DB on first use; None if unavailable."""
        if self._conn is not None or self._init_failed:
            return self._conn
        with self._init_lock:
            if self._conn is not None or self._init_failed:
                return self._conn
            try:
                self._db_path = self._explicit_db_path or _resolve_db_path()
                directory = os.path.dirname(self._db_path)
                if directory:
                    os.makedirs(directory, exist_ok=True)
                conn = sqlite3.connect(self._db_path, check_same_thread=False)
                conn.execute("PRAGMA journal_mode=WAL")
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS metrics_daily (
                        day TEXT NOT NULL,
                        key TEXT NOT NULL,
                        value INTEGER NOT NULL,
                        PRIMARY KEY (day, key)
                    )
                    """
                )
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS metrics_uniques (
                        day TEXT NOT NULL,
                        kind TEXT NOT NULL,
                        ident TEXT NOT NULL,
                        PRIMARY KEY (day, kind, ident)
                    )
                    """
                )
                conn.commit()
                self._conn = conn
            except (sqlite3.Error, OSError):
                self._init_failed = True
                self._conn = None
        return self._conn

    def _bump_daily(self, day: str, key: str, n: int) -> None:
        """Atomic UPSERT-increment of a daily counter (caller holds the lock)."""
        if self._conn is None:
            return
        try:
            self._conn.execute(
                """
                INSERT INTO metrics_daily (day, key, value)
                VALUES (?, ?, ?)
                ON CONFLICT(day, key) DO UPDATE SET
                    value = value + excluded.value
                """,
                (day, key, n),
            )
            self._conn.commit()
        except sqlite3.Error:
            pass

    def inc(self, key: str, n: int = 1) -> None:
        """Increment a counter for today (in memory + SQLite)."""
        day = self.today()
        with self._lock:
            self._counters[key] = self._counters.get(key, 0) + n
            if self._connect() is not None:
                self._bump_daily(day, key, n)

    def inc_hourly(self, key: str) -> int:
        """Increment the current UTC hour bucket; returns the new value.

        The returned value lets callers fire a spike alert exactly when the
        bucket reaches the threshold (built-in once-per-bucket dedup).
        """
        hour = self.current_hour()
        with self._lock:
            bucket = (hour, key)
            self._hourly[bucket] = self._hourly.get(bucket, 0) + 1
            return self._hourly[bucket]

    def get_hourly(self, key: str, hour: str) -> int:
        """Value of an hour bucket (0 if unknown)."""
        with self._lock:
            return self._hourly.get((hour, key), 0)

    def note_unique(self, kind: str, ident: str) -> None:
        """Record a unique device/IP for today.

        The DB row is written only on the first appearance in this process
        (in-memory set), not on every request.
        """
        day = self.today()
        entry = (day, kind, ident)
        with self._lock:
            if entry in self._seen_uniques:
                return
            self._seen_uniques.add(entry)
            if self._connect() is None:
                return
            try:
                self._conn.execute(
                    "INSERT OR IGNORE INTO metrics_uniques (day, kind, ident) "
                    "VALUES (?, ?, ?)",
                    (day, kind, ident),
                )
                self._conn.commit()
            except sqlite3.Error:
                pass

    def count_uniques(self, kind: str, day: str) -> int:
        """Number of unique devices/IPs recorded for a day."""
        if self._connect() is None:
            return 0
        with self._lock:
            try:
                row = self._conn.execute(
                    "SELECT COUNT(*) FROM metrics_uniques WHERE day = ? AND kind = ?",
                    (day, kind),
                ).fetchone()
                return row[0]
            except sqlite3.Error:
                return 0

    def note_db_fallback(self) -> None:
        """Hook for caches/quotas: SQLite became unavailable, alert once/day."""
        self.inc("db_fallback")
        day = self.today()
        with self._lock:
            if day in self._fallback_alerted:
                return
            self._fallback_alerted.add(day)
        notifier.notify(
            "⚠️ SQLite недоступна: кэш/квоты деградировали до in-memory",
            dedup_key=f"sqlite_fallback:{day}",
            cooldown_hours=24,
        )

    def get_day(self, day: str) -> dict[str, int]:
        """All daily counters for a day (empty dict on DB failure)."""
        if self._connect() is None:
            return {}
        with self._lock:
            try:
                rows = self._conn.execute(
                    "SELECT key, value FROM metrics_daily WHERE day = ?",
                    (day,),
                ).fetchall()
                return {key: value for key, value in rows}
            except sqlite3.Error:
                return {}

    def reset(self) -> None:
        """Clear all state (for tests). Closes the connection so the next
        use reconnects (and recreates the DB file if pytest removed it)."""
        with self._lock:
            self._counters.clear()
            self._hourly.clear()
            self._seen_uniques.clear()
            self._fallback_alerted.clear()
            if self._conn is not None:
                try:
                    self._conn.execute("DELETE FROM metrics_daily")
                    self._conn.execute("DELETE FROM metrics_uniques")
                    self._conn.commit()
                    self._conn.close()
                except sqlite3.Error:
                    pass
                self._conn = None
            self._init_failed = False


# Global metrics instance (singleton)
metrics = Metrics()
