"""Модуль дневных символьных квот для защиты от злоупотреблений."""

import os
import sqlite3
from datetime import datetime, timezone
from threading import Lock
from typing import Optional

from proxy.services.cache import _resolve_db_path


class DailyQuota:
    """
    Дневная символьная квота на IP.

    Учитывает количество символов, израсходованных на фактические вызовы
    внешнего API (кэш не расходует квоту). Окно — календарный день UTC,
    состояние в памяти и сбрасывается при рестарте.
    """

    def __init__(self, max_chars_per_day: int):
        """
        Инициализация квоты.

        Args:
            max_chars_per_day: Максимум символов в день на IP.
        """
        self.max_chars_per_day = max_chars_per_day
        # ip -> (дата UTC "YYYY-MM-DD", израсходованные символы)
        self._usage: dict[str, tuple[str, int]] = {}
        self._lock = Lock()

    @staticmethod
    def _today() -> str:
        """Текущая дата UTC в формате YYYY-MM-DD."""
        return datetime.now(timezone.utc).strftime("%Y-%m-%d")

    def _get_used(self, ip: str) -> int:
        """Израсходованные символы за сегодня (0, если день сменился)."""
        entry = self._usage.get(ip)
        if entry is None or entry[0] != self._today():
            return 0
        return entry[1]

    def remaining(self, ip: str) -> int:
        """
        Оставшиеся символы на сегодня для данного IP.

        Args:
            ip: Идентификатор клиента (обычно IP адрес).
        """
        with self._lock:
            return max(0, self.max_chars_per_day - self._get_used(ip))

    def try_consume(self, ip: str, chars: int) -> bool:
        """
        Попытаться списать символы. Списание атомарно.

        Args:
            ip: Идентификатор клиента.
            chars: Количество символов для списания.

        Returns:
            True если квота позволяет, False если превышена.
        """
        with self._lock:
            used = self._get_used(ip)
            if used + chars > self.max_chars_per_day:
                return False
            self._usage[ip] = (self._today(), used + chars)
            return True

    def reset(self) -> None:
        """Очистить всё состояние (для тестов)."""
        with self._lock:
            self._usage.clear()


class GlobalBudget:
    """
    Глобальный дневной бюджет символов на всех пользователей суммарно.

    Финансовый предохранитель: гарантированно останавливает траты на внешние
    API при превышении дневного лимита. Окно — календарный день UTC,
    состояние в памяти и сбрасывается при рестарте.
    """

    _KEY = "global"

    def __init__(self, max_chars_per_day: int):
        self._quota = DailyQuota(max_chars_per_day=max_chars_per_day)

    def remaining(self) -> int:
        """Оставшиеся символы глобального бюджета на сегодня."""
        return self._quota.remaining(self._KEY)

    def try_consume(self, chars: int) -> bool:
        """
        Попытаться списать символы из глобального бюджета. Списание атомарно.

        Returns:
            True если бюджет позволяет, False если превышен.
        """
        return self._quota.try_consume(self._KEY, chars)

    def reset(self) -> None:
        """Очистить состояние (для тестов)."""
        self._quota.reset()


class PersistentQuotaStore:
    """
    Персистентное хранилище дневных квот в общей SQLite БД.

    Таблица quota_usage (key, day, used). Атомарное списание одним
    условным UPSERT-ом в транзакции. Все сбои БД деградируют до
    in-memory fallback на уровне PersistentDailyQuota, а не до исключений.
    """

    def __init__(self, db_path: Optional[str] = None):
        self._db_path = db_path or _resolve_db_path()
        self._lock = Lock()
        self._init_lock = Lock()
        self._conn: Optional[sqlite3.Connection] = None
        self._init_failed = False

    def _connect(self) -> Optional[sqlite3.Connection]:
        """Лениво открыть БД при первом обращении; None при недоступности."""
        if self._conn is not None or self._init_failed:
            return self._conn
        with self._init_lock:
            if self._conn is not None or self._init_failed:
                return self._conn
            try:
                directory = os.path.dirname(self._db_path)
                if directory:
                    os.makedirs(directory, exist_ok=True)
                conn = sqlite3.connect(self._db_path, check_same_thread=False)
                conn.execute("PRAGMA journal_mode=WAL")
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS quota_usage (
                        key TEXT PRIMARY KEY,
                        day TEXT NOT NULL,
                        used INTEGER NOT NULL
                    )
                    """
                )
                conn.commit()
                self._conn = conn
            except (sqlite3.Error, OSError):
                self._init_failed = True
                self._conn = None
        return self._conn

    def try_consume(self, key: str, day: str, chars: int, limit: int) -> bool:
        """
        Атомарно списать символы, если это не превышает дневной лимит.

        Returns:
            True если списание прошло, False если лимит превышен или БД недоступна.
        """
        if self._connect() is None:
            return False
        with self._lock:
            try:
                # Смена дня: сбрасываем счётчик устаревших записей
                self._conn.execute(
                    "UPDATE quota_usage SET used = 0, day = ? "
                    "WHERE key = ? AND day != ?",
                    (day, key, day),
                )
                cur = self._conn.execute(
                    """
                    INSERT INTO quota_usage (key, day, used)
                    VALUES (?, ?, ?)
                    ON CONFLICT(key) DO UPDATE SET
                        used = used + ?
                        WHERE used + ? <= ?
                    """,
                    (key, day, chars, chars, chars, limit),
                )
                self._conn.commit()
                return cur.rowcount == 1
            except sqlite3.Error:
                return False

    def get_used(self, key: str, day: str) -> int:
        """Израсходованные символы за указанный день (0 при сбое БД)."""
        if self._connect() is None:
            return 0
        with self._lock:
            try:
                row = self._conn.execute(
                    "SELECT used FROM quota_usage WHERE key = ? AND day = ?",
                    (key, day),
                ).fetchone()
                return row[0] if row else 0
            except sqlite3.Error:
                return 0

    def clear(self) -> None:
        """Удалить все записи (для тестов)."""
        if self._connect() is None:
            return
        with self._lock:
            try:
                self._conn.execute("DELETE FROM quota_usage")
                self._conn.commit()
            except sqlite3.Error:
                pass


class PersistentDailyQuota:
    """
    Дневная символьная квота с персистентностью в SQLite.

    Интерфейс совместим с DailyQuota. При недоступной БД деградирует
    до in-memory учёта (квота работает, но не переживает рестарт).
    """

    def __init__(
        self,
        max_chars_per_day: int,
        scope: str,
        store: Optional[PersistentQuotaStore] = None,
    ):
        """
        Args:
            max_chars_per_day: Максимум символов в день на идентификатор.
            scope: Префикс ключа в хранилище (например "tr:dev").
            store: Общее хранилище; по умолчанию создаётся своё.
        """
        self.max_chars_per_day = max_chars_per_day
        self.scope = scope
        self.store = store or PersistentQuotaStore()
        self._fallback = DailyQuota(max_chars_per_day=max_chars_per_day)

    @staticmethod
    def _today() -> str:
        """Текущая дата UTC в формате YYYY-MM-DD."""
        return datetime.now(timezone.utc).strftime("%Y-%m-%d")

    def remaining(self, ident: str) -> int:
        """Оставшиеся символы на сегодня для данного идентификатора."""
        used = self.store.get_used(f"{self.scope}:{ident}", self._today())
        if used == 0 and self.store._init_failed:
            return self._fallback.remaining(ident)
        return max(0, self.max_chars_per_day - used)

    def try_consume(self, ident: str, chars: int) -> bool:
        """
        Попытаться списать символы. Списание атомарно.

        Returns:
            True если квота позволяет, False если превышена.
        """
        if self.store.try_consume(
            f"{self.scope}:{ident}", self._today(), chars, self.max_chars_per_day
        ):
            return True
        if self.store._init_failed:
            return self._fallback.try_consume(ident, chars)
        return False

    def reset(self) -> None:
        """Очистить всё состояние (для тестов)."""
        self.store.clear()
        self._fallback.reset()
