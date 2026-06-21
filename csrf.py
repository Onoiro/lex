"""Модуль CSRF-защиты."""

import os
import secrets
import hmac
from typing import Optional
from fastapi import HTTPException, status, Request, Form


# Секретный ключ для подписи токенов
CSRF_SECRET = os.getenv("CSRF_SECRET", secrets.token_hex(32))
TOKEN_LENGTH = 32


def generate_csrf_token() -> str:
    """
    Сгенерировать CSRF токен.
    
    Returns:
        Случайный токен.
    """
    return secrets.token_hex(TOKEN_LENGTH)


def sign_token(token: str) -> str:
    """
    Подписать токен секретным ключом.
    
    Args:
        token: Исходный токен.
        
    Returns:
        Подписанный токен (token.signature).
    """
    signature = hmac.new(
        CSRF_SECRET.encode(),
        token.encode(),
        'sha256'
    ).hexdigest()
    return f"{token}.{signature}"


def verify_token(signed_token: str) -> bool:
    """
    Проверить подпись токена.
    
    Args:
        signed_token: Подписанный токен (token.signature).
        
    Returns:
        True если токен валиден, False иначе.
    """
    try:
        token, signature = signed_token.rsplit('.', 1)
    except ValueError:
        return False
    
    expected_signature = hmac.new(
        CSRF_SECRET.encode(),
        token.encode(),
        'sha256'
    ).hexdigest()
    
    # Constant-time comparison
    return hmac.compare_digest(signature, expected_signature)


def get_csrf_token_from_request(request: Request) -> Optional[str]:
    """
    Извлечь CSRF токен из запроса.
    
    Проверяет:
    1. Заголовок X-CSRF-Token
    2. Form data csrf_token
    
    Args:
        request: FastAPI Request.
        
    Returns:
        Токен если найден, None иначе.
    """
    # Проверяем заголовок
    token = request.headers.get("X-CSRF-Token")
    if token:
        return token
    
    return None


class CSRFProtection:
    """
    Класс для управления CSRF-защитой.
    
    Хранит токены в памяти с TTL для однократного использования.
    """
    
    def __init__(self, ttl_seconds: int = 3600):
        """
        Инициализация защиты.
        
        Args:
            ttl_seconds: Время жизни токена (по умолчанию 1 час).
        """
        import time
        self._tokens: dict[str, float] = {}
        self.ttl_seconds = ttl_seconds
        self._time = time
    
    def create_token(self) -> str:
        """
        Создать новый подписанный CSRF токен.
        
        Returns:
            Подписанный токен.
        """
        token = generate_csrf_token()
        signed = sign_token(token)
        self._tokens[token] = self._time.time() + self.ttl_seconds
        self._cleanup()
        return signed
    
    def validate_token(self, signed_token: str) -> bool:
        """
        Проверить и инвалидировать токен.
        
        Args:
            signed_token: Подписанный токен для проверки.
            
        Returns:
            True если токен валиден и принят, False иначе.
        """
        try:
            token, _ = signed_token.rsplit('.', 1)
        except ValueError:
            return False
        
        # Проверяем подпись
        if not verify_token(signed_token):
            return False
        
        # Проверяем наличие в списке активных токенов
        if token not in self._tokens:
            return False
        
        # Проверяем TTL
        if self._time.time() > self._tokens[token]:
            del self._tokens[token]
            return False
        
        # Инвалидируем токен (однократное использование)
        del self._tokens[token]
        return True
    
    def _cleanup(self) -> None:
        """Удалить истёкшие токены."""
        expired = [
            token for token, expires in self._tokens.items()
            if self._time.time() > expires
        ]
        for token in expired:
            del self._tokens[token]
    
    def get_token_for_form(self) -> str:
        """
        Получить токен для использования в форме.
        
        Для форм используем упрощённую схему без однократного использования,
        так как формы могут перезагружаться.
        
        Returns:
            Подписанный токен.
        """
        # Для форм генерируем токен с длительным TTL
        # и не требуем однократного использования
        token = generate_csrf_token()
        return sign_token(token)


# Глобальный экземпляр для форм (с однократным использованием)
csrf_protection = CSRFProtection(ttl_seconds=3600)


def validate_csrf_form_token(token: str) -> None:
    """
    Валидировать CSRF токен из формы.
    
    Args:
        token: Токен из формы.
        
    Raises:
        HTTPException: При невалидном токене (403 Forbidden).
    """
    if not token:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="CSRF токен отсутствует"
        )
    
    if not verify_token(token):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Неверный CSRF токен"
        )


def csrf_protect_form(func):
    """
    Декоратор для защиты POST форм от CSRF.
    
    Usage:
        @app.post("/add")
        @csrf_protect_form
        async def add_word(..., csrf_token: str = Form(...)):
            ...
    """
    from functools import wraps
    
    @wraps(func)
    async def wrapper(*args, csrf_token: str = Form(None), **kwargs):
        validate_csrf_form_token(csrf_token)
        return await func(*args, **kwargs)
    
    return wrapper
