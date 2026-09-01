from pydantic import BaseModel
from typing import Optional, List
import datetime

class TenderBase(BaseModel):
    tender_ref: Optional[str] = None
    contractor_name: Optional[str] = None
    contractor_contact_email: Optional[str] = None
    description: Optional[str] = None
    award_date: Optional[datetime.date] = None
    completion_date: Optional[datetime.date] = None
    value_inr: Optional[float] = None
    dlp_years: Optional[float] = None
    dlp_expiry_date: Optional[datetime.date] = None
    source_url: Optional[str] = None
    dlp_source: Optional[str] = None

class TenderCreate(TenderBase):
    segment_ids: Optional[List[int]] = []

class TenderUpdate(BaseModel):
    tender_ref: Optional[str] = None
    contractor_name: Optional[str] = None
    contractor_contact_email: Optional[str] = None
    description: Optional[str] = None
    award_date: Optional[datetime.date] = None
    completion_date: Optional[datetime.date] = None
    value_inr: Optional[float] = None
    dlp_years: Optional[float] = None
    dlp_expiry_date: Optional[datetime.date] = None
    source_url: Optional[str] = None
    dlp_source: Optional[str] = None
    segment_ids: Optional[List[int]] = None

class SegmentBrief(BaseModel):
    id: int
    name: Optional[str] = None
    length_m: Optional[float] = None
    owner: Optional[str] = None
    has_active_dlp: Optional[bool] = None
    traffic_class: Optional[str] = None
    class Config:
        from_attributes = True

class TenderResponse(TenderBase):
    id: int
    segment_ids: List[int] = []
    is_active_dlp: bool = False
    class Config:
        from_attributes = True

class TenderSegmentMapRequest(BaseModel):
    segment_ids: List[int]
