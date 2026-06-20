import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# Use /app/data/lex.db in Docker, otherwise local lex.db
DATA_DIR = os.getenv("LEX_DATA_DIR", "/app/data")
DATABASE_URL = f"sqlite:///{DATA_DIR}/lex.db"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
