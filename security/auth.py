"""Модуль аутентификации для защиты endpoints."""

import os
import bcrypt
from functools import wraps
from fastapi import HTTPException, status, Request


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Проверка пароля против хеша."""
    password_bytes = plain_password.encode('utf-8')
    hashed_bytes = hashed_password.encode('utf-8')
    return bcrypt.checkpw(password_bytes, hashed_bytes)


def get_password_hash(password: str) -> str:
    """Хеширование пароля."""
    password_bytes = password.encode('utf-8')
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password_bytes, salt)
    return hashed.decode('utf-8')


def get_credentials_from_env() -> tuple[str, str]:
    """
    Получить учётные данные из переменных окружения.
    
    Returns:
        Кортеж (username, password_hash).
        
    Raises:
        HTTPException: Если учётные данные не настроены.
    """
    username = os.getenv("APP_USERNAME")
    password_hash = os.getenv("APP_PASSWORD_HASH")
    
    # Для обратной совместимости: если хеш не задан, используем plain password
    if not password_hash:
        plain_password = os.getenv("APP_PASSWORD")
        if plain_password:
            password_hash = get_password_hash(plain_password)
    
    if not username or not password_hash:
        raise HTTPException(
            status_code=500,
            detail="Аутентификация не настроена. Установите APP_USERNAME и APP_PASSWORD"
        )
    
    return username, password_hash


def require_auth(func):
    """
    Декоратор для защиты endpoint аутентификацией.
    
    Usage:
        @app.post("/add")
        @require_auth
        async def add_word(request: Request, ...):
            ...
    """
    @wraps(func)
    async def wrapper(request: Request, *args, **kwargs):
        # Извлекаем credentials из заголовка Authorization
        auth_header = request.headers.get("Authorization")
        if not auth_header or not auth_header.startswith("Basic "):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Требуется аутентификация",
                headers={"WWW-Authenticate": "Basic"},
            )

        import base64
        try:
            decoded = base64.b64decode(auth_header[6:]).decode("utf-8")
            username, password = decoded.split(":", 1)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Неверный формат авторизации",
                headers={"WWW-Authenticate": "Basic"},
            )

        correct_username, correct_password_hash = get_credentials_from_env()

        if username != correct_username:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Неверное имя пользователя или пароль",
                headers={"WWW-Authenticate": "Basic"},
            )

        if not verify_password(password, correct_password_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Неверное имя пользователя или пароль",
                headers={"WWW-Authenticate": "Basic"},
            )

        return await func(request, *args, **kwargs)

    return wrapper
