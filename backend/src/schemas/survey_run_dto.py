from pydantic import BaseModel
from typing import Optional
import datetime


class SurveyRunCreate(BaseModel):
    source_type: str = "video"
    operator_name: Optional[str] = "Surveyor"


class SurveyRunUpdate(BaseModel):
    ended_at: Optional[datetime.datetime] = None
    total_frames: Optional[int] = None
    defects_found: Optional[int] = None


class SurveyRun(BaseModel):
    id: int
    started_at: datetime.datetime
    ended_at: Optional[datetime.datetime] = None
    source_type: str
    total_frames: int
    defects_found: int
    operator_name: Optional[str] = None

    class Config:
        from_attributes = True
