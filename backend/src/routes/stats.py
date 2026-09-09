from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import Any, Dict, List

from ..controllers import stats_controller
from ..config.database import get_db

router = APIRouter()


@router.get("/stats/dashboard")
async def get_dashboard_stats_route(
    db_session: Session = Depends(get_db)
):
    return await stats_controller.get_dashboard_stats(db_session=db_session)


@router.get("/stats/contractors", response_model=List[Dict[str, Any]])
async def get_contractor_scorecards_route(
    db_session: Session = Depends(get_db)
):
    return await stats_controller.get_contractor_scorecards(db_session=db_session)


@router.get("/stats/ageing-sightings", response_model=List[Dict[str, Any]])
async def get_ageing_sightings_route(
    min_age_hours: float = Query(0.0, ge=0.0),
    db_session: Session = Depends(get_db)
):
    return await stats_controller.get_ageing_sightings(
        db_session=db_session, min_age_hours=min_age_hours
    )
