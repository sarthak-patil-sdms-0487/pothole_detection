from fastapi import APIRouter, Depends, UploadFile, File, Form, Query
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any

from ..controllers import defect_controller
from ..schemas import defect_dto
from ..config.database import get_db
from ..middlewares.role import get_current_role

router = APIRouter()

@router.get("/defects", response_model=List[defect_dto.DefectResponse])
async def get_defects_route(
    state: Optional[str] = None,
    segment_id: Optional[int] = None,
    breach_only: Optional[bool] = None,
    db: Session = Depends(get_db)
):
    return await defect_controller.get_defects(state, segment_id, breach_only, db)

@router.get("/defects/{defect_id}", response_model=defect_dto.DefectResponse)
async def get_defect_route(
    defect_id: int,
    db: Session = Depends(get_db)
):
    return await defect_controller.get_defect(defect_id, db)

@router.post("/defects/{defect_id}/notice", response_model=defect_dto.DefectResponse)
async def manual_notice_defect_route(
    defect_id: int,
    role: str = Depends(get_current_role),
    db: Session = Depends(get_db)
):
    return await defect_controller.manual_notice_defect(defect_id, role, db)

@router.get("/defects/{defect_id}/notice", response_model=Dict[str, Any])
async def get_defect_notice_route(
    defect_id: int,
    db: Session = Depends(get_db)
):
    return await defect_controller.get_defect_notice(defect_id, db)

@router.post("/defects/{defect_id}/notice/send", response_model=Dict[str, Any])
async def send_defect_notice_route(
    defect_id: int,
    force: bool = Query(False),
    role: str = Depends(get_current_role),
    db: Session = Depends(get_db)
):
    return await defect_controller.send_defect_notice(defect_id, role, force, db)

@router.post("/defects/{defect_id}/repair-evidence", response_model=defect_dto.RepairEvidenceResponse)
async def submit_repair_evidence_route(
    defect_id: int,
    file: Optional[UploadFile] = File(None),
    photo_uri: Optional[str] = Form(None),
    after_lat: Optional[float] = Form(None),
    after_lng: Optional[float] = Form(None),
    contractor_notes: Optional[str] = Form(None),
    material_type: Optional[str] = Form("Cold Mix Bitumen"),
    material_kg: Optional[float] = Form(50.0),
    role: str = Depends(get_current_role),
    db: Session = Depends(get_db)
):
    return await defect_controller.submit_repair_evidence(
        defect_id=defect_id,
        file=file,
        photo_uri=photo_uri,
        after_lat=after_lat,
        after_lng=after_lng,
        contractor_notes=contractor_notes,
        material_type=material_type,
        material_kg=material_kg,
        actor=role,
        db=db
    )

@router.post("/defects/{defect_id}/close", response_model=defect_dto.CloseDefectResponse)
async def close_defect_route(
    defect_id: int,
    close_req: defect_dto.CloseDefectRequest,
    role: str = Depends(get_current_role),
    db: Session = Depends(get_db)
):
    return await defect_controller.close_defect(defect_id, close_req, role, db)

@router.post("/defects/sweep", response_model=defect_dto.SweepResponse)
async def sweep_defects_route(db: Session = Depends(get_db)):
    return await defect_controller.sweep_defects(db)
