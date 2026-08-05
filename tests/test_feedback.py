"""Tests for feedback module and endpoint."""

import pytest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

from proxy.services.feedback import send_feedback, _send_sync, _format_message
from proxy.main import app, feedback_limiter


@pytest.fixture(autouse=True)
def reset_feedback_state():
    """Clear feedback rate limiter before and after each test."""
    feedback_limiter._requests.clear()
    yield
    feedback_limiter._requests.clear()


class TestFormatMessage:
    """Tests for _format_message."""

    def test_bug_with_contact(self):
        msg = _format_message("bug", "App crashes on startup", "user@example.com")
        assert "🐛 Bug" in msg
        assert "App crashes on startup" in msg
        assert "📞 Contact: user@example.com" in msg

    def test_idea_without_contact(self):
        msg = _format_message("idea", "Add dark mode please!", "")
        assert "💡 Idea" in msg
        assert "Add dark mode please!" in msg
        assert "Contact" not in msg

    def test_other_category(self):
        msg = _format_message("other", "Just saying hello!", "")
        assert "💬 Other" in msg


class TestSendSync:
    """Tests for _send_sync function."""

    @patch("proxy.services.feedback.BOT_TOKEN", "")
    def test_no_token_returns_false(self):
        assert _send_sync("bug", "test message here", "") is False

    @patch("proxy.services.feedback.BOT_TOKEN", "test-token")
    @patch("proxy.services.feedback.CHAT_ID", "123456")
    @patch("proxy.services.feedback.httpx.Client")
    def test_successful_send(self, mock_client_cls):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_client = MagicMock()
        mock_client.__enter__ = MagicMock(return_value=mock_client)
        mock_client.__exit__ = MagicMock(return_value=False)
        mock_client.post = MagicMock(return_value=mock_response)
        mock_client_cls.return_value = mock_client

        result = _send_sync("bug", "App crashes on startup", "user@example.com")
        assert result is True

        mock_client.post.assert_called_once()
        call_args = mock_client.post.call_args
        assert call_args.kwargs["json"]["chat_id"] == "123456"
        assert "🐛 Bug" in call_args.kwargs["json"]["text"]
        assert "App crashes on startup" in call_args.kwargs["json"]["text"]

    @patch("proxy.services.feedback.BOT_TOKEN", "test-token")
    @patch("proxy.services.feedback.CHAT_ID", "123456")
    @patch("proxy.services.feedback.httpx.Client")
    def test_telegram_api_error_returns_false(self, mock_client_cls):
        mock_response = MagicMock()
        mock_response.status_code = 500
        mock_client = MagicMock()
        mock_client.__enter__ = MagicMock(return_value=mock_client)
        mock_client.__exit__ = MagicMock(return_value=False)
        mock_client.post = MagicMock(return_value=mock_response)
        mock_client_cls.return_value = mock_client

        result = _send_sync("bug", "App crashes on startup", "")
        assert result is False

    @patch("proxy.services.feedback.BOT_TOKEN", "test-token")
    @patch("proxy.services.feedback.CHAT_ID", "123456")
    @patch("proxy.services.feedback.httpx.Client")
    def test_network_error_returns_false(self, mock_client_cls):
        import httpx
        mock_client = MagicMock()
        mock_client.__enter__ = MagicMock(return_value=mock_client)
        mock_client.__exit__ = MagicMock(return_value=False)
        mock_client.post.side_effect = httpx.RequestError("network error")
        mock_client_cls.return_value = mock_client

        result = _send_sync("bug", "App crashes on startup", "")
        assert result is False


class TestSendFeedbackAsync:
    """Tests for async send_feedback function."""

    @pytest.mark.asyncio
    @patch("proxy.services.feedback._send_sync", return_value=True)
    async def test_returns_true_on_success(self, mock_send):
        result = await send_feedback("idea", "Great feature idea!", "")
        assert result is True

    @pytest.mark.asyncio
    @patch("proxy.services.feedback._send_sync", return_value=False)
    async def test_returns_false_on_failure(self, mock_send):
        result = await send_feedback("bug", "Something broke!", "")
        assert result is False


class TestFeedbackEndpoint:
    """Tests for POST /feedback endpoint via TestClient."""

    def test_invalid_category_returns_400(self):
        client = TestClient(app)
        response = client.post(
            "/feedback",
            json={"category": "invalid", "message": "This is a valid message", "contact": ""},
        )
        assert response.status_code == 400

    def test_short_message_returns_400(self):
        client = TestClient(app)
        response = client.post(
            "/feedback",
            json={"category": "bug", "message": "short", "contact": ""},
        )
        assert response.status_code == 400

    @patch("proxy.main.feedback_configured", return_value=False)
    def test_no_token_returns_503(self, mock_configured):
        client = TestClient(app)
        response = client.post(
            "/feedback",
            json={"category": "bug", "message": "This is a valid message", "contact": ""},
        )
        assert response.status_code == 503

    @patch("proxy.main.feedback_configured", return_value=True)
    @patch("proxy.main.send_feedback", return_value=True)
    def test_successful_feedback(self, mock_send, mock_configured):
        client = TestClient(app)
        response = client.post(
            "/feedback",
            json={"category": "idea", "message": "Add dark mode please!", "contact": "user@example.com"},
        )
        assert response.status_code == 200
        assert response.json() == {"status": "sent"}

    @patch("proxy.main.feedback_configured", return_value=True)
    @patch("proxy.main.send_feedback", return_value=False)
    def test_send_failure_returns_502(self, mock_send, mock_configured):
        client = TestClient(app)
        response = client.post(
            "/feedback",
            json={"category": "bug", "message": "App crashes on startup", "contact": ""},
        )
        assert response.status_code == 502

    @patch("proxy.main.feedback_configured", return_value=True)
    @patch("proxy.main.send_feedback", return_value=True)
    def test_rate_limiting(self, mock_send, mock_configured):
        client = TestClient(app)
        # 3 requests allowed
        for _ in range(3):
            resp = client.post(
                "/feedback",
                json={"category": "bug", "message": "This is a valid message", "contact": ""},
            )
            assert resp.status_code == 200
        # 4th should be rate limited
        resp = client.post(
            "/feedback",
            json={"category": "bug", "message": "This is a valid message", "contact": ""},
        )
        assert resp.status_code == 429
