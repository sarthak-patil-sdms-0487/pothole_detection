from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List

from ..controllers import slag_controller
from ..schemas import slag_dto
from ..config.database import get_db
from ..middlewares.role import get_current_role

router = APIRouter()

@router.get("/slag/summary", response_model=slag_dto.SlagSummaryResponse)
async def get_slag_summary_route(db: Session = Depends(get_db)):
    return await slag_controller.get_slag_summary(db)

@router.get("/slag/lots", response_model=List[slag_dto.SlagLotResponse])
async def get_slag_lots_route(db: Session = Depends(get_db)):
    return await slag_controller.get_slag_lots(db)

@router.post("/slag/lots", response_model=slag_dto.SlagLotResponse)
async def create_slag_lot_route(
    lot: slag_dto.SlagLotCreate,
    role: str = Depends(get_current_role),
    db: Session = Depends(get_db)
):
    return await slag_controller.create_slag_lot(lot, role, db)

@router.get("/slag/draws", response_model=List[slag_dto.SlagDrawResponse])
async def get_slag_draws_route(db: Session = Depends(get_db)):
    return await slag_controller.get_slag_draws(db)

@router.post("/slag/draws", response_model=slag_dto.SlagDrawResponse)
async def record_slag_draw_route(
    draw: slag_dto.SlagDrawCreate,
    role: str = Depends(get_current_role),
    db: Session = Depends(get_db)
):
    return await slag_controller.record_slag_draw(draw, role, db)
