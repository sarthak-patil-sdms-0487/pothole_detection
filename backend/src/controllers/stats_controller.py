import datetime
from typing import Any, Dict, List

from sqlalchemy.orm import Session
from sqlalchemy import func

from ..schemas.report import Report
from ..schemas.defect import Defect
from ..schemas.survey_run import SurveyRun
from ..schemas.road_segment import RoadSegment
from ..schemas.tender import Tender
from ..schemas.repair_job import RepairJob
from ..schemas.liability_verdict import LiabilityVerdict
from ..schemas.slag_dto import STANDARD_SLAG_RATE_INR_PER_KG

CLOSED_REPORT_STATUSES = ["CLOSED", "Fixed", "Resolved", "Completed"]


async def get_dashboard_stats(db_session: Session):
    total_reports = db_session.query(func.count(Report.id)).scalar() or 0

    fixed_count = db_session.query(func.count(Report.id)).filter(
        Report.status.in_(CLOSED_REPORT_STATUSES)
    ).scalar() or 0

    open_count = db_session.query(func.count(Report.id)).filter(
        Report.status.notin_(CLOSED_REPORT_STATUSES)
    ).scalar() or 0

    closed_defects = db_session.query(func.count(Defect.id)).filter(
        Defect.state == "CLOSED"
    ).scalar() or 0

    active_segments = db_session.query(func.count(func.distinct(Defect.segment_id))).filter(
        Defect.state != "CLOSED",
        Defect.segment_id.isnot(None)
    ).scalar() or 0

    survey_runs_count = db_session.query(func.count(SurveyRun.id)).scalar() or 0
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


def _latest_verdict_by_defect(db_session: Session) -> Dict[int, LiabilityVerdict]:
    """
    Maps defect_id -> its most recent liability verdict.

    Verdicts are append-only, so a defect can carry several. Attribution always
    follows the latest one.
    """
    latest: Dict[int, LiabilityVerdict] = {}
    verdicts = db_session.query(LiabilityVerdict).order_by(LiabilityVerdict.id.asc()).all()
    for v in verdicts:
        if v.defect_id is not None:
            latest[v.defect_id] = v
    return latest


def _repair_cost_inr(job: RepairJob) -> float:
    """
    Cost of a repair job. Falls back to a notional slag-rate valuation when no
    invoiced cost has been entered, so the recoverable column is never blank
    just because a cost field was left empty.
    """
    if job is None:
        return 0.0
    if job.cost_inr is not None:
        return float(job.cost_inr)
    if job.material_kg:
        return round(float(job.material_kg) * STANDARD_SLAG_RATE_INR_PER_KG, 2)
    return 0.0


async def get_contractor_scorecards(db_session: Session) -> List[Dict[str, Any]]:
    """
    Per-contractor rollup driven entirely by live records.

    A defect counts against a contractor when its latest liability verdict names
    that contractor's tender. Recoverable cost is the repair cost of defects that
    fell inside an active DLP — the money SIDC should not be paying.

    Every figure here is a probable attribution derived from segment mapping, and
    is to be verified against the tender documents before any recovery action.
    """
    today = datetime.date.today()
    latest_verdicts = _latest_verdict_by_defect(db_session)

    defects = {d.id: d for d in db_session.query(Defect).all()}
    jobs_by_defect: Dict[int, RepairJob] = {
        j.defect_id: j for j in db_session.query(RepairJob).all() if j.defect_id is not None
    }

    rows: Dict[int, Dict[str, Any]] = {}

    for tender in db_session.query(Tender).order_by(Tender.id.asc()).all():
        rows[tender.id] = {
            "tender_id": tender.id,
            "tender_ref": tender.tender_ref,
            "name": tender.contractor_name,
            "contractor_email": tender.contractor_contact_email,
            "dlp_expiry_date": tender.dlp_expiry_date.isoformat() if tender.dlp_expiry_date else None,
            "dlp_status": "IN_WARRANTY" if (tender.dlp_expiry_date and tender.dlp_expiry_date >= today) else "EXPIRED",
            "defects_raised": 0,
            "in_dlp_count": 0,
            "notices_issued": 0,
            "fixed_within_sla": 0,
            "sla_breaches": 0,
            "open_count": 0,
            "compliance_rate": 0.0,
            "recoverable_cost_inr": 0.0,
        }

    for defect_id, verdict in latest_verdicts.items():
        row = rows.get(verdict.tender_id)
        defect = defects.get(defect_id)
        if row is None or defect is None:
            continue

        row["defects_raised"] += 1

        in_warranty = verdict.verdict == "IN_WARRANTY"
        if in_warranty:
            row["in_dlp_count"] += 1

        if defect.noticed_at:
            row["notices_issued"] += 1

        if defect.state == "CLOSED":
            if defect.breach_flag:
                row["sla_breaches"] += 1
            else:
                row["fixed_within_sla"] += 1
            if in_warranty:
                row["recoverable_cost_inr"] += _repair_cost_inr(jobs_by_defect.get(defect_id))
        else:
            # An open defect past its deadline is already a breach, whether or not
            # the close-time flag has been written yet.
            if defect.breach_flag or (defect.sla_due_at and datetime.datetime.utcnow() > defect.sla_due_at):
                row["sla_breaches"] += 1
            row["open_count"] += 1

    results = []
    for row in rows.values():
        resolved = row["fixed_within_sla"] + row["sla_breaches"]
        row["compliance_rate"] = round((row["fixed_within_sla"] / resolved) * 100.0, 1) if resolved else 0.0
        row["recoverable_cost_inr"] = round(row["recoverable_cost_inr"], 2)
        if row["defects_raised"] > 0:
            results.append(row)

    results.sort(key=lambda r: (-r["recoverable_cost_inr"], -r["sla_breaches"]))
    return results


async def get_ageing_sightings(db_session: Session, min_age_hours: float = 0.0) -> List[Dict[str, Any]]:
    """
    Unpromoted defects — SIGHTING and CONFIRMED — ordered oldest first.

    Sightings are never deleted, and one of the designed controls against an
    officer quietly suppressing promotion is that ageing unpromoted sightings stay
    visible. This is the endpoint that makes that control real rather than a claim.
    """
    from ..services import promotion_service

    now = datetime.datetime.utcnow()
    defects = db_session.query(Defect).filter(
        Defect.state.in_(["SIGHTING", "CONFIRMED"])
    ).order_by(Defect.first_seen_at.asc()).all()

    segment_names = {s.id: s.name for s in db_session.query(RoadSegment).all()}

    rows = []
    for d in defects:
        age_hours = ((now - d.first_seen_at).total_seconds() / 3600.0) if d.first_seen_at else 0.0
        if age_hours < min_age_hours:
            continue

        config = promotion_service.get_estate_config(
            db_session, d.segment.estate_id if d.segment else None
        )

        rows.append({
            "defect_id": d.id,
            "state": d.state,
            "segment_id": d.segment_id,
            "segment_name": segment_names.get(d.segment_id),
            "first_seen_at": d.first_seen_at.isoformat() if d.first_seen_at else None,
            "age_hours": round(age_hours, 1),
            "age_days": round(age_hours / 24.0, 1),
            "severity": d.severity,
            "repeat_sighting_count": promotion_service.get_repeat_sighting_count(db_session, d.id),
            "policy_score": promotion_service.calculate_policy_score(db_session, d, config),
            "notice_threshold": config.get("notice_threshold"),
        })

    return rows
