from sqlalchemy import Column, Integer, String, DateTime
import datetime
from .base import Base


class SurveyRun(Base):
    __tablename__ = "survey_run"

    id = Column(Integer, primary_key=True, index=True)
    started_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False)
    ended_at = Column(DateTime, nullable=True)
    source_type = Column(String, nullable=False, default="video")  # video | camera
    total_frames = Column(Integer, default=0)
    defects_found = Column(Integer, default=0)
    operator_name = Column(String, nullable=True, default="Surveyor")
