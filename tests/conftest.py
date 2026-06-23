"""Shared fixtures for all tests.

This module provides reusable fixtures for:
- Test database (file-based SQLite for compatibility)
- FastAPI test client
- Authentication helpers
- CSRF tokens
"""

import os
import tempfile

import pytest
from unittest.mock import patch
from sqlalchemy import text
from fastapi.testclient import TestClient

# Import after setting env
from database import Base, get_db, engine, SessionLocal
from main import app
from auth import get_password_hash
from csrf import sign_token, generate_csrf_token

# Create temporary database file for tests
# This is needed because main.py creates tables at import time
TEST_DB_FILE = tempfile.NamedTemporaryFile(delete=False, suffix=".db")
TEST_DB_PATH = TEST_DB_FILE.name
TEST_DB_FILE.close()

# Set test environment BEFORE importing main
os.environ["LEX_DATA_DIR"] = os.path.dirname(TEST_DB_PATH)
os.environ["LEX_DB_NAME"] = os.path.basename(TEST_DB_PATH).replace(".db", "")

# Remove the file so SQLAlchemy creates it fresh
os.unlink(TEST_DB_PATH)


# Create tables in test database
Base.metadata.create_all(bind=engine)


@pytest.fixture(scope="function")
def db_session():
    """Create a fresh database session for each test.
    
    The database is cleared before each test.
    """
    # Clear all data
    session = SessionLocal()
    try:
        session.execute(text("DELETE FROM words"))
        session.commit()
        yield session
    finally:
        session.close()


@pytest.fixture(scope="function")
def client(db_session):
    """Create a test client with mocked database dependency.
    
    The get_db dependency is overridden to use the test session.
    """
    def override_get_db():
        try:
            yield db_session
        finally:
            pass
    
    app.dependency_overrides[get_db] = override_get_db
    
    with TestClient(app) as test_client:
        yield test_client
    
    # Cleanup overrides
    app.dependency_overrides.clear()


@pytest.fixture(scope="function")
def auth_headers():
    """Return headers with valid Basic authentication.
    
    Default credentials: admin / password
    """
    import base64
    credentials = base64.b64encode(b"admin:password").decode()
    return {"Authorization": f"Basic {credentials}"}


@pytest.fixture(scope="function")
def mock_auth_env(monkeypatch):
    """Mock environment variables for authentication.
    
    Sets up APP_USERNAME and APP_PASSWORD_HASH for tests.
    """
    monkeypatch.setenv("APP_USERNAME", "admin")
    monkeypatch.setenv("APP_PASSWORD_HASH", get_password_hash("password"))


@pytest.fixture(scope="function")
def authenticated_client(client, mock_auth_env):
    """Create an authenticated test client.
    
    Combines the test client with valid auth headers.
    """
    import base64
    credentials = base64.b64encode(b"admin:password").decode()
    client.headers["Authorization"] = f"Basic {credentials}"
    return client


@pytest.fixture(scope="function")
def csrf_token():
    """Generate a valid CSRF token for form submissions."""
    return sign_token(generate_csrf_token())


@pytest.fixture(scope="function")
def sample_word(db_session):
    """Create and return a sample word in the database."""
    from models import Word
    
    word = Word(
        word="test",
        translation="тест",
        interval=0,
        repetitions=0,
        next_review=0,
    )
    db_session.add(word)
    db_session.commit()
    db_session.refresh(word)
    
    return word


@pytest.fixture(scope="function")
def sample_words(db_session):
    """Create and return multiple sample words in the database."""
    from models import Word
    
    words_data = [
        {"word": "hello", "translation": "привет", "interval": 0, "repetitions": 0},
        {"word": "world", "translation": "мир", "interval": 1, "repetitions": 1},
        {"word": "test", "translation": "тест", "interval": 6, "repetitions": 2},
    ]
    
    words = []
    for data in words_data:
        word = Word(**data, next_review=0)
        db_session.add(word)
        words.append(word)
    
    db_session.commit()
    
    # Refresh to get IDs
    for word in words:
        db_session.refresh(word)
    
    return words


@pytest.fixture(scope="function")
def mock_translate_success():
    """Mock translate_word to return a successful translation."""
    with patch("main.translate_word") as mock:
        mock.return_value = "тест"
        yield mock


@pytest.fixture(scope="function")
def mock_translate_failure():
    """Mock translate_word to return None (failure)."""
    with patch("main.translate_word") as mock:
        mock.return_value = None
        yield mock
