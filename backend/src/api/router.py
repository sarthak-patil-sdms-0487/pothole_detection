from fastapi import APIRouter
from ..routes import reports, analyze, tenders, defects, slag

router = APIRouter()

router.include_router(reports.router, prefix="/api")
router.include_router(analyze.router, prefix="/api")
router.include_router(tenders.router, prefix="/api")
router.include_router(defects.router, prefix="/api")
router.include_router(slag.router, prefix="/api")
