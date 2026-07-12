"""Tests for the Word model."""

import pytest
from sqlalchemy.exc import IntegrityError
from models import Word


class TestWordModel:
    """Tests for Word SQLAlchemy model."""

    def test_create_word_basic(self, db_session):
        """Create a word with basic fields."""
        word = Word(
            word="hello",
            translation="привет",
        )
        db_session.add(word)
        db_session.commit()
        db_session.refresh(word)
        
        assert word.word == "hello"
        assert word.translation == "привет"
        assert word.id is not None

    def test_word_default_values(self, db_session):
        """Word has correct default values."""
        word = Word(
            word="test",
            translation="тест",
        )
        db_session.add(word)
        db_session.commit()
        db_session.refresh(word)
        
        assert word.interval == 0
        assert word.repetitions == 0
        assert word.next_review is None
        assert word.last_direction == "en_ru"

    def test_word_custom_values(self, db_session):
        """Word accepts custom interval and repetitions."""
        word = Word(
            word="advanced",
            translation="продвинутый",
            interval=10,
            repetitions=5,
            last_direction="ru_en",
        )
        db_session.add(word)
        db_session.commit()
        db_session.refresh(word)
        
        assert word.interval == 10
        assert word.repetitions == 5
        assert word.last_direction == "ru_en"

    def test_word_unique_word_field(self, db_session):
        """Word field is unique - duplicate should fail."""
        word1 = Word(word="hello", translation="привет")
        word2 = Word(word="hello", translation="здравствуй")
        
        db_session.add(word1)
        db_session.commit()
        
        db_session.add(word2)
        with pytest.raises(IntegrityError):
            db_session.commit()

    def test_word_query_by_word(self, db_session):
        """Can query word by the word field."""
        word = Word(word="unique_word", translation="уникальное")
        db_session.add(word)
        db_session.commit()
        
        result = db_session.query(Word).filter(Word.word == "unique_word").first()
        
        assert result is not None
        assert result.translation == "уникальное"

    def test_word_query_by_id(self, db_session):
        """Can query word by ID."""
        word = Word(word="test", translation="тест")
        db_session.add(word)
        db_session.commit()
        db_session.refresh(word)
        
        result = db_session.query(Word).get(word.id)
        
        assert result is not None
        assert result.word == "test"

    def test_word_repr(self, db_session):
        """Word has string representation."""
        word = Word(word="hello", translation="привет")
        db_session.add(word)
        db_session.commit()
        db_session.refresh(word)
        
        # SQLAlchemy models have default repr with class name
        assert "Word" in repr(word)

    def test_word_update_interval(self, db_session):
        """Can update word interval."""
        word = Word(word="test", translation="тест", interval=0)
        db_session.add(word)
        db_session.commit()
        db_session.refresh(word)
        
        word.interval = 5
        db_session.commit()
        
        updated = db_session.query(Word).get(word.id)
        assert updated.interval == 5

    def test_word_update_repetitions(self, db_session):
        """Can update word repetitions."""
        word = Word(word="test", translation="тест", repetitions=0)
        db_session.add(word)
        db_session.commit()
        db_session.refresh(word)
        
        word.repetitions = 3
        db_session.commit()
        
        updated = db_session.query(Word).get(word.id)
        assert updated.repetitions == 3

    def test_word_delete(self, db_session):
        """Can delete a word."""
        word = Word(word="temp", translation="временный")
        db_session.add(word)
        db_session.commit()
        db_session.refresh(word)
        
        word_id = word.id
        db_session.delete(word)
        db_session.commit()
        
        result = db_session.query(Word).get(word_id)
        assert result is None

    def test_word_all_fields(self, db_session):
        """Word with all fields set."""
        word = Word(
            word="comprehensive",
            translation="всеобъемлющий",
            interval=15,
            repetitions=7,
            next_review=1234567890.0,
            last_direction="ru_en",
        )
        db_session.add(word)
        db_session.commit()
        db_session.refresh(word)
        
        assert word.word == "comprehensive"
        assert word.translation == "всеобъемлющий"
        assert word.interval == 15
        assert word.repetitions == 7
        assert word.next_review == 1234567890.0
        assert word.last_direction == "ru_en"
