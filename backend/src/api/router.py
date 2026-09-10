from fastapi import APIRouter
from ..routes import reports, analyze, tenders, defects, slag, survey_runs, stats, repair_jobs, auth

router = APIRouter()

router.include_router(auth.router, prefix="/api")
router.include_router(reports.router, prefix="/api")
router.include_router(analyze.router, prefix="/api")
router.include_router(tenders.router, prefix="/api")
router.include_router(defects.router, prefix="/api")
router.include_router(slag.router, prefix="/api")
router.include_router(survey_runs.router, prefix="/api")
router.include_router(stats.router, prefix="/api")
router.include_router(repair_jobs.router, prefix="/api")

