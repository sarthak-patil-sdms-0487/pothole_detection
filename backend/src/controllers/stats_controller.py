from sqlalchemy.orm import Session
from sqlalchemy import func

from ..schemas.report import Report
from ..schemas.defect import Defect
from ..schemas.survey_run import SurveyRun
from ..schemas.road_segment import RoadSegment
from ..config.database import get_db


async def get_dashboard_stats(db_session: Session):
    total_reports = db_session.query(func.count(Report.id)).scalar() or 0

    fixed_count = db_session.query(func.count(Report.id)).filter(
        Report.status.in_(["CLOSED", "Fixed", "Resolved", "Completed"])
    ).scalar() or 0

    open_count = db_session.query(func.count(Report.id)).filter(
        Report.status.notin_(["CLOSED", "Fixed", "Resolved", "Completed"])
    ).scalar() or 0

    # Count distinct defects in CLOSED state
    closed_defects = db_session.query(func.count(Defect.id)).filter(
        Defect.state == "CLOSED"
    ).scalar() or 0

    # Active segments with at least one open defect
    active_segments = db_session.query(func.count(func.distinct(Defect.segment_id))).filter(
        Defect.state != "CLOSED",
        Defect.segment_id.isnot(None)
    ).scalar() or 0

    # Survey run count
    survey_runs_count = db_session.query(func.count(SurveyRun.id)).scalar() or 0

    # Total road segments
    total_segments = db_session.query(func.count(RoadSegment.id)).scalar() or 0

    return {
        "total_reports": total_reports,
        "fixed_count": fixed_count,
        "open_count": open_count,
        "closed_defects": closed_defects,
        "active_segments": active_segments,
        "survey_runs_count": survey_runs_count,
        "total_segments": total_segments,
    }
