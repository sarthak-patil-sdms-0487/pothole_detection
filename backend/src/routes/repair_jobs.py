from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List, Optional

from ..controllers import repair_job_controller
from ..schemas import repair_job_dto
from ..config.database import get_db
from ..middlewares.role import get_current_role

router = APIRouter()


@router.get("/work-orders", response_model=List[repair_job_dto.WorkOrder])
async def get_work_orders_route(
    state: Optional[str] = None,
    breach_only: Optional[bool] = None,
    unassigned_only: Optional[bool] = None,
    db: Session = Depends(get_db),
):
    return await repair_job_controller.get_work_orders(
        state=state, breach_only=breach_only, unassigned_only=unassigned_only, db=db
    )


@router.post("/work-orders/assign", response_model=repair_job_dto.WorkOrder)
async def assign_repair_job_route(
    payload: repair_job_dto.RepairJobUpsert,
    role: str = Depends(get_current_role),
    db: Session = Depends(get_db),
):
    return await repair_job_controller.upsert_repair_job(payload, role, db)
