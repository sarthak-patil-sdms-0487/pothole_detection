import math
import datetime
from typing import Optional, Tuple
from sqlalchemy.orm import Session
import logging

from ..schemas.defect import Defect
from ..schemas.report import Report
from ..services.audit_service import record_audit

logger = logging.getLogger(__name__)

def haversine_distance_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculates great-circle distance between two points in meters using Haversine formula."""
    R = 6371000.0  # Earth radius in meters
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = math.sin(delta_phi / 2.0) ** 2 + \
        math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return R * c

def attach_or_create_defect(
    db: Session,
    lat: Optional[float],
    lng: Optional[float],
    segment_id: Optional[int],
    capture_source: str,
    severity: Optional[float] = None,
    actor: str = "SURVEYOR",
    radius_meters: float = 20.0
) -> Tuple[Defect, bool]:
    """
    Groups raw sightings into defects using a 20-meter spatial radius on the road network.
    - If a matching open defect is found within 20m: attaches to existing defect (prevents duplicate defects).
    - If no match found: opens a new defect.
      * WORKER reports create defects directly in CONFIRMED state.
      * OPPORTUNISTIC captures create defects in SIGHTING state.
      
    :return: Tuple of (defect, is_new_defect)
    """
    capture_source = (capture_source or "WORKER").strip().upper()

    # 1. Look for existing open defect on the same segment (or within 20m radius)
    if lat is not None and lng is not None:
        query = db.query(Defect).filter(Defect.state != "CLOSED")
        if segment_id is not None:
            # First check same segment
            open_defects = query.filter(Defect.segment_id == segment_id).all()
        else:
            open_defects = query.all()

        for defect in open_defects:
            # Check distance against any linked reports for this defect
            linked_reports = db.query(Report).filter(
                Report.defect_id == defect.id,
                Report.lat.isnot(None),
                Report.lng.isnot(None)
            ).all()

            for rep in linked_reports:
                dist = haversine_distance_m(lat, lng, rep.lat, rep.lng)
                if dist <= radius_meters:
                    logger.info(
                        f"[DEDUPE] Sighting at ({lat:.5f}, {lng:.5f}) matched existing open Defect #{defect.id} "
                        f"at {dist:.2f}m (threshold: {radius_meters}m). Deduplicated successfully."
                    )
                    # Update defect severity if new sighting has higher severity
                    if severity is not None and (defect.severity is None or severity > defect.severity):
                        defect.severity = severity
                        db.commit()
                    return defect, False

    # 2. No matching open defect found -> create a new Defect
    now = datetime.datetime.utcnow()
    
    if capture_source == "WORKER":
        initial_state = "CONFIRMED"
        confirmed_at = now
        promotion_reason = "worker_report"
    else:
        initial_state = "SIGHTING"
        confirmed_at = None
        promotion_reason = "initial_opportunistic_sighting"

    new_defect = Defect(
        segment_id=segment_id,
        state=initial_state,
        first_seen_at=now,
        confirmed_at=confirmed_at,
        severity=severity,
        promotion_reason=promotion_reason,
        breach_flag=False
    )
    db.add(new_defect)
    db.commit()
    db.refresh(new_defect)

    record_audit(
        db=db,
        entity="defect",
        entity_id=new_defect.id,
        actor=actor,
        action="create_defect",
        from_status=None,
        to_status=initial_state,
        note=f"Defect opened via {capture_source} intake on segment #{segment_id}"
    )

    logger.info(f"[DEDUPE] Created new Defect #{new_defect.id} in state='{initial_state}' for segment #{segment_id}")
    return new_defect, True
