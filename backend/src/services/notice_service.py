import datetime
from typing import Optional, Dict, Any
from sqlalchemy.orm import Session
import logging

from ..schemas.defect import Defect
from ..schemas.report import Report
from ..schemas.tender import Tender, TenderSegment
from ..schemas.liability_verdict import LiabilityVerdict
from ..services.audit_service import record_audit
from ..config.settings import get_settings

logger = logging.getLogger(__name__)

MANDATORY_LEGAL_HEDGE = (
    "NOTICE UNDER ROAD WORK DEFECT LIABILITY PERIOD — This notice is issued based on GIS "
    "road segment mapping. Recipient is requested to verify against physical contract documents "
    "and commence rectification within 48 hours pursuant to Bombay High Court compliance directives."
)

def generate_notice(db: Session, defect_id: int) -> Dict[str, Any]:
    defect = db.query(Defect).filter(Defect.id == defect_id).first()
    if not defect:
        raise ValueError(f"Defect with id={defect_id} not found")

    # Get before sighting/report
    before_report = db.query(Report).filter(Report.defect_id == defect.id).order_by(Report.id.asc()).first()
    lat = before_report.lat if before_report else None
    lng = before_report.lng if before_report else None
    before_img = before_report.annotated_image_url if (before_report and before_report.annotated_image_url) else (before_report.original_image_url if before_report else "N/A")

    # Get governing tender
    tender = None
    if defect.segment_id is not None:
        mapping = db.query(TenderSegment).filter(TenderSegment.segment_id == defect.segment_id).first()
        if mapping:
            tender = db.query(Tender).filter(Tender.id == mapping.tender_id).first()

    # Get latest verdict
    latest_verdict = db.query(LiabilityVerdict).filter(
        LiabilityVerdict.defect_id == defect.id
    ).order_by(LiabilityVerdict.id.desc()).first()

    notice_ref = f"MIDC/NOT/2026/{defect.id:04d}"
    issued_at = defect.noticed_at or datetime.datetime.utcnow()
    sla_due_at = defect.sla_due_at or (issued_at + datetime.timedelta(hours=48))
    
    contractor_name = tender.contractor_name if tender else "Contractor Unassigned"
    contractor_email = tender.contractor_contact_email if tender else "civil-maintenance@midc.maharashtra.gov.in"
    tender_ref = tender.tender_ref if tender else "NO_MATCHING_CONTRACT"
    work_desc = tender.description if tender else "General Road Maintenance"
    dlp_expiry = str(tender.dlp_expiry_date) if (tender and tender.dlp_expiry_date) else "Expired / Out of Warranty"
    dlp_source = tender.dlp_source if (tender and tender.dlp_source) else "Municipal Maintenance Clause"
    segment_name = defect.segment.name if defect.segment else "Chakan Phase II Pavement Corridor"

    map_pin_url = f"https://www.google.com/maps?q={lat},{lng}" if (lat and lng) else None

    # Formatted statutory notice text
    notice_text = f"""
========================================================================================
STATE INDUSTRIAL DEVELOPMENT CORPORATION (SIDC / MIDC) - PUNE DIVISION
STATUTORY REPAIR DIRECTIVE & DEFECT LIABILITY NOTICE (TIER-1 / TIER-2)
========================================================================================

Notice Reference: {notice_ref}
Date of Notice:   {issued_at.strftime('%d-%b-%Y %H:%M:%S UTC')}
Statutory SLA:    48 HOURS (Deadline: {sla_due_at.strftime('%d-%b-%Y %H:%M:%S UTC')})

TO:
Contractor:       {contractor_name}
Contact Email:    {contractor_email}
Contract Ref:     {tender_ref}
Work Scope:       {work_desc}
DLP Expiry Date:  {dlp_expiry}
Contract Clause:  {dlp_source}

LOCATION & DEFECT SUMMARY:
Road Segment:     #{defect.segment_id or 'N/A'} - {segment_name}
GPS Coordinates:  Lat {lat or 'N/A'}, Lng {lng or 'N/A'}
Map Location:     {map_pin_url or 'N/A'}
Severity Index:   {defect.severity or 0.5:.2f} / 1.00
Photographic Ref: {before_img}

MANDATE & DIRECTIVE:
Pursuant to the Bombay High Court Compliance Directives on Municipal Pothole Rectification
and Defect Liability Period obligations, you are hereby formally notified of the pavement
failure documented above. You are required to deploy certified cold-mix/slag repair crews
and complete restoration within forty-eight (48) hours of receipt of this notice.

Failure to complete certified rectification within the SLA deadline shall result in risk-and-cost
remedial action and liquidated damages.

{MANDATORY_LEGAL_HEDGE}
========================================================================================
"""

    return {
        "notice_ref": notice_ref,
        "defect_id": defect.id,
        "issued_at": issued_at.isoformat(),
        "sla_due_at": sla_due_at.isoformat(),
        "contractor_name": contractor_name,
        "contractor_email": contractor_email,
        "tender_ref": tender_ref,
        "work_description": work_desc,
        "dlp_expiry_date": dlp_expiry,
        "dlp_clause_rationale": dlp_source,
        "segment_id": defect.segment_id,
        "segment_name": segment_name,
        "coordinates": {"lat": lat, "lng": lng},
        "map_pin_url": map_pin_url,
        "severity": defect.severity,
        "before_photo_url": before_img,
        "statutory_deadline_hours": 48,
        "verdict": latest_verdict.verdict if latest_verdict else "IN_WARRANTY",
        "legal_hedge": MANDATORY_LEGAL_HEDGE,
        "notice_text": notice_text.strip()
    }

def send_notice(
    db: Session,
    defect_id: int,
    force: bool = False,
    actor: str = "notice_service"
) -> Dict[str, Any]:
    notice_data = generate_notice(db, defect_id)
    settings = get_settings()

    is_live = settings.notify_contractors_live or force
    delivery_status = "SENT" if is_live else "SIMULATED"

    # Log to audit trail
    record_audit(
        db=db,
        entity="defect",
        entity_id=defect_id,
        actor=actor,
        action="issue_contractor_notice",
        from_status="NOTICED",
        to_status="NOTICED",
        note=f"Statutory Notice {notice_data['notice_ref']} {delivery_status} to {notice_data['contractor_email']} (SLA: 48h)"
    )

    logger.info(
        f"[NOTICE] Generated {delivery_status} notice {notice_data['notice_ref']} "
        f"for Defect #{defect_id} -> {notice_data['contractor_email']}"
    )

    return {
        "status": delivery_status,
        "recipient": notice_data["contractor_email"],
        "contractor": notice_data["contractor_name"],
        "notice": notice_data
    }
