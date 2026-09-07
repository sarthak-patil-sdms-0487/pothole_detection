from pydantic import BaseModel
from typing import Optional, Any, List
import datetime

# --- Pydantic Models ---
class ReportBase(BaseModel):
    original_image_url: str
    annotated_image_url: str
    detection_method: Optional[str] = None
    camera_params: Optional[Any] = None
    pothole_details: Optional[Any] = None
    user_pothole_count: Optional[int] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    address: Optional[str] = None
    status: Optional[str] = "Pending Analysis"
    reportedBy: Optional[str] = None
    reportedDate: Optional[datetime.datetime] = None
    severity: Optional[str] = None
    estSize: Optional[str] = None
    message: Optional[str] = None
    defect_id: Optional[int] = None
    segment_id: Optional[int] = None
    capture_source: Optional[str] = "WORKER"  # WORKER | SURVEY | OPPORTUNISTIC
    survey_run_id: Optional[int] = None

class ReportCreate(ReportBase):
    pass

class ReportUpdate(BaseModel):
    lat: Optional[float] = None
    lng: Optional[float] = None
    address: Optional[str] = None
    status: Optional[str] = None
    reportedBy: Optional[str] = None
    severity: Optional[str] = None
    estSize: Optional[str] = None
    message: Optional[str] = None
    defect_id: Optional[int] = None
    segment_id: Optional[int] = None
    capture_source: Optional[str] = None
    survey_run_id: Optional[int] = None

class Report(ReportBase):
    id: int
    class Config:
        from_attributes = True
