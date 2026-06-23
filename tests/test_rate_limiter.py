"""Тесты для модуля rate limiting."""

import pytest
import time
from fastapi import HTTPException
from rate_limiter import RateLimiter, get_client_ip


class TestRateLimiter:
    """Тесты RateLimiter."""

    def test_allows_within_limit(self):
        """Разрешает запросы в пределах лимита."""
        limiter = RateLimiter(max_requests=3, window_seconds=60)
        
        assert limiter.is_allowed("192.168.1.1") is True
        assert limiter.is_allowed("192.168.1.1") is True
        assert limiter.is_allowed("192.168.1.1") is True

    def test_blocks_over_limit(self):
        """Блокирует запросы сверх лимита."""
        limiter = RateLimiter(max_requests=2, window_seconds=60)
        
        assert limiter.is_allowed("192.168.1.1") is True
        assert limiter.is_allowed("192.168.1.1") is True
        assert limiter.is_allowed("192.168.1.1") is False

    def test_different_ips_independent(self):
        """Разные IP имеют независимые лимиты."""
        limiter = RateLimiter(max_requests=1, window_seconds=60)
        
        assert limiter.is_allowed("192.168.1.1") is True
        assert limiter.is_allowed("192.168.1.1") is False
        assert limiter.is_allowed("192.168.1.2") is True

    def test_window_reset(self):
        """Сброс лимита после истечения окна."""
        limiter = RateLimiter(max_requests=1, window_seconds=1)
        
        assert limiter.is_allowed("192.168.1.1") is True
        assert limiter.is_allowed("192.168.1.1") is False
        
        # Ждём истечения окна
        time.sleep(1.1)
        
        assert limiter.is_allowed("192.168.1.1") is True

    def test_check_raises_on_limit(self):
        """check() выбрасывает HTTPException при превышении."""
        limiter = RateLimiter(max_requests=1, window_seconds=60)
        
        limiter.is_allowed("192.168.1.1")  # Первый запрос
        
        with pytest.raises(HTTPException) as exc_info:
            limiter.check("192.168.1.1")
        
        assert exc_info.value.status_code == 429
        assert "Retry-After" in exc_info.value.headers

    def test_check_passes_within_limit(self):
        """check() не выбрасывает в пределах лимита."""
        limiter = RateLimiter(max_requests=5, window_seconds=60)
        
        # Не должно выбрасывать
        limiter.check("192.168.1.1")
        limiter.check("192.168.1.1")


class TestGetClientIp:
    """Тесты извлечения IP адреса."""

    def test_x_forwarded_for_single(self):
        """Один IP в X-Forwarded-For."""
        class MockRequest:
            headers = {"X-Forwarded-For": "192.168.1.100"}
            client = None
        
        assert get_client_ip(MockRequest()) == "192.168.1.100"

    def test_x_forwarded_for_multiple(self):
        """Несколько IP в X-Forwarded-For (берётся первый)."""
        class MockRequest:
            headers = {"X-Forwarded-For": "192.168.1.100, 10.0.0.1, 172.16.0.1"}
            client = None
        
        assert get_client_ip(MockRequest()) == "192.168.1.100"

    def test_x_forwarded_for_with_spaces(self):
        """X-Forwarded-For с лишними пробелами."""
        class MockRequest:
            headers = {"X-Forwarded-For": "  192.168.1.100  "}
            client = None
        
        assert get_client_ip(MockRequest()) == "192.168.1.100"

    def test_fallback_to_client(self):
        """Fallback на client.host если нет X-Forwarded-For."""
        class MockClient:
            host = "10.0.0.50"
        
        class MockRequest:
            headers = {}
            client = MockClient()
        
        assert get_client_ip(MockRequest()) == "10.0.0.50"

    def test_unknown_when_no_info(self):
        """Возвращает 'unknown' если нет информации."""
        class MockRequest:
            headers = {}
            client = None
        
        assert get_client_ip(MockRequest()) == "unknown"
