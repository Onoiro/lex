#!/usr/bin/env python3
"""
Миграция: добавление поля last_direction в таблицу words.
Запуск: uv run python migrate.py
"""
from sqlalchemy import create_engine, text, inspect

# Локальный путь для миграции
DATABASE_URL = "sqlite:///lex.db"

engine = create_engine(DATABASE_URL)

def migrate():
    inspector = inspect(engine)
    columns = [col['name'] for col in inspector.get_columns('words')]
    
    if 'last_direction' in columns:
        print("Поле last_direction уже существует. Миграция не требуется.")
        return
    
    print("Добавление поля last_direction...")
    with engine.connect() as conn:
        conn.execute(text("ALTER TABLE words ADD COLUMN last_direction VARCHAR DEFAULT 'en_ru'"))
        conn.commit()
    
    print("Миграция успешно завершена!")

if __name__ == "__main__":
    migrate()
