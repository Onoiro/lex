"""Тесты для модуля CSRF-защиты."""

import pytest
from fastapi import HTTPException, status
from unittest.mock import Mock
from security.csrf import (
    generate_csrf_token,
    sign_token,
    verify_token,
    get_csrf_token_from_request,
    CSRFProtection,
    validate_csrf_form_token,
)


class TestTokenGeneration:
    """Тесты генерации токенов."""

    def test_generate_unique_tokens(self):
        """Каждый токен уникален."""
        token1 = generate_csrf_token()
        token2 = generate_csrf_token()
        
        assert token1 != token2
        assert len(token1) == 64  # 32 байта в hex
        assert len(token2) == 64

    def test_generate_hex_format(self):
        """Токен в hex формате."""
        token = generate_csrf_token()
        # Только hex символы
        assert all(c in '0123456789abcdef' for c in token)


class TestTokenSigning:
    """Тесты подписи токенов."""

    def test_sign_token_format(self):
        """Подписанный токен имеет формат token.signature."""
        token = generate_csrf_token()
        signed = sign_token(token)
        
        parts = signed.split('.')
        assert len(parts) == 2
        assert parts[0] == token
        assert len(parts[1]) == 64  # SHA256 в hex

    def test_verify_valid_token(self):
        """Проверка валидного токена."""
        token = generate_csrf_token()
        signed = sign_token(token)
        
        assert verify_token(signed) is True

    def test_verify_invalid_signature(self):
        """Проверка токена с неверной подписью."""
        token = generate_csrf_token()
        sign_token(token)
        
        # Подменяем подпись
        fake_signed = token + ".fake_signature"
        
        assert verify_token(fake_signed) is False

    def test_verify_malformed_token(self):
        """Проверка malformed токена."""
        assert verify_token("no_separator") is False
        assert verify_token("") is False
        assert verify_token("token") is False


class TestGetCsrfTokenFromRequest:
    """Tests for get_csrf_token_from_request helper."""

    def test_returns_token_from_header(self):
        """Returns token when X-CSRF-Token header is present."""
        mock_request = Mock()
        mock_request.headers = {"X-CSRF-Token": "some_token"}

        assert get_csrf_token_from_request(mock_request) == "some_token"

    def test_returns_none_without_header(self):
        """Returns None when X-CSRF-Token header is absent."""
        mock_request = Mock()
        mock_request.headers = {}

        assert get_csrf_token_from_request(mock_request) is None


class TestCSRFProtection:
    """Тесты CSRFProtection класса."""

    def test_create_token(self):
        """Создание токена."""
        protection = CSRFProtection(ttl_seconds=60)
        
        token = protection.create_token()
        
        assert '.' in token  # Подписанный
        assert verify_token(token) is True

    def test_validate_token_success(self):
        """Успешная валидация токена."""
        protection = CSRFProtection(ttl_seconds=60)
        
        token = protection.create_token()
        
        assert protection.validate_token(token) is True

    def test_validate_token_once_only(self):
        """Токен работает только один раз."""
        protection = CSRFProtection(ttl_seconds=60)
        
        token = protection.create_token()
        
        assert protection.validate_token(token) is True
        assert protection.validate_token(token) is False  # Повторное использование

    def test_validate_expired_token(self):
        """Истёкший токен не валиден."""
        protection = CSRFProtection(ttl_seconds=1)
        
        token = protection.create_token()
        
        import time
        time.sleep(1.1)
        
        assert protection.validate_token(token) is False

    def test_validate_fake_token(self):
        """Поддельный токен не валиден."""
        protection = CSRFProtection(ttl_seconds=60)
        
        fake_token = "fake.token"
        
        assert protection.validate_token(fake_token) is False

    def test_validate_token_no_separator(self):
        """Token without dot separator returns False."""
        protection = CSRFProtection(ttl_seconds=60)

        assert protection.validate_token("no_separator") is False

    def test_validate_expired_token_deletes_and_returns_false(self):
        """Expired token is deleted from storage and returns False."""
        protection = CSRFProtection(ttl_seconds=60)

        token = protection.create_token()
        token_part = token.rsplit('.', 1)[0]

        # Simulate expiration by moving the expiry time into the past
        protection._tokens[token_part] = protection._time.time() - 1

        assert protection.validate_token(token) is False
        assert token_part not in protection._tokens

    def test_cleanup_removes_expired_tokens(self):
        """_cleanup removes expired tokens when creating a new one."""
        protection = CSRFProtection(ttl_seconds=60)

        token = protection.create_token()
        token_part = token.rsplit('.', 1)[0]

        # Simulate expiration
        protection._tokens[token_part] = protection._time.time() - 1

        # Creating a new token triggers _cleanup, which should remove the expired one
        protection.create_token()

        assert token_part not in protection._tokens

    def test_get_token_for_form(self):
        """Токен для формы."""
        protection = CSRFProtection(ttl_seconds=60)
        
        token = protection.get_token_for_form()
        
        assert '.' in token
        assert verify_token(token) is True


class TestValidateCSRFFormToken:
    """Тесты валидации токена формы."""

    def test_empty_token_raises(self):
        """Пустой токен вызывает 403."""
        with pytest.raises(HTTPException) as exc_info:
            validate_csrf_form_token("")
        
        assert exc_info.value.status_code == status.HTTP_403_FORBIDDEN

    def test_none_token_raises(self):
        """None токен вызывает 403."""
        with pytest.raises(HTTPException) as exc_info:
            validate_csrf_form_token(None)
        
        assert exc_info.value.status_code == status.HTTP_403_FORBIDDEN

    def test_invalid_token_raises(self):
        """Невалидный токен вызывает 403."""
        with pytest.raises(HTTPException) as exc_info:
            validate_csrf_form_token("fake.token")
        
        assert exc_info.value.status_code == status.HTTP_403_FORBIDDEN

    def test_valid_token_passes(self):
        """Валидный токен не вызывает исключений."""
        token = sign_token(generate_csrf_token())
        
        # Не должно выбрасывать
        validate_csrf_form_token(token)
