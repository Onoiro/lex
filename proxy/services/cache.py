"""Модуль кэширования для защиты API квот."""

import time
from typing import Optional
from threading import Lock


class CacheEntry:
    """Элемент кэша с временем жизни."""
    
    def __init__(self, value: str, ttl_seconds: int):
        self.value = value
        self.expires_at = time.time() + ttl_seconds
    
    def is_expired(self) -> bool:
        return time.time() > self.expires_at


class TranslationCache:
    """
    Кэш для переводов слов.
    
    Использует TTL (Time To Live) для автоматической инвалидации записей.
    Потокобезопасен благодаря блокировке.
    """
    
    def __init__(self, ttl_seconds: int = 86400 * 7):
        """
        Инициализация кэша.
        
        Args:
            ttl_seconds: Время жизни записи в секундах (по умолчанию 7 дней).
        """
        self._cache: dict[str, CacheEntry] = {}
        self._lock = Lock()
        self.ttl_seconds = ttl_seconds
    
    def get(self, word: str) -> Optional[str]:
        """
        Получить перевод из кэша.
        
        Args:
            word: Слово для поиска.
            
        Returns:
            Перевод если найден и не истёк, иначе None.
        """
        with self._lock:
            entry = self._cache.get(word)
            if entry is None:
                return None
            
            if entry.is_expired():
                del self._cache[word]
                return None
            
            return entry.value
    
    def set(self, word: str, translation: str) -> None:
        """
        Сохранить перевод в кэш.
        
        Args:
            word: Слово.
            translation: Перевод.
        """
        with self._lock:
            # Очистка устаревших записей при добавлении новой
            self._cleanup()
            self._cache[word] = CacheEntry(translation, self.ttl_seconds)
    
    def _cleanup(self) -> None:
        """Удалить устаревшие записи."""
        expired = [
            key for key, entry in self._cache.items()
            if entry.is_expired()
        ]
        for key in expired:
            del self._cache[key]
    
    def clear(self) -> None:
        """Очистить весь кэш."""
        with self._lock:
            self._cache.clear()
    
    def size(self) -> int:
        """Вернуть количество записей в кэше."""
        with self._lock:
            self._cleanup()
            return len(self._cache)


# Глобальный экземпляр кэша для переводов
translation_cache = TranslationCache(ttl_seconds=86400 * 7)  # 7 дней
