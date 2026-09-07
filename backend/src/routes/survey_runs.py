from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List

from ..controllers import survey_run_controller
from ..schemas import survey_run_dto
from ..config.database import get_db

router = APIRouter()


@router.post("/survey-runs", response_model=survey_run_dto.SurveyRun)
async def create_survey_run_route(
    run: survey_run_dto.SurveyRunCreate,
    db_session: Session = Depends(get_db)
):
    return await survey_run_controller.create_survey_run(run, db_session=db_session)


@router.put("/survey-runs/{run_id}", response_model=survey_run_dto.SurveyRun)
async def update_survey_run_route(
    run_id: int,
    run_update: survey_run_dto.SurveyRunUpdate,
    db_session: Session = Depends(get_db)
):
    return await survey_run_controller.update_survey_run(run_id, run_update, db_session=db_session)


@router.get("/survey-runs", response_model=List[survey_run_dto.SurveyRun])
async def get_survey_runs_route(
    db_session: Session = Depends(get_db)
):
    return await survey_run_controller.get_survey_runs(db_session=db_session)


@router.get("/survey-runs/{run_id}", response_model=survey_run_dto.SurveyRun)
async def get_survey_run_route(
    run_id: int,
    db_session: Session = Depends(get_db)
):
    return await survey_run_controller.get_survey_run(run_id, db_session=db_session)
