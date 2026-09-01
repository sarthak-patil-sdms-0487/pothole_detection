from fastapi import HTTPException, Depends, Response
from sqlalchemy.orm import Session
from typing import List, Optional
import datetime

from ..schemas import report_dto
from ..schemas import report as report_schema
from ..schemas.defect import Defect
from ..config.database import get_db
from ..services import segment_service
from ..services import dedupe_service
from ..services import promotion_service

async def create_report(
    report: report_dto.ReportCreate, 
    actor: str = "SURVEYOR",
    db_session: Session = Depends(get_db)
):
    report_dict = report.model_dump() if hasattr(report, "model_dump") else report.dict()
    lat = report_dict.get("lat")
    lng = report_dict.get("lng")
    capture_source = report_dict.get("capture_source") or "WORKER"
    
    # 1. Auto-resolve segment_id via Shapely nearest segment matcher if coordinates are present
    if not report_dict.get("segment_id") and lat is not None and lng is not None:
        matched_seg = segment_service.match_segment(
            lat=lat,
            lng=lng,
            db=db_session
        )
        report_dict["segment_id"] = matched_seg

    segment_id = report_dict.get("segment_id")

    # Parse numeric severity if available
    severity_val = None
    if report_dict.get("severity"):
        s_str = str(report_dict["severity"]).lower()
        if s_str == "high":
            severity_val = 0.9
        elif s_str == "medium":
            severity_val = 0.6
        elif s_str == "low":
            severity_val = 0.3

    # 2. Attach to existing open defect within 15m or open a new defect
    defect_obj = None
    if not report_dict.get("defect_id") and lat is not None and lng is not None:
        defect_obj, is_new = dedupe_service.attach_or_create_defect(
            db=db_session,
            lat=lat,
            lng=lng,
            segment_id=segment_id,
            capture_source=capture_source,
            severity=severity_val,
            actor=report_dict.get("reportedBy") or actor
        )
        report_dict["defect_id"] = defect_obj.id
        
        # Initial report status matches defect state
        if not report_dict.get("status") or report_dict.get("status") == "Pending Analysis":
            report_dict["status"] = defect_obj.state

    new_report = report_schema.Report(**report_dict)
    db_session.add(new_report)
    db_session.commit()
    db_session.refresh(new_report)

    # 3. Immediately evaluate promotion policy on linked defect
    if report_dict.get("defect_id"):
        target_defect = defect_obj or db_session.query(Defect).filter(Defect.id == report_dict["defect_id"]).first()
        if target_defect:
            promotion_service.evaluate_promotion(db_session, target_defect, actor=report_dict.get("reportedBy") or actor)
            if new_report.status != target_defect.state:
                new_report.status = target_defect.state
                db_session.commit()
                db_session.refresh(new_report)

    return new_report

async def get_reports(
    reportedBy: Optional[str] = None, 
    status: Optional[str] = None, 
    segment_id: Optional[int] = None,
    defect_id: Optional[int] = None,
    db_session: Session = Depends(get_db)
) -> List[report_dto.Report]:
    query = db_session.query(report_schema.Report)
    if reportedBy:
        query = query.filter(report_schema.Report.reportedBy == reportedBy)
    if status:
        query = query.filter(report_schema.Report.status == status)
    if segment_id is not None:
        query = query.filter(report_schema.Report.segment_id == segment_id)
    if defect_id is not None:
        query = query.filter(report_schema.Report.defect_id == defect_id)
    return query.order_by(report_schema.Report.id.desc()).all()

async def get_report(report_id: int, db_session: Session = Depends(get_db)) -> report_dto.Report:
    report = db_session.query(report_schema.Report).filter(report_schema.Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    return report

async def update_report(report_id: int, report_update: report_dto.ReportUpdate, db_session: Session = Depends(get_db)):
    db_report = db_session.query(report_schema.Report).filter(report_schema.Report.id == report_id).first()
    if not db_report:
        raise HTTPException(status_code=404, detail="Report not found")
    
    update_data = report_update.model_dump(exclude_unset=True) if hasattr(report_update, "model_dump") else report_update.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_report, key, value)
        
    db_report.reportedDate = datetime.datetime.utcnow()
    
    db_session.commit()
    db_session.refresh(db_report)
    return db_report

async def delete_report(report_id: int, db_session: Session = Depends(get_db)):
    db_report = db_session.query(report_schema.Report).filter(report_schema.Report.id == report_id).first()
    if not db_report:
        raise HTTPException(status_code=404, detail="Report not found")
    
    db_session.delete(db_report)
    db_session.commit()
    return Response(status_code=204)
