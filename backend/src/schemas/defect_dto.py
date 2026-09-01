from pydantic import BaseModel
from typing import Optional, List, Any
import datetime

class DefectReportBrief(BaseModel):
    id: int
    original_image_url: str
    annotated_image_url: str
    lat: Optional[float] = None
    lng: Optional[float] = None
    capture_source: Optional[str] = None
    reportedDate: Optional[datetime.datetime] = None
    class Config:
        from_attributes = True

class DefectEvidenceBrief(BaseModel):
    id: int
    kind: str  # BEFORE | AFTER
    photo_uri: str
    lat: Optional[float] = None
    lng: Optional[float] = None
    captured_at: Optional[datetime.datetime] = None
    class Config:
        from_attributes = True

class DefectVerdictBrief(BaseModel):
    id: int
    verdict: str
    confidence: Optional[float] = None
    rationale: Optional[str] = None
    generated_at: Optional[datetime.datetime] = None
    class Config:
        from_attributes = True

class DefectResponse(BaseModel):
    id: int
    segment_id: Optional[int] = None
    segment_name: Optional[str] = None
    state: str  # SIGHTING | CONFIRMED | NOTICED | CLOSED
    first_seen_at: Optional[datetime.datetime] = None
    confirmed_at: Optional[datetime.datetime] = None
    noticed_at: Optional[datetime.datetime] = None
    sla_due_at: Optional[datetime.datetime] = None
    sla_hours_remaining: Optional[float] = None
    severity: Optional[float] = None
    promotion_reason: Optional[str] = None
    closed_at: Optional[datetime.datetime] = None
    breach_flag: bool = False
    repeat_sighting_count: int = 0
    policy_score: Optional[float] = None
    latest_verdict: Optional[DefectVerdictBrief] = None
    sightings: List[DefectReportBrief] = []
    evidence_list: List[DefectEvidenceBrief] = []

    class Config:
        from_attributes = True

class SweepResponse(BaseModel):
    evaluated_count: int
    promoted_to_noticed_count: int

class RepairEvidenceResponse(BaseModel):
    verified: bool
    detections_found: int
    distance_m: float
    time_valid: bool
    errors: List[str] = []
    photo_uri: Optional[str] = None

class CloseDefectRequest(BaseModel):
    reason: Optional[str] = None
    override_verification: Optional[bool] = False

class CloseDefectResponse(BaseModel):
    defect_id: int
    state: str
    closed_at: datetime.datetime
    sla_due_at: Optional[datetime.datetime] = None
    breach_flag: bool
    latency_hours: float
    closed_by: str
    message: str
