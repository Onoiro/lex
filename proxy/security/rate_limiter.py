"""Модуль rate limiting для защиты от злоупотреблений."""

import time
from collections import defaultdict
from functools import wraps
from threading import Lock
from fastapi import HTTPException, Request


class RateLimiter:
    """
    Rate limiter с скользящим окном.
    
    Хранит timestamps запросов для каждого IP и ограничивает количество
    запросов в указанный период времени.
    """

    def __init__(self, max_requests: int, window_seconds: int):
        """
        Инициализация rate limiter.
        
        Args:
            max_requests: Максимальное количество запросов в окно.
            window_seconds: Размер окна в секундах.
        """
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._requests: dict[str, list[float]] = defaultdict(list)
        self._lock = Lock()

    def _clean_old_requests(self, ip: str) -> None:
        """Удалить запросы старше окна."""
        now = time.time()
        cutoff = now - self.window_seconds
        self._requests[ip] = [ts for ts in self._requests[ip] if ts > cutoff]

    def is_allowed(self, ip: str) -> bool:
        """
        Проверить, разрешён ли запрос для данного IP.
        
        Args:
            ip: Идентификатор клиента (обычно IP адрес).
            
        Returns:
            True если запрос разрешён, False если превышен лимит.
        """
        with self._lock:
            self._clean_old_requests(ip)
            
            if len(self._requests[ip]) >= self.max_requests:
                return False
            
            self._requests[ip].append(time.time())
            return True

    def check(self, ip: str) -> None:
        """
        Проверить лимит и выбросить исключение при превышении.
        
        Args:
            ip: Идентификатор клиента.
            
        Raises:
            HTTPException: Если лимит превышен (429 Too Many Requests).
        """
        if not self.is_allowed(ip):
            retry_after = self.window_seconds
            raise HTTPException(
                status_code=429,
                detail="Слишком много запросов. Попробуйте позже.",
                headers={"Retry-After": str(retry_after)}
            )


def get_client_ip(request: Request) -> str:
    """
    Получить IP адрес клиента из запроса.
    
    Учитывает заголовки X-Forwarded-For для работы за proxy (nginx).
    """
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        # X-Forwarded-For может содержать несколько IP: client, proxy1, proxy2
        return forwarded.split(",")[0].strip()
    
    # Fallback на прямой IP
    if request.client:
        return request.client.host
    
    return "unknown"


def rate_limit(limiter: RateLimiter):
    """
    Декоратор для применения rate limiting к endpoint.
    
    Usage:
        @app.post("/add")
        @rate_limit(add_rate_limiter)
        async def add_word(request: Request, ...):
            ...
    """
    def decorator(func):
        @wraps(func)
        async def wrapper(request: Request, *args, **kwargs):
            ip = get_client_ip(request)
            limiter.check(ip)
            return await func(request, *args, **kwargs)
        return wrapper
    return decorator
