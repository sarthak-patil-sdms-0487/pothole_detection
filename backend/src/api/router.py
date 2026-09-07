from fastapi import APIRouter
from ..routes import reports, analyze, tenders, defects, slag, survey_runs, stats

router = APIRouter()

router.include_router(reports.router, prefix="/api")
router.include_router(analyze.router, prefix="/api")
router.include_router(tenders.router, prefix="/api")
router.include_router(defects.router, prefix="/api")
router.include_router(slag.router, prefix="/api")
router.include_router(survey_runs.router, prefix="/api")
router.include_router(stats.router, prefix="/api")

