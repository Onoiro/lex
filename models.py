from sqlalchemy import Column, Integer, String, Float
from database import Base


class Word(Base):
    __tablename__ = "words"

    id = Column(Integer, primary_key=True, index=True)
    word = Column(String, unique=True, index=True)
    translation = Column(String)
    # Интервал повторений в днях
    interval = Column(Float, default=0)
    # Количество успешных повторов
    repetitions = Column(Integer, default=0)
    # Дата следующего повторения
    next_review = Column(Float)  # unix timestamp
    # Направление последнего повторения: 'en_ru' или 'ru_en'
    last_direction = Column(String, default='en_ru')
    # Лучшее время ответа в секундах (None если ещё не повторялся)
    best_time = Column(Float, default=None)
    # Среднее время ответа в секундах (None если ещё не повторялся)
    avg_time = Column(Float, default=None)
