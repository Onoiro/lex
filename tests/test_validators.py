"""Тесты для модуля валидации."""

import pytest
from fastapi import HTTPException
from security.validators import validate_word, validate_translation, MAX_WORD_LENGTH, MAX_TRANSLATION_LENGTH


class TestValidateWord:
    """Тесты валидации слова."""

    def test_valid_simple_word(self):
        """Простое валидное слово."""
        assert validate_word("hello") == "hello"

    def test_valid_word_with_spaces(self):
        """Слово с пробелами (фраза)."""
        assert validate_word("  hello world  ") == "hello world"

    def test_valid_word_russian(self):
        """Русское слово."""
        assert validate_word("привет") == "привет"

    def test_valid_word_mixed(self):
        """Смешанные буквы."""
        assert validate_word("hello мир") == "hello мир"

    def test_valid_word_with_hyphen(self):
        """Слово с дефисом."""
        assert validate_word("well-known") == "well-known"

    def test_valid_word_with_apostrophe(self):
        """Слово с апострофом."""
        assert validate_word("don't") == "don't"

    def test_valid_word_with_dot(self):
        """Слово с точкой."""
        assert validate_word("e.g") == "e.g"

    def test_valid_word_with_numbers(self):
        """Слово с цифрами."""
        assert validate_word("test123") == "test123"

    def test_empty_word_raises(self):
        """Пустое слово вызывает ошибку."""
        with pytest.raises(HTTPException) as exc_info:
            validate_word("")
        assert exc_info.value.status_code == 400

    def test_whitespace_only_raises(self):
        """Только пробелы вызывают ошибку."""
        with pytest.raises(HTTPException) as exc_info:
            validate_word("   ")
        assert exc_info.value.status_code == 400

    def test_too_long_word_raises(self):
        """Слишком длинное слово вызывает ошибку."""
        with pytest.raises(HTTPException) as exc_info:
            validate_word("a" * (MAX_WORD_LENGTH + 1))
        assert exc_info.value.status_code == 400

    def test_special_chars_raises(self):
        """Спецсимволы вызывают ошибку."""
        with pytest.raises(HTTPException) as exc_info:
            validate_word("hello<script>")
        assert exc_info.value.status_code == 400

    def test_newline_raises(self):
        """Перевод строки вызывает ошибку."""
        with pytest.raises(HTTPException) as exc_info:
            validate_word("hello\nworld")
        assert exc_info.value.status_code == 400

    def test_unicode_normalization(self):
        """Unicode нормализация работает."""
        # é может быть представлен как один символ или e + combining accent
        word_with_accent = "café"
        result = validate_word(word_with_accent)
        assert result == word_with_accent


class TestValidateTranslation:
    """Тесты валидации перевода."""

    def test_valid_translation(self):
        """Простой валидный перевод."""
        assert validate_translation("привет") == "привет"

    def test_valid_translation_with_spaces(self):
        """Перевод с пробелами."""
        assert validate_translation("  hello world  ") == "hello world"

    def test_valid_translation_russian(self):
        """Русский перевод."""
        assert validate_translation("здравствуй мир") == "здравствуй мир"

    def test_empty_translation_raises(self):
        """Пустой перевод вызывает ошибку."""
        with pytest.raises(HTTPException) as exc_info:
            validate_translation("")
        assert exc_info.value.status_code == 400

    def test_whitespace_only_translation_raises(self):
        """Только пробелы в переводе вызывают ошибку."""
        with pytest.raises(HTTPException) as exc_info:
            validate_translation("   ")
        assert exc_info.value.status_code == 400

    def test_too_long_translation_raises(self):
        """Слишком длинный перевод вызывает ошибку."""
        with pytest.raises(HTTPException) as exc_info:
            validate_translation("a" * (MAX_TRANSLATION_LENGTH + 1))
        assert exc_info.value.status_code == 400

    def test_unicode_normalization(self):
        """Unicode нормализация для перевода."""
        word = "тест"
        result = validate_translation(word)
        assert result == word