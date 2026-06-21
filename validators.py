"""Модуль валидации пользовательского ввода."""

import unicodedata
from fastapi import HTTPException


# Максимальная длина для полей
MAX_WORD_LENGTH = 100
MAX_TRANSLATION_LENGTH = 500


def _is_valid_char(char: str) -> bool:
    """
    Проверка символа на допустимость.
    
    Разрешены:
    - Буквы (любой язык)
    - Цифры
    - Пробелы
    - Дефис, апостроф, точка
    """
    category = unicodedata.category(char)
    # L* - буквы, N* - цифры, Zs - пробелы
    if category.startswith('L') or category.startswith('N') or category == 'Zs':
        return True
    if char in " -'.":
        return True
    return False


def validate_word(word: str) -> str:
    """
    Валидация слова.
    
    Args:
        word: Исходная строка слова.
        
    Returns:
        Нормализованное слово.
        
    Raises:
        HTTPException: При невалидном вводе.
    """
    if not word or not word.strip():
        raise HTTPException(status_code=400, detail="Поле 'слово' не может быть пустым")
    
    word = word.strip()
    
    if len(word) > MAX_WORD_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"Слово слишком длинное (макс. {MAX_WORD_LENGTH} символов)"
        )
    
    # Проверка каждого символа
    for char in word:
        if not _is_valid_char(char):
            raise HTTPException(
                status_code=400,
                detail="Слово содержит недопустимые символы. Разрешены только буквы, цифры, пробелы, дефис, апостроф и точка"
            )
    
    # Нормализация Unicode: приводим к форме NFC для консистентности
    word = unicodedata.normalize("NFC", word)
    
    return word


def validate_translation(translation: str) -> str:
    """
    Валидация перевода.
    
    Args:
        translation: Исходная строка перевода.
        
    Returns:
        Нормализованный перевод.
        
    Raises:
        HTTPException: При невалидном вводе.
    """
    if not translation or not translation.strip():
        raise HTTPException(status_code=400, detail="Поле 'перевод' не может быть пустым")
    
    translation = translation.strip()
    
    if len(translation) > MAX_TRANSLATION_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"Перевод слишком длинный (макс. {MAX_TRANSLATION_LENGTH} символов)"
        )
    
    # Нормализация Unicode
    translation = unicodedata.normalize("NFC", translation)
    
    return translation
