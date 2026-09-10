from sqlalchemy import Column, Integer, String, DateTime
import datetime
from .base import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    role = Column(String, nullable=False)  # SURVEYOR | ENGINEER | CITIZEN
    phone = Column(String, nullable=True)
    organization = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
