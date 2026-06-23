"""Tests for database module."""

from sqlalchemy import text
from database import get_db, SessionLocal
from models import Word


class TestDatabaseConnection:
    """Tests for database connection and session."""

    def test_session_creation(self):
        """Can create a database session."""
        session = SessionLocal()
        try:
            assert session is not None
            # Should be able to execute a simple query
            result = session.execute(text("SELECT 1"))
            assert result.scalar() == 1
        finally:
            session.close()

    def test_session_context_manager(self, db_session):
        """Session works as context manager."""
        # db_session fixture already tests this
        assert db_session is not None
        
        word = Word(word="context", translation="контекст")
        db_session.add(word)
        db_session.commit()
        
        result = db_session.query(Word).filter(Word.word == "context").first()
        assert result is not None

    def test_get_db_generator(self, monkeypatch):
        """get_db is a generator that yields and closes session."""
        from unittest.mock import Mock, patch
        
        mock_session = Mock()
        
        with patch("database.SessionLocal", return_value=mock_session):
            gen = get_db()
            result = next(gen)
            
            assert result is mock_session
            
            # After yielding, should close session on cleanup
            try:
                next(gen)
            except StopIteration:
                pass
            
            mock_session.close.assert_called_once()


class TestDatabaseIsolation:
    """Tests for test database isolation."""

    def test_fresh_database_per_test(self, db_session):
        """Each test gets a fresh database."""
        # db_session should start empty
        count = db_session.query(Word).count()
        assert count == 0

    def test_tables_created_automatically(self, db_session):
        """Tables are created by the fixture."""
        # Should be able to query without errors
        result = db_session.execute(text("SELECT name FROM sqlite_master WHERE type='table'"))
        tables = [row[0] for row in result]
        assert "words" in tables

    def test_cleanup_after_test(self, db_session):
        """Database is cleaned up after test (tested implicitly)."""
        word = Word(word="cleanup", translation="очистка")
        db_session.add(word)
        db_session.commit()
        
        # Word exists in this test
        assert db_session.query(Word).count() == 1
        # After test, db_session fixture drops tables


class TestWordOperations:
    """Tests for basic word operations in database."""

    def test_add_word(self, db_session):
        """Can add a word to database."""
        word = Word(word="add_test", translation="добавить тест")
        db_session.add(word)
        db_session.commit()
        
        result = db_session.query(Word).filter(Word.word == "add_test").first()
        assert result is not None
        assert result.translation == "добавить тест"

    def test_get_all_words(self, db_session):
        """Can get all words from database."""
        words = [
            Word(word="one", translation="один"),
            Word(word="two", translation="два"),
            Word(word="three", translation="три"),
        ]
        for w in words:
            db_session.add(w)
        db_session.commit()
        
        all_words = db_session.query(Word).all()
        assert len(all_words) == 3

    def test_delete_word(self, db_session):
        """Can delete a word from database."""
        word = Word(word="delete_me", translation="удали меня")
        db_session.add(word)
        db_session.commit()
        
        db_session.delete(word)
        db_session.commit()
        
        result = db_session.query(Word).filter(Word.word == "delete_me").first()
        assert result is None

    def test_update_word(self, db_session):
        """Can update a word in database."""
        word = Word(word="update_test", translation="старый перевод")
        db_session.add(word)
        db_session.commit()
        
        word.translation = "новый перевод"
        db_session.commit()
        
        updated = db_session.query(Word).get(word.id)
        assert updated.translation == "новый перевод"
