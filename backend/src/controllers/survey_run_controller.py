from fastapi import HTTPException, Depends
from sqlalchemy.orm import Session
from typing import List
import datetime

from ..schemas import survey_run_dto
from ..schemas.survey_run import SurveyRun
from ..config.database import get_db


async def create_survey_run(
    run: survey_run_dto.SurveyRunCreate,
    db_session: Session = Depends(get_db)
):
    run_dict = run.model_dump() if hasattr(run, "model_dump") else run.dict()
    new_run = SurveyRun(**run_dict)
    db_session.add(new_run)
    db_session.commit()
    db_session.refresh(new_run)
    return new_run


async def update_survey_run(
    run_id: int,
    run_update: survey_run_dto.SurveyRunUpdate,
    db_session: Session = Depends(get_db)
):
    db_run = db_session.query(SurveyRun).filter(SurveyRun.id == run_id).first()
    if not db_run:
        raise HTTPException(status_code=404, detail="Survey run not found")

    update_data = run_update.model_dump(exclude_unset=True) if hasattr(run_update, "model_dump") else run_update.dict(exclude_unset=True)

    # Auto-set ended_at if not explicitly provided but stats are being updated
    if "ended_at" not in update_data or update_data.get("ended_at") is None:
        update_data["ended_at"] = datetime.datetime.utcnow()

    for key, value in update_data.items():
        setattr(db_run, key, value)

    db_session.commit()
    db_session.refresh(db_run)
    return db_run


async def get_survey_runs(
    db_session: Session = Depends(get_db)
) -> List[survey_run_dto.SurveyRun]:
    return db_session.query(SurveyRun).order_by(SurveyRun.id.desc()).all()


async def get_survey_run(
    run_id: int,
    db_session: Session = Depends(get_db)
):
    run = db_session.query(SurveyRun).filter(SurveyRun.id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Survey run not found")
    return run
