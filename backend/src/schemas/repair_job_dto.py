from pydantic import BaseModel
from typing import Optional
import datetime


class RepairJobBrief(BaseModel):
    id: int
    assigned_to: Optional[str] = None
    started_at: Optional[datetime.datetime] = None
    completed_at: Optional[datetime.datetime] = None
    material_type: Optional[str] = None
    material_kg: Optional[float] = None
    cost_inr: Optional[float] = None

    class Config:
        from_attributes = True


class WorkOrder(BaseModel):
    """
    One unit of repair work: a defect brought to notice, the contractor it was
    attributed to, the clock it runs against, and the repair job raised to close it.
    """
    defect_id: int
    state: str
    severity: Optional[float] = None

    segment_id: Optional[int] = None
    segment_name: Optional[str] = None

    # Attribution — always a probable match, carried from the liability verdict.
    contractor_name: Optional[str] = None
    tender_ref: Optional[str] = None
    verdict: Optional[str] = None

    # Statutory clock
    noticed_at: Optional[datetime.datetime] = None
    sla_due_at: Optional[datetime.datetime] = None
    sla_hours_remaining: Optional[float] = None
    breach_flag: bool = False
    closed_at: Optional[datetime.datetime] = None

    # Evidence pair
    has_before_evidence: bool = False
    has_after_evidence: bool = False

    job: Optional[RepairJobBrief] = None

    class Config:
        from_attributes = True


class RepairJobUpsert(BaseModel):
    """Assign or update the crew and materials for a defect's repair job."""
    defect_id: int
    assigned_to: Optional[str] = None
    material_type: Optional[str] = None
    material_kg: Optional[float] = None
    cost_inr: Optional[float] = None
    start_now: Optional[bool] = False
