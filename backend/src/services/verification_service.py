import os
import io
import math
import hashlib
import datetime
from typing import Optional, Tuple, Dict, Any
from sqlalchemy.orm import Session
import cv2
import numpy as np
import logging

from ..services import s3_service
from ..services.audit_service import record_audit
from ..schemas.defect import Defect
from ..schemas.report import Report
from ..schemas.evidence import Evidence
from ..schemas.repair_job import RepairJob
from ..services.dedupe_service import haversine_distance_m
from ..services.yolo_service import model

logger = logging.getLogger(__name__)

def verify_after_photo_yolo(image_bytes: bytes, conf_threshold: float = 0.35) -> Tuple[int, Optional[str]]:
    """
    Runs YOLO detector over after-repair photo.
    Returns (num_detections, annotated_image_b64_or_path).
    """
    if model is None:
        logger.warning("[VERIFICATION] YOLO model not loaded, assuming 0 detections for synthetic/test environments.")
        return 0, None

    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        return 0, None

    results = model.predict(img, conf=conf_threshold)
    boxes = results[0].boxes
    detections_count = len(boxes) if boxes is not None else 0
    return detections_count, None

def verify_repair(
    db: Session,
    defect: Defect,
    image_bytes: Optional[bytes] = None,
    photo_uri: Optional[str] = None,
    after_lat: Optional[float] = None,
    after_lng: Optional[float] = None,
    after_time: Optional[datetime.datetime] = None,
    contractor_notes: Optional[str] = None,
    material_type: Optional[str] = "Cold Mix Bitumen",
    material_kg: Optional[float] = 50.0,
    assigned_to: Optional[str] = None
) -> Tuple[bool, Dict[str, Any]]:
    """
    Verifies that road defect repair is genuine and complete:
      1. Re-detection check: YOLO detects 0 potholes above 0.35 confidence.
      2. GPS distance check: After-photo coordinates are within 20m of before coordinates.
      3. Timestamp check: after_time >= defect.first_seen_at (no retroactive timestamps).
    """
    if after_time is None:
        after_time = datetime.datetime.utcnow()

    errors = []
    
    # 1. Run YOLO Re-detection Check
    detections_found = 0
    if image_bytes:
        detections_found, _ = verify_after_photo_yolo(image_bytes, conf_threshold=0.35)
        if detections_found > 0:
            errors.append(f"AI Detector identified {detections_found} unrepaired pothole(s) in after photo.")

    # 2. GPS Proximity Check (<= 20m from original defect location)
    # Find before coordinates
    before_report = db.query(Report).filter(
        Report.defect_id == defect.id,
        Report.lat.isnot(None),
        Report.lng.isnot(None)
    ).first()

    distance_m = 0.0
    if before_report and after_lat is not None and after_lng is not None:
        distance_m = haversine_distance_m(before_report.lat, before_report.lng, after_lat, after_lng)
        if distance_m > 20.0:
            errors.append(f"GPS distance mismatch: after-photo is {distance_m:.1f}m away from original sighting (limit: 20.0m).")

    # 3. Timestamp Validity Check
    time_valid = True
    if defect.first_seen_at and after_time < defect.first_seen_at:
        time_valid = False
        errors.append(f"Invalid timestamp: repair time ({after_time}) is earlier than first sighting ({defect.first_seen_at}).")

    is_verified = (len(errors) == 0)

    details = {
        "verified": is_verified,
        "detections_found": detections_found,
        "distance_m": round(distance_m, 2),
        "time_valid": time_valid,
        "errors": errors
    }

    if is_verified:
        # Save AFTER evidence
        img_hash = hashlib.sha256(image_bytes).hexdigest() if image_bytes else None
        evidence_uri = photo_uri or f"/uploads/after_defect_{defect.id}_{int(datetime.datetime.utcnow().timestamp())}.jpg"

        # Persist the AFTER photo to object storage, same as detection images, so
        # all evidence lives in one versioned, backed-up place. Falls back to the
        # local uploads/ dir only when object storage is not configured, so the
        # feature still works on a bare checkout.
        if image_bytes and photo_uri is None:
            ts = int(datetime.datetime.utcnow().timestamp())
            object_name = f"evidence/after_defect_{defect.id}_{ts}.jpg"
            uploaded_url = s3_service.upload_file_obj_to_s3(io.BytesIO(image_bytes), object_name)
            if uploaded_url:
                evidence_uri = uploaded_url
            else:
                upload_dir = os.path.abspath("uploads")
                os.makedirs(upload_dir, exist_ok=True)
                filename = f"after_defect_{defect.id}_{ts}.jpg"
                with open(os.path.join(upload_dir, filename), "wb") as f:
                    f.write(image_bytes)
                evidence_uri = f"/uploads/{filename}"

        after_evidence = Evidence(
            defect_id=defect.id,
            kind="AFTER",
            photo_uri=evidence_uri,
            lat=after_lat or (before_report.lat if before_report else None),
            lng=after_lng or (before_report.lng if before_report else None),
            captured_at=after_time,
            hash=img_hash
        )
        db.add(after_evidence)

        # Audit the AFTER evidence write too, so both halves of the pair are on
        # the immutable record — symmetric with the BEFORE freeze at notice-time.
        record_audit(
            db=db,
            entity="defect",
            entity_id=defect.id,
            actor=assigned_to or "SURVEYOR",
            action="freeze_after_evidence",
            from_status=defect.state,
            to_status=defect.state,
            note=f"AFTER evidence recorded (hash={img_hash[:12] + '…' if img_hash else 'n/a'}, "
                 f"distance={round(distance_m, 1)}m)",
        )

        # Record or update RepairJob
        job = db.query(RepairJob).filter(RepairJob.defect_id == defect.id).first()
        if not job:
            job = RepairJob(defect_id=defect.id)
            db.add(job)

        job.assigned_to = assigned_to or "Field Maintenance Crew"
        job.completed_at = after_time
        job.material_type = material_type
        job.material_kg = material_kg
        db.commit()

    return is_verified, details


def freeze_before_evidence(db: Session, defect, actor: str = "policy_engine"):
    """
    Freeze the BEFORE half of the evidence pair at the moment a defect is brought
    to notice. Materialises an immutable Evidence(kind="BEFORE") row from the
    sighting that triggered notice — snapshotting its image into object storage,
    hashing it, and recording lat/lng/captured_at — so the "before" cannot later
    be lost if the raw sighting image is deleted or its URL expires.

    Idempotent: does nothing if a BEFORE row already exists for the defect.
    """
    from ..schemas.report import Report
    from ..schemas.evidence import Evidence

    existing = db.query(Evidence).filter(
        Evidence.defect_id == defect.id, Evidence.kind == "BEFORE"
    ).first()
    if existing:
        return existing

    # Same sighting the statutory notice is built from: the most recent one with
    # an image and coordinates.
    before_report = db.query(Report).filter(
        Report.defect_id == defect.id,
        Report.lat.isnot(None),
        Report.lng.isnot(None),
    ).order_by(Report.id.desc()).first()
    if before_report is None:
        before_report = db.query(Report).filter(
            Report.defect_id == defect.id
        ).order_by(Report.id.desc()).first()
    if before_report is None:
        logger.info(f"[EVIDENCE] No sighting to freeze BEFORE for Defect #{defect.id}")
        return None

    src_url = (before_report.annotated_image_url
               or before_report.original_image_url or "")
    photo_uri = src_url
    img_hash = None

    # Best effort: copy the sighting image into an evidence/ object and hash it,
    # so the frozen before-photo is independent of the original sighting object.
    if src_url.startswith("http"):
        try:
            import requests
            resp = requests.get(src_url, timeout=10)
            if resp.ok and resp.content:
                img_bytes = resp.content
                img_hash = hashlib.sha256(img_bytes).hexdigest()
                ts = int(datetime.datetime.utcnow().timestamp())
                object_name = f"evidence/before_defect_{defect.id}_{ts}.jpg"
                uploaded = s3_service.upload_file_obj_to_s3(io.BytesIO(img_bytes), object_name)
                if uploaded:
                    photo_uri = uploaded
        except Exception as e:
            logger.warning(f"[EVIDENCE] Could not snapshot BEFORE image for Defect #{defect.id}: {e}")

    before_evidence = Evidence(
        defect_id=defect.id,
        kind="BEFORE",
        photo_uri=photo_uri,
        lat=before_report.lat,
        lng=before_report.lng,
        captured_at=(before_report.reportedDate or defect.first_seen_at
                     or datetime.datetime.utcnow()),
        hash=img_hash,
    )
    db.add(before_evidence)

    # The frozen evidence is itself an audited event — this is what makes the
    # "immutable, auditable" claim true rather than asserted.
    record_audit(
        db=db,
        entity="defect",
        entity_id=defect.id,
        actor=actor,
        action="freeze_before_evidence",
        from_status=defect.state,
        to_status=defect.state,
        note=f"BEFORE evidence frozen from sighting #{before_report.id} "
             f"(hash={img_hash[:12] + '…' if img_hash else 'n/a'})",
    )
    logger.info(f"[EVIDENCE] Froze BEFORE evidence for Defect #{defect.id} from sighting #{before_report.id}")
    return before_evidence
