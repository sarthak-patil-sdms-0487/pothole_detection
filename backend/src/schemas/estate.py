from sqlalchemy import Column, Integer, String, JSON
from .base import Base

class Estate(Base):
    __tablename__ = "estate"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    config_json = Column(JSON, nullable=False, default=dict)
