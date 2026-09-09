from fastapi import HTTPException, Response, UploadFile
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
import datetime

from ..schemas.defect import Defect
from ..schemas.report import Report
from ..schemas.road_segment import RoadSegment
from ..schemas.evidence import Evidence
from ..schemas.repair_job import RepairJob
from ..schemas.liability_verdict import LiabilityVerdict
from ..schemas import defect_dto
from ..services import promotion_service
from ..services import verification_service
from ..services import notice_service
from ..services.audit_service import record_audit

def format_defect_response(d: Defect, db: Session) -> defect_dto.DefectResponse:
    seg_name = None
    if d.segment_id is not None:
        seg = db.query(RoadSegment).filter(RoadSegment.id == d.segment_id).first()
        if seg:
            seg_name = seg.name

    # Calculate remaining SLA hours if NOTICED and open
    sla_remaining = None
    if d.state == "NOTICED" and d.sla_due_at:
        now = datetime.datetime.utcnow()
        delta = (d.sla_due_at - now).total_seconds() / 3600.0
        sla_remaining = round(delta, 1)

    # Check breach flag
    breach = d.breach_flag
    if d.state == "NOTICED" and d.sla_due_at and datetime.datetime.utcnow() > d.sla_due_at:
        breach = True
        if not d.breach_flag:
            d.breach_flag = True
            db.commit()

    # Get repeat sightings
    sightings = db.query(Report).filter(Report.defect_id == d.id).order_by(Report.id.desc()).all()
    sighting_briefs = [
        defect_dto.DefectReportBrief(
            id=r.id,
            original_image_url=r.original_image_url,
            annotated_image_url=r.annotated_image_url,
            lat=r.lat,
            lng=r.lng,
            capture_source=r.capture_source,
            reportedDate=r.reportedDate
        )
        for r in sightings
    ]

    # Get evidence list (BEFORE / AFTER)
    evidences = db.query(Evidence).filter(Evidence.defect_id == d.id).order_by(Evidence.id.asc()).all()
    evidence_briefs = [
        defect_dto.DefectEvidenceBrief(
            id=e.id,
            kind=e.kind,
            photo_uri=e.photo_uri,
            lat=e.lat,
            lng=e.lng,
            captured_at=e.captured_at
        )
        for e in evidences
    ]

    # Get latest liability verdict
    latest_verdict_rec = db.query(LiabilityVerdict).filter(
        LiabilityVerdict.defect_id == d.id
    ).order_by(LiabilityVerdict.id.desc()).first()

    latest_verdict_brief = None
    if latest_verdict_rec:
        latest_verdict_brief = defect_dto.DefectVerdictBrief(
            id=latest_verdict_rec.id,
            verdict=latest_verdict_rec.verdict,
            confidence=latest_verdict_rec.confidence,
            rationale=latest_verdict_rec.rationale,
            generated_at=latest_verdict_rec.generated_at
        )

    # Calculate current policy score
    config = promotion_service.get_estate_config(db, d.segment.estate_id if d.segment else None)
    policy_score = promotion_service.calculate_policy_score(db, d, config)

    return defect_dto.DefectResponse(
        id=d.id,
        segment_id=d.segment_id,
        segment_name=seg_name,
        state=d.state,
        first_seen_at=d.first_seen_at,
        confirmed_at=d.confirmed_at,
        noticed_at=d.noticed_at,
        sla_due_at=d.sla_due_at,
        sla_hours_remaining=sla_remaining,
        severity=d.severity,
        promotion_reason=d.promotion_reason,
        closed_at=d.closed_at,
        breach_flag=breach,
        repeat_sighting_count=len(sightings),
        policy_score=policy_score,
        latest_verdict=latest_verdict_brief,
        sightings=sighting_briefs,
        evidence_list=evidence_briefs
    )

async def get_defects(
    state: Optional[str] = None,
    segment_id: Optional[int] = None,
    breach_only: Optional[bool] = None,
    db: Session = None
) -> List[defect_dto.DefectResponse]:
    query = db.query(Defect)
    if state:
        query = query.filter(Defect.state == state.upper())
    if segment_id is not None:
        query = query.filter(Defect.segment_id == segment_id)
    if breach_only is True:
        query = query.filter(Defect.breach_flag == True)

    defects = query.order_by(Defect.id.desc()).all()
    return [format_defect_response(d, db) for d in defects]

async def get_defect(defect_id: int, db: Session) -> defect_dto.DefectResponse:
    d = db.query(Defect).filter(Defect.id == defect_id).first()
    if not d:
        raise HTTPException(status_code=404, detail="Defect not found")
    return format_defect_response(d, db)

async def delete_defect(defect_id: int, actor: str, db: Session) -> Dict[str, Any]:
    """
    Remove a defect and everything hanging off it. Used to discard false
    positives — the detector occasionally boxes a clean stretch of road, and
    those must not sit in the queue or reach a contractor as a complaint.
    """
    if str(actor).upper() != "ENGINEER":
        raise HTTPException(
            status_code=403,
            detail="Forbidden: Only SIDC Engineers can delete a defect."
        )

    d = db.query(Defect).filter(Defect.id == defect_id).first()
    if not d:
        raise HTTPException(status_code=404, detail="Defect not found")

    if d.state == "CLOSED":
        raise HTTPException(
            status_code=409,
            detail="Closed defects are part of the compliance record and cannot be deleted."
        )

    # Audit before the row disappears, so the deletion itself stays on record.
    record_audit(
        db=db,
        entity="defect",
        entity_id=defect_id,
        actor=actor,
        action="delete_defect",
        from_status=d.state,
        to_status="DELETED",
        note=f"Defect #{defect_id} deleted as a false positive by {actor}"
    )

    # Children first — reports are detached rather than dropped so the raw
    # sighting history survives; everything else belongs to the defect alone.
    reports = db.query(Report).filter(Report.defect_id == defect_id).all()
    for r in reports:
        r.defect_id = None
    db.query(Evidence).filter(Evidence.defect_id == defect_id).delete(synchronize_session=False)
    db.query(LiabilityVerdict).filter(LiabilityVerdict.defect_id == defect_id).delete(synchronize_session=False)
    db.query(RepairJob).filter(RepairJob.defect_id == defect_id).delete(synchronize_session=False)

    db.delete(d)
    db.commit()

    return {
        "deleted": True,
        "defect_id": defect_id,
        "detached_sightings": len(reports),
    }

async def manual_notice_defect(defect_id: int, actor: str, db: Session) -> defect_dto.DefectResponse:
    if str(actor).upper() != "ENGINEER":
        raise HTTPException(
            status_code=403,
            detail="Forbidden: Only SIDC Engineers can manually bring defects to official Notice."
        )

    d = db.query(Defect).filter(Defect.id == defect_id).first()
    if not d:
        raise HTTPException(status_code=404, detail="Defect not found")

    if d.state == "CLOSED":
        raise HTTPException(status_code=400, detail="Cannot notice a closed defect")

    promoted_defect = promotion_service.promote(
        db=db,
        defect=d,
        new_state="NOTICED",
        reason="engineer_accept",
        actor=actor
    )
    return format_defect_response(promoted_defect, db)

async def get_defect_notice(defect_id: int, db: Session) -> Dict[str, Any]:
    d = db.query(Defect).filter(Defect.id == defect_id).first()
    if not d:
        raise HTTPException(status_code=404, detail="Defect not found")
    return notice_service.generate_notice(db, defect_id)

async def send_defect_notice(defect_id: int, actor: str, force: bool, db: Session) -> Dict[str, Any]:
    if str(actor).upper() != "ENGINEER":
        raise HTTPException(
            status_code=403,
            detail="Forbidden: Only SIDC Engineers can dispatch official statutory notices."
        )

    d = db.query(Defect).filter(Defect.id == defect_id).first()
    if not d:
        raise HTTPException(status_code=404, detail="Defect not found")

    return notice_service.send_notice(db, defect_id, force=force, actor=actor)

async def submit_repair_evidence(
    defect_id: int,
    file: Optional[UploadFile] = None,
    photo_uri: Optional[str] = None,
    after_lat: Optional[float] = None,
    after_lng: Optional[float] = None,
    after_time: Optional[datetime.datetime] = None,
    contractor_notes: Optional[str] = None,
    material_type: Optional[str] = "Cold Mix Bitumen",
    material_kg: Optional[float] = 50.0,
    actor: str = "SURVEYOR",
    db: Session = None
) -> defect_dto.RepairEvidenceResponse:
    d = db.query(Defect).filter(Defect.id == defect_id).first()
    if not d:
        raise HTTPException(status_code=404, detail="Defect not found")

    image_bytes = None
    if file:
        image_bytes = await file.read()

    is_verified, details = verification_service.verify_repair(
        db=db,
        defect=d,
        image_bytes=image_bytes,
        photo_uri=photo_uri,
        after_lat=after_lat,
        after_lng=after_lng,
        after_time=after_time,
        contractor_notes=contractor_notes,
        material_type=material_type,
        material_kg=material_kg,
        assigned_to=actor
    )

    if not is_verified:
        raise HTTPException(
            status_code=422,
            detail={
                "message": "Repair verification failed",
                "details": details
            }
        )

    return defect_dto.RepairEvidenceResponse(
        verified=True,
        detections_found=details["detections_found"],
        distance_m=details["distance_m"],
        time_valid=details["time_valid"],
        errors=[],
        photo_uri=photo_uri or "/uploads/after_verified.jpg"
    )

async def close_defect(
    defect_id: int,
    close_req: defect_dto.CloseDefectRequest,
    actor: str,
    db: Session
) -> defect_dto.CloseDefectResponse:
    d = db.query(Defect).filter(Defect.id == defect_id).first()
    if not d:
        raise HTTPException(status_code=404, detail="Defect not found")

    if d.state == "CLOSED":
        raise HTTPException(status_code=400, detail="Defect is already closed")

    # Check for passing AFTER evidence
    after_evidence = db.query(Evidence).filter(
        Evidence.defect_id == d.id,
        Evidence.kind == "AFTER"
    ).first()

    if not after_evidence and not close_req.override_verification:
        raise HTTPException(
            status_code=400,
            detail="Cannot close defect without verified AFTER repair evidence. Engineer override required."
        )

    if close_req.override_verification and str(actor).upper() != "ENGINEER":
        raise HTTPException(
            status_code=403,
            detail="Forbidden: Only PWD/MIDC Engineers can override missing repair evidence to close defect."
        )

    now = datetime.datetime.utcnow()
    d.state = "CLOSED"
    d.closed_at = now

    # Compute SLA breach flag
    breach = False
    if d.sla_due_at:
        breach = (d.closed_at > d.sla_due_at)
    d.breach_flag = breach

    # Compute latency
    start_time = d.noticed_at or d.first_seen_at or now
    latency_hours = max(0.0, (d.closed_at - start_time).total_seconds() / 3600.0)

    # Record audit log
    record_audit(
        db=db,
        entity="defect",
        entity_id=d.id,
        actor=actor,
        action="close_defect",
        from_status="NOTICED",
        to_status="CLOSED",
        note=f"Closed by {actor}. SLA breached: {breach}. Latency: {latency_hours:.1f}h. Reason: {close_req.reason or 'Normal repair completion'}"
    )

    # Sync reports
    linked_reports = db.query(Report).filter(Report.defect_id == d.id).all()
    for r in linked_reports:
        r.status = "CLOSED"

    db.commit()
    db.refresh(d)

    return defect_dto.CloseDefectResponse(
        defect_id=d.id,
        state="CLOSED",
        closed_at=d.closed_at,
        sla_due_at=d.sla_due_at,
        breach_flag=d.breach_flag,
        latency_hours=round(latency_hours, 2),
        closed_by=actor,
        message="Defect successfully closed and verified."
    )

async def sweep_defects(db: Session) -> defect_dto.SweepResponse:
    evaluated, promoted = promotion_service.sweep_ageing_defects(db)
    return defect_dto.SweepResponse(
        evaluated_count=evaluated,
        promoted_to_noticed_count=promoted
    )
