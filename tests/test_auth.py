"""Тесты для модуля аутентификации."""

import pytest
from fastapi import HTTPException, status
from security.auth import (
    verify_password,
    get_password_hash,
    get_credentials_from_env,
    require_auth,
)


class TestPasswordHashing:
    """Тесты хеширования паролей."""

    def test_hash_and_verify(self):
        """Хеширование и проверка пароля."""
        password = "test_password123"
        hashed = get_password_hash(password)
        
        assert hashed != password  # Хеш не равен паролю
        assert verify_password(password, hashed) is True

    def test_verify_wrong_password(self):
        """Проверка неверного пароля."""
        password = "test_password123"
        hashed = get_password_hash(password)
        
        assert verify_password("wrong_password", hashed) is False

    def test_hash_is_different_each_time(self):
        """Хеши одного пароля разные (из-за соли)."""
        password = "test_password123"
        hash1 = get_password_hash(password)
        hash2 = get_password_hash(password)
        
        assert hash1 != hash2  # Разные соли
        assert verify_password(password, hash1) is True
        assert verify_password(password, hash2) is True


class TestGetCredentialsFromEnv:
    """Тесты получения учётных данных из env."""

    def test_missing_env_raises(self, monkeypatch):
        """Отсутствие переменных окружения вызывает ошибку."""
        monkeypatch.delenv("APP_USERNAME", raising=False)
        monkeypatch.delenv("APP_PASSWORD", raising=False)
        monkeypatch.delenv("APP_PASSWORD_HASH", raising=False)
        
        with pytest.raises(HTTPException) as exc_info:
            get_credentials_from_env()
        
        assert exc_info.value.status_code == 500
        assert "не настроена" in exc_info.value.detail.lower()

    def test_username_only_raises(self, monkeypatch):
        """Только имя пользователя без пароля вызывает ошибку."""
        monkeypatch.setenv("APP_USERNAME", "admin")
        monkeypatch.delenv("APP_PASSWORD", raising=False)
        monkeypatch.delenv("APP_PASSWORD_HASH", raising=False)
        
        with pytest.raises(HTTPException) as exc_info:
            get_credentials_from_env()
        
        assert exc_info.value.status_code == 500

    def test_with_password_hash(self, monkeypatch):
        """Использование APP_PASSWORD_HASH."""
        from security.auth import get_password_hash
        
        monkeypatch.setenv("APP_USERNAME", "testuser")
        monkeypatch.setenv("APP_PASSWORD_HASH", get_password_hash("testpass"))
        monkeypatch.delenv("APP_PASSWORD", raising=False)
        
        username, password_hash = get_credentials_from_env()
        
        assert username == "testuser"
        assert verify_password("testpass", password_hash) is True

    def test_with_plain_password(self, monkeypatch):
        """Использование APP_PASSWORD (для обратной совместимости)."""
        monkeypatch.setenv("APP_USERNAME", "testuser")
        monkeypatch.setenv("APP_PASSWORD", "testpass")
        monkeypatch.delenv("APP_PASSWORD_HASH", raising=False)
        
        username, password_hash = get_credentials_from_env()
        
        assert username == "testuser"
        assert verify_password("testpass", password_hash) is True


class TestRequireAuth:
    """Тесты декоратора аутентификации."""

    @pytest.mark.anyio
    async def test_missing_auth_header(self, monkeypatch):
        """Отсутствие заголовка Authorization вызывает 401."""
        from security.auth import get_password_hash
        from unittest.mock import Mock
        
        monkeypatch.setenv("APP_USERNAME", "admin")
        monkeypatch.setenv("APP_PASSWORD_HASH", get_password_hash("password"))
        
        @require_auth
        async def dummy_endpoint(request):
            return {"ok": True}
        
        mock_request = Mock()
        mock_request.headers = {}
        
        with pytest.raises(HTTPException) as exc_info:
            await dummy_endpoint(mock_request)
        
        assert exc_info.value.status_code == status.HTTP_401_UNAUTHORIZED

    @pytest.mark.anyio
    async def test_invalid_auth_header_format(self, monkeypatch):
        """Неверный формат Authorization вызывает 401."""
        from security.auth import get_password_hash
        from unittest.mock import Mock
        
        monkeypatch.setenv("APP_USERNAME", "admin")
        monkeypatch.setenv("APP_PASSWORD_HASH", get_password_hash("password"))
        
        @require_auth
        async def dummy_endpoint(request):
            return {"ok": True}
        
        mock_request = Mock()
        mock_request.headers = {"Authorization": "InvalidFormat"}
        
        with pytest.raises(HTTPException) as exc_info:
            await dummy_endpoint(mock_request)
        
        assert exc_info.value.status_code == status.HTTP_401_UNAUTHORIZED

    @pytest.mark.anyio
    async def test_wrong_username(self, monkeypatch):
        """Неверное имя пользователя вызывает 401."""
        from security.auth import get_password_hash
        import base64
        from unittest.mock import Mock
        
        monkeypatch.setenv("APP_USERNAME", "admin")
        monkeypatch.setenv("APP_PASSWORD_HASH", get_password_hash("password"))
        
        @require_auth
        async def dummy_endpoint(request):
            return {"ok": True}
        
        credentials = base64.b64encode(b"wronguser:password").decode()
        
        mock_request = Mock()
        mock_request.headers = {"Authorization": f"Basic {credentials}"}
        
        with pytest.raises(HTTPException) as exc_info:
            await dummy_endpoint(mock_request)
        
        assert exc_info.value.status_code == status.HTTP_401_UNAUTHORIZED

    @pytest.mark.anyio
    async def test_wrong_password(self, monkeypatch):
        """Неверный пароль вызывает 401."""
        from security.auth import get_password_hash
        import base64
        from unittest.mock import Mock
        
        monkeypatch.setenv("APP_USERNAME", "admin")
        monkeypatch.setenv("APP_PASSWORD_HASH", get_password_hash("password"))
        
        @require_auth
        async def dummy_endpoint(request):
            return {"ok": True}
        
        credentials = base64.b64encode(b"admin:wrongpassword").decode()
        
        mock_request = Mock()
        mock_request.headers = {"Authorization": f"Basic {credentials}"}
        
        with pytest.raises(HTTPException) as exc_info:
            await dummy_endpoint(mock_request)
        
        assert exc_info.value.status_code == status.HTTP_401_UNAUTHORIZED

    @pytest.mark.anyio
    async def test_valid_credentials(self, monkeypatch):
        """Верные учётные данные проходят."""
        from security.auth import get_password_hash
        import base64
        from unittest.mock import Mock
        
        monkeypatch.setenv("APP_USERNAME", "admin")
        monkeypatch.setenv("APP_PASSWORD_HASH", get_password_hash("password"))
        
        @require_auth
        async def dummy_endpoint(request):
            return {"ok": True}
        
        credentials = base64.b64encode(b"admin:password").decode()
        
        mock_request = Mock()
        mock_request.headers = {"Authorization": f"Basic {credentials}"}
        
        result = await dummy_endpoint(mock_request)
        assert result == {"ok": True}
