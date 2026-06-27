from sqlalchemy import Column, Integer, String, Float
from database import Base


class Word(Base):
    __tablename__ = "words"

    id = Column(Integer, primary_key=True, index=True)
    word = Column(String, unique=True, index=True)
    translation = Column(String)
    # Repetition interval in days (integer)
    interval = Column(Integer, default=0)
    # Number of successful reviews
    repetitions = Column(Integer, default=0)
    # Date of next review (unix timestamp)
    next_review = Column(Float)  # unix timestamp
    # Last review direction: 'en_ru' or 'ru_en'
    last_direction = Column(String, default='en_ru')
    # Best response time in seconds (None if not reviewed yet)
    best_time = Column(Float, default=None)
    # Average response time in seconds (None if not reviewed yet)
    avg_time = Column(Float, default=None)
    # Number of "I know" clicks
    know_count = Column(Integer, default=0)
    # Number of "I forgot" clicks
    forgot_count = Column(Integer, default=0)
