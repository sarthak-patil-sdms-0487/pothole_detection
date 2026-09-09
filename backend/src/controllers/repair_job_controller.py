import datetime
from typing import List, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..schemas.defect import Defect
from ..schemas.road_segment import RoadSegment
from ..schemas.evidence import Evidence
from ..schemas.repair_job import RepairJob
from ..schemas.tender import Tender
from ..schemas.liability_verdict import LiabilityVerdict
from ..schemas import repair_job_dto
from ..services.audit_service import record_audit

# States that represent actual repair work: brought to notice, or already closed.
# SIGHTING and CONFIRMED are deliberately excluded — nothing is owed on them yet.
WORK_ORDER_STATES = ["NOTICED", "CLOSED"]


def _sla_hours_remaining(defect: Defect) -> Optional[float]:
    if not defect.sla_due_at:
        return None
    reference = defect.closed_at or datetime.datetime.utcnow()
    return round((defect.sla_due_at - reference).total_seconds() / 3600.0, 1)


def _to_work_order(
    defect: Defect,
    segment_name: Optional[str],
    verdict: Optional[LiabilityVerdict],
    tender: Optional[Tender],
    job: Optional[RepairJob],
    evidence_kinds: set,
) -> repair_job_dto.WorkOrder:
    breach = bool(defect.breach_flag)
    if defect.state == "NOTICED" and defect.sla_due_at and datetime.datetime.utcnow() > defect.sla_due_at:
        breach = True

    return repair_job_dto.WorkOrder(
        defect_id=defect.id,
        state=defect.state,
        severity=defect.severity,
        segment_id=defect.segment_id,
        segment_name=segment_name,
        contractor_name=tender.contractor_name if tender else None,
        tender_ref=tender.tender_ref if tender else None,
        verdict=verdict.verdict if verdict else None,
        noticed_at=defect.noticed_at,
        sla_due_at=defect.sla_due_at,
        sla_hours_remaining=_sla_hours_remaining(defect),
        breach_flag=breach,
        closed_at=defect.closed_at,
        has_before_evidence="BEFORE" in evidence_kinds,
        has_after_evidence="AFTER" in evidence_kinds,
        job=repair_job_dto.RepairJobBrief(
            id=job.id,
            assigned_to=job.assigned_to,
            started_at=job.started_at,
            completed_at=job.completed_at,
            material_type=job.material_type,
            material_kg=job.material_kg,
            cost_inr=float(job.cost_inr) if job.cost_inr is not None else None,
        ) if job else None,
    )


async def get_work_orders(
    state: Optional[str] = None,
    breach_only: Optional[bool] = None,
    unassigned_only: Optional[bool] = None,
    db: Session = None,
) -> List[repair_job_dto.WorkOrder]:
    """
    The repair queue: every defect carrying a live or spent 48-hour clock.

    Rows are built from the defect, its latest liability verdict (for contractor
    attribution), its repair job, and its evidence pair. Ordered by urgency —
    breaches first, then least time remaining.
    """
    states = [state.upper()] if state else WORK_ORDER_STATES
    defects = db.query(Defect).filter(Defect.state.in_(states)).all()
    if not defects:
        return []

    defect_ids = [d.id for d in defects]

    segment_names = {s.id: s.name for s in db.query(RoadSegment).all()}

    # Latest verdict per defect — verdicts are append-only.
    verdicts = {}
    for v in db.query(LiabilityVerdict).filter(
        LiabilityVerdict.defect_id.in_(defect_ids)
    ).order_by(LiabilityVerdict.id.asc()).all():
        verdicts[v.defect_id] = v

    tenders = {t.id: t for t in db.query(Tender).all()}

    jobs = {}
    for j in db.query(RepairJob).filter(RepairJob.defect_id.in_(defect_ids)).all():
        jobs[j.defect_id] = j

    evidence_kinds = {}
    for e in db.query(Evidence).filter(Evidence.defect_id.in_(defect_ids)).all():
        evidence_kinds.setdefault(e.defect_id, set()).add(e.kind)

    rows = []
    for d in defects:
        verdict = verdicts.get(d.id)
        tender = tenders.get(verdict.tender_id) if verdict and verdict.tender_id else None
        row = _to_work_order(
            d,
            segment_names.get(d.segment_id),
            verdict,
            tender,
            jobs.get(d.id),
            evidence_kinds.get(d.id, set()),
        )

        if breach_only is True and not row.breach_flag:
            continue
        if unassigned_only is True and row.job is not None and row.job.assigned_to:
            continue
        rows.append(row)

    def urgency(r: repair_job_dto.WorkOrder):
        # Open breaches first, then the tightest clock, then closed work last.
        return (
            r.state == "CLOSED",
            not r.breach_flag,
            r.sla_hours_remaining if r.sla_hours_remaining is not None else 9999,
        )

    rows.sort(key=urgency)
    return rows


async def upsert_repair_job(
    payload: repair_job_dto.RepairJobUpsert,
    actor: str,
    db: Session,
) -> repair_job_dto.WorkOrder:
    """
    Assigns a crew and materials to a defect's repair job, creating the job if it
    does not exist yet. Assignment is an engineer action and is audit-logged.
    """
    if str(actor).upper() != "ENGINEER":
        raise HTTPException(
            status_code=403,
            detail="Forbidden: Only SIDC Engineers can assign repair work.",
        )

    defect = db.query(Defect).filter(Defect.id == payload.defect_id).first()
    if not defect:
        raise HTTPException(status_code=404, detail="Defect not found")

    if defect.state not in WORK_ORDER_STATES:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Defect #{defect.id} is in state {defect.state}. Repair work can only be "
                "assigned once a defect has been brought to notice."
            ),
        )

    job = db.query(RepairJob).filter(RepairJob.defect_id == defect.id).first()
    is_new = job is None
    if is_new:
        job = RepairJob(defect_id=defect.id)
        db.add(job)

    if payload.assigned_to is not None:
        job.assigned_to = payload.assigned_to
    if payload.material_type is not None:
        job.material_type = payload.material_type
    if payload.material_kg is not None:
        job.material_kg = payload.material_kg
    if payload.cost_inr is not None:
        job.cost_inr = payload.cost_inr
    if payload.start_now and not job.started_at:
        job.started_at = datetime.datetime.utcnow()

    db.commit()
    db.refresh(job)

    record_audit(
        db=db,
        entity="repair_job",
        entity_id=job.id,
        actor=actor,
        action="assign_repair_job" if is_new else "update_repair_job",
        from_status=defect.state,
        to_status=defect.state,
        note=(
            f"Repair job for defect #{defect.id} assigned to {job.assigned_to or 'unassigned'}; "
            f"material {job.material_type or 'n/a'} {job.material_kg or 0}kg."
        ),
    )

    segment_name = None
    if defect.segment_id is not None:
        seg = db.query(RoadSegment).filter(RoadSegment.id == defect.segment_id).first()
        segment_name = seg.name if seg else None

    verdict = db.query(LiabilityVerdict).filter(
        LiabilityVerdict.defect_id == defect.id
    ).order_by(LiabilityVerdict.id.desc()).first()
    tender = None
    if verdict and verdict.tender_id:
        tender = db.query(Tender).filter(Tender.id == verdict.tender_id).first()

    kinds = {
        e.kind for e in db.query(Evidence).filter(Evidence.defect_id == defect.id).all()
    }

    return _to_work_order(defect, segment_name, verdict, tender, job, kinds)
