from pydantic import BaseModel
from typing import Optional, List
import datetime

STANDARD_SLAG_RATE_INR_PER_KG = 15.70

class SlagLotCreate(BaseModel):
    tenant_unit_name: str
    estate_id: Optional[int] = 1
    generated_month: Optional[datetime.date] = None
    tonnes: float
    stockpile_location: Optional[str] = None

class SlagLotResponse(BaseModel):
    id: int
    tenant_unit_name: str
    estate_id: Optional[int] = None
    generated_month: Optional[datetime.date] = None
    tonnes: float
    kg_total: float
    kg_drawn: float
    kg_remaining: float
    stockpile_location: Optional[str] = None
    notional_value_inr: float
    class Config:
        from_attributes = True

class SlagDrawCreate(BaseModel):
    slag_lot_id: int
    repair_job_id: int
    kg_drawn: float
    notional_value_inr: Optional[float] = None

class SlagDrawResponse(BaseModel):
    id: int
    slag_lot_id: int
    tenant_unit_name: Optional[str] = None
    repair_job_id: int
    kg_drawn: float
    notional_value_inr: float
    class Config:
        from_attributes = True

class SlagSummaryResponse(BaseModel):
    total_lots: int
    total_tonnes_allocated: float
    total_kg_allocated: float
    total_kg_drawn: float
    total_kg_remaining: float
    total_reclaimed_value_inr: float
    co2_avoided_tonnes: float
    rate_per_kg_inr: float
