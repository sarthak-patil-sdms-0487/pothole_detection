from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..controllers import stats_controller
from ..config.database import get_db

router = APIRouter()


@router.get("/stats/dashboard")
async def get_dashboard_stats_route(
    db_session: Session = Depends(get_db)
):
    return await stats_controller.get_dashboard_stats(db_session=db_session)
