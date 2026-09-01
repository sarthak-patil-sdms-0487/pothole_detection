import datetime
from typing import Optional, Dict, Any, Tuple
from sqlalchemy.orm import Session
import logging

from ..schemas.defect import Defect
from ..schemas.report import Report
from ..schemas.estate import Estate
from ..schemas.road_segment import RoadSegment
from ..services.audit_service import record_audit
from ..services.liability_service import evaluate_liability
from ..services import notice_service

logger = logging.getLogger(__name__)

DEFAULT_CONFIG: Dict[str, Any] = {
    "confirm_repeat_threshold": 2,
    "notice_threshold": 2.5,
    "w_severity": 1.0,
    "w_traffic": 0.8,
    "w_gate_proximity": 0.5,
    "w_active_dlp": 0.6,
    "w_age": 0.1
}

def get_estate_config(db: Session, estate_id: Optional[int]) -> Dict[str, Any]:
    if estate_id is not None:
        estate = db.query(Estate).filter(Estate.id == estate_id).first()
        if estate and estate.config_json and isinstance(estate.config_json, dict):
            merged = DEFAULT_CONFIG.copy()
            merged.update(estate.config_json)
            return merged
    return DEFAULT_CONFIG.copy()

def age_in_days(defect: Defect) -> float:
    if not defect.first_seen_at:
        return 0.0
    delta = datetime.datetime.utcnow() - defect.first_seen_at
    return max(0.0, delta.total_seconds() / 86400.0)

def get_repeat_sighting_count(db: Session, defect_id: int) -> int:
    return db.query(Report).filter(Report.defect_id == defect_id).count()

def has_corroborating_capture(db: Session, defect_id: int) -> bool:
    reports = db.query(Report).filter(Report.defect_id == defect_id).all()
    for r in reports:
        source = (r.capture_source or "").upper()
        if source in ["WORKER", "SURVEY"]:
            return True
    return False

def calculate_policy_score(db: Session, defect: Defect, config: Dict[str, Any]) -> float:
    severity = defect.severity if defect.severity is not None else 0.5
    
    traffic_weight = 1.0
    gate_prox = 0.0
    active_dlp = 0.0

    if defect.segment_id is not None:
        segment = db.query(RoadSegment).filter(RoadSegment.id == defect.segment_id).first()
        if segment:
            traffic_weight = segment.traffic_class_weight if segment.traffic_class_weight is not None else 1.0
            gate_prox = 1.0 if segment.near_gate_or_weighbridge else 0.0
            active_dlp = 1.0 if segment.has_active_dlp else 0.0

    age = age_in_days(defect)

    score = (
        config.get("w_severity", 1.0) * severity +
        config.get("w_traffic", 0.8) * traffic_weight +
        config.get("w_gate_proximity", 0.5) * gate_prox +
        config.get("w_active_dlp", 0.6) * active_dlp +
        config.get("w_age", 0.1) * age
    )
    return round(score, 3)

def promote(
    db: Session,
    defect: Defect,
    new_state: str,
    reason: str,
    actor: str = "policy_engine"
) -> Defect:
    """
    Executes a formal state promotion for a defect, updates audit trail,
    and sets statutory timestamps/SLA clocks.
    """
    from_state = defect.state
    if from_state == new_state:
        return defect

    now = datetime.datetime.utcnow()
    defect.state = new_state
    defect.promotion_reason = reason

    if new_state == "CONFIRMED":
        if not defect.confirmed_at:
            defect.confirmed_at = now

    elif new_state == "NOTICED":
        if not defect.confirmed_at:
            defect.confirmed_at = now
        if not defect.noticed_at:
            defect.noticed_at = now
            # Statutory 48-Hour SLA Mandate
            defect.sla_due_at = now + datetime.timedelta(hours=48)
            defect.breach_flag = False

        # Automatically evaluate contractor warranty & liability on entering NOTICED
        try:
            verdict_rec = evaluate_liability(db, defect.id)
            if verdict_rec and verdict_rec.verdict == "IN_WARRANTY":
                notice_service.send_notice(db, defect.id, actor=actor)
        except Exception as e:
            logger.error(f"[PROMOTION] Liability / Notice dispatch error on Defect #{defect.id}: {e}")

    # Record immutable audit log
    record_audit(
        db=db,
        entity="defect",
        entity_id=defect.id,
        actor=actor,
        action=f"promote_to_{new_state.lower()}",
        from_status=from_state,
        to_status=new_state,
        note=f"Promoted to {new_state} via {reason}"
    )

    # Sync state to linked reports
    linked_reports = db.query(Report).filter(Report.defect_id == defect.id).all()
    for r in linked_reports:
        r.status = new_state

    db.commit()
    db.refresh(defect)
    logger.info(f"[PROMOTION] Defect #{defect.id} transitioned {from_state} -> {new_state} (reason: {reason})")
    return defect

def evaluate_promotion(
    db: Session,
    defect: Defect,
    actor: str = "policy_engine"
) -> Tuple[Defect, bool]:
    """
    Runs the published config-driven promotion policy on a defect.
    Evaluates SIGHTING -> CONFIRMED and CONFIRMED -> NOTICED.
    
    :return: Tuple of (updated_defect, was_promoted_bool)
    """
    if defect.state == "CLOSED":
        return defect, False

    # Get estate config
    estate_id = None
    if defect.segment_id is not None:
        seg = db.query(RoadSegment).filter(RoadSegment.id == defect.segment_id).first()
        if seg:
            estate_id = seg.estate_id
    
    config = get_estate_config(db, estate_id)
    initial_state = defect.state

    # Stage 1: SIGHTING -> CONFIRMED
    if defect.state == "SIGHTING":
        repeat_count = get_repeat_sighting_count(db, defect.id)
        if repeat_count >= config.get("confirm_repeat_threshold", 2):
            promote(db, defect, "CONFIRMED", reason=f"repeat_sighting ({repeat_count} sightings)", actor=actor)
        elif has_corroborating_capture(db, defect.id):
            promote(db, defect, "CONFIRMED", reason="corroborated_capture", actor=actor)

    # Stage 2: CONFIRMED -> NOTICED
    if defect.state == "CONFIRMED":
        score = calculate_policy_score(db, defect, config)
        notice_threshold = config.get("notice_threshold", 2.5)
        if score >= notice_threshold:
            promote(db, defect, "NOTICED", reason=f"policy_threshold (score={score} >= {notice_threshold})", actor=actor)

    was_promoted = (defect.state != initial_state)
    return defect, was_promoted

def sweep_ageing_defects(db: Session) -> Tuple[int, int]:
    """
    Evaluates all open CONFIRMED and SIGHTING defects for age/repeat-based promotion.
    
    :return: Tuple of (evaluated_count, promoted_count)
    """
    open_defects = db.query(Defect).filter(Defect.state.in_(["SIGHTING", "CONFIRMED"])).all()
    promoted_count = 0
    for defect in open_defects:
        _, promoted = evaluate_promotion(db, defect, actor="policy_sweep")
        if promoted:
            promoted_count += 1
    return len(open_defects), promoted_count
