from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List, Optional

from ..controllers import tender_controller
from ..schemas import tender_dto
from ..config.database import get_db

router = APIRouter()

@router.post("/tenders", response_model=tender_dto.TenderResponse)
async def create_tender_route(
    tender: tender_dto.TenderCreate,
    db: Session = Depends(get_db)
):
    return await tender_controller.create_tender(tender, db)

@router.get("/tenders", response_model=List[tender_dto.TenderResponse])
async def get_tenders_route(
    active_only: Optional[bool] = None,
    contractor: Optional[str] = None,
    db: Session = Depends(get_db)
):
    return await tender_controller.get_tenders(active_only, contractor, db)

@router.get("/tenders/segments", response_model=List[tender_dto.SegmentBrief])
async def get_segments_route(db: Session = Depends(get_db)):
    return await tender_controller.get_all_segments(db)

@router.get("/tenders/{tender_id}", response_model=tender_dto.TenderResponse)
async def get_tender_route(
    tender_id: int,
    db: Session = Depends(get_db)
):
    return await tender_controller.get_tender(tender_id, db)

@router.put("/tenders/{tender_id}", response_model=tender_dto.TenderResponse)
async def update_tender_route(
    tender_id: int,
    tender_update: tender_dto.TenderUpdate,
    db: Session = Depends(get_db)
):
    return await tender_controller.update_tender(tender_id, tender_update, db)

@router.delete("/tenders/{tender_id}", status_code=204)
async def delete_tender_route(
    tender_id: int,
    db: Session = Depends(get_db)
):
    return await tender_controller.delete_tender(tender_id, db)

@router.post("/tenders/{tender_id}/segments", response_model=tender_dto.TenderResponse)
async def map_segments_route(
    tender_id: int,
    map_req: tender_dto.TenderSegmentMapRequest,
    db: Session = Depends(get_db)
):
    return await tender_controller.map_tender_segments(tender_id, map_req.segment_ids, db)
