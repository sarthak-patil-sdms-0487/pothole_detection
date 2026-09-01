from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List, Optional

from ..controllers import report_controller
from ..schemas import report_dto
from ..config.database import get_db
from ..middlewares.role import get_current_role

router = APIRouter()

@router.post("/reports", response_model=report_dto.Report)
async def create_report_route(
    report: report_dto.ReportCreate, 
    role: str = Depends(get_current_role),
    db_session: Session = Depends(get_db)
):
    return await report_controller.create_report(report, actor=role, db_session=db_session)

@router.get("/reports", response_model=List[report_dto.Report])
async def get_reports_route(
    reportedBy: Optional[str] = None,
    status: Optional[str] = None,
    segment_id: Optional[int] = None,
    defect_id: Optional[int] = None,
    db_session: Session = Depends(get_db)
):
    return await report_controller.get_reports(reportedBy, status, segment_id, defect_id, db_session)

@router.get("/reports/{report_id}", response_model=report_dto.Report)
async def get_report_route(report_id: int, db_session: Session = Depends(get_db)):
    return await report_controller.get_report(report_id, db_session)

@router.put("/reports/{report_id}", response_model=report_dto.Report)
async def update_report_route(report_id: int, report_update: report_dto.ReportUpdate, db_session: Session = Depends(get_db)):
    return await report_controller.update_report(report_id, report_update, db_session)

@router.delete("/reports/{report_id}", status_code=204)
async def delete_report_route(report_id: int, db_session: Session = Depends(get_db)):
    return await report_controller.delete_report(report_id, db_session)