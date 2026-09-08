"""Модуль дневных символьных квот для защиты от злоупотреблений."""

from datetime import datetime, timezone
from threading import Lock


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
