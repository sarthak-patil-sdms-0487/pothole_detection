import datetime
from typing import Optional, Dict, Any
from sqlalchemy.orm import Session
import logging

from ..schemas.defect import Defect
from ..schemas.report import Report
from ..schemas.tender import Tender
from ..schemas.liability_verdict import LiabilityVerdict
from ..services.audit_service import record_audit
from ..services.liability_service import resolve_governing_tender
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

    # Use the most recent sighting, which is what the engineer is looking at in
    # the review panel when they dispatch (the API returns sightings newest
    # first). Taking the oldest here made the notice show a different photo and
    # older coordinates than the defect the engineer had just approved.
    before_report = db.query(Report).filter(Report.defect_id == defect.id).order_by(Report.id.desc()).first()
    lat = before_report.lat if before_report else None
    lng = before_report.lng if before_report else None
    before_img = before_report.annotated_image_url if (before_report and before_report.annotated_image_url) else (before_report.original_image_url if before_report else "N/A")

    # Get latest verdict
    latest_verdict = db.query(LiabilityVerdict).filter(
        LiabilityVerdict.defect_id == defect.id
    ).order_by(LiabilityVerdict.id.desc()).first()

    # Get the governing tender. Prefer the tender the standing verdict was issued
    # against, so the notice always names the contractor the verdict attributed it
    # to. Fall back to resolving it fresh when no verdict exists yet. This used to
    # take an arbitrary .first() mapping, which on a segment with overlapping
    # contracts could address the notice to the wrong contractor.
    tender = None
    if latest_verdict and latest_verdict.tender_id:
        tender = db.query(Tender).filter(Tender.id == latest_verdict.tender_id).first()
    if tender is None:
        tender, _, _, _ = resolve_governing_tender(db, defect.segment_id)

    notice_ref = f"SIDC/NOT/2026/{defect.id:04d}"
    issued_at = defect.noticed_at or datetime.datetime.utcnow()
    sla_due_at = defect.sla_due_at or (issued_at + datetime.timedelta(hours=48))
    
    contractor_name = tender.contractor_name if tender else "Contractor Unassigned"
    contractor_email = tender.contractor_contact_email if tender else "civil-maintenance@sidc.maharashtra.gov.in"
    tender_ref = tender.tender_ref if tender else "NO_MATCHING_CONTRACT"
    work_desc = tender.description if tender else "General Road Maintenance"
    dlp_expiry = str(tender.dlp_expiry_date) if (tender and tender.dlp_expiry_date) else "Expired / Out of Warranty"
    dlp_source = tender.dlp_source if (tender and tender.dlp_source) else "Municipal Maintenance Clause"
    segment_name = defect.segment.name if defect.segment else "Chakan Phase II Pavement Corridor"

    map_pin_url = f"https://www.google.com/maps?q={lat},{lng}" if (lat and lng) else None

    # Where the complaint is actually addressed. During testing a single override
    # inbox stands in for every contractor, so notices can be checked end to end
    # without mailing a real contracting firm.
    settings = get_settings()
    recipient_email = settings.notice_recipient_override or contractor_email

    severity_val = defect.severity if defect.severity is not None else 0.5
    severity_label = (
        "CRITICAL" if severity_val >= 0.75
        else "MAJOR" if severity_val >= 0.45
        else "MODERATE"
    )

    subject = (
        f"Pothole Repair Complaint {notice_ref} - {segment_name} - "
        f"action required within 48 hours"
    )

    # Written as a complaint addressed to the contractor: what is wrong, where it
    # is, what proves it, what they must do, and by when. The statutory backing
    # stays, but it reads as a letter a contractor can act on directly.
    notice_text = f"""To:      {contractor_name}
Email:   {recipient_email}
From:    State Industrial Development Corporation (SIDC/MIDC), Pune Division
Subject: {subject}
Ref:     {notice_ref}
Date:    {issued_at.strftime('%d-%b-%Y %H:%M UTC')}

Dear Sir/Madam,

COMPLAINT: Pavement failure on a road under your defect liability period

We are writing to formally complain about a pothole on a stretch of road that your
firm built and remains contractually responsible for. It was identified by our road
monitoring survey and has been verified against the contract records below.

WHAT IS WRONG
A pothole has formed on the carriageway. Our assessment rates it {severity_label}
(severity index {severity_val:.2f} of 1.00). Left unrepaired it will widen under
traffic and monsoon water, and it is a hazard to road users now.

WHERE IT IS
  Road segment : #{defect.segment_id or 'N/A'} - {segment_name}
  GPS          : {lat if lat is not None else 'N/A'}, {lng if lng is not None else 'N/A'}
  Map          : {map_pin_url or 'Not available'}

EVIDENCE
  Photograph   : {before_img}
  Complaint ID : {notice_ref} (quote this in all correspondence)

WHY THIS IS YOUR RESPONSIBILITY
  Contract     : {tender_ref}
  Work scope   : {work_desc}
  DLP expires  : {dlp_expiry}
  Clause       : {dlp_source}
The defect falls inside the Defect Liability Period of the contract above, so the
cost of rectification is yours and not the Corporation's.

WHAT YOU MUST DO
  1. Deploy a certified cold-mix / slag repair crew to the location above.
  2. Complete full restoration of the pavement.
  3. Reply to this email with a dated photograph of the completed repair.

DEADLINE
  {sla_due_at.strftime('%d-%b-%Y %H:%M UTC')} - 48 hours from the date of this complaint.

IF YOU DO NOT ACT
Should the repair not be certified complete by the deadline, the Corporation will
carry out the work through another agency at your risk and cost, and will recover
liquidated damages under the terms of your contract.

Please treat this as urgent and confirm receipt.

Yours faithfully,
Road Defect Monitoring Cell
State Industrial Development Corporation (SIDC/MIDC), Pune Division

--
{MANDATORY_LEGAL_HEDGE}
"""

    return {
        "notice_ref": notice_ref,
        "defect_id": defect.id,
        "issued_at": issued_at.isoformat(),
        "sla_due_at": sla_due_at.isoformat(),
        "contractor_name": contractor_name,
        "contractor_email": contractor_email,
        # Where the complaint is actually delivered. Equal to contractor_email
        # unless NOTICE_RECIPIENT_OVERRIDE redirects it for testing.
        "recipient_email": recipient_email,
        "subject": subject,
        "severity_label": severity_label,
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

def _deliver_email(to_addr: str, subject: str, body: str) -> tuple[bool, str]:
    """
    Send the complaint by SMTP. Returns (delivered, detail).

    With no SMTP_HOST configured nothing is sent and the caller reports the
    notice as SIMULATED — the status must never claim delivery that did not
    happen, since the audit trail is the record of what a contractor was told.
    """
    settings = get_settings()
    # Both are required: a host with no credentials cannot authenticate to Gmail,
    # and reporting that as a delivery failure hides the real cause.
    if not settings.smtp_host or not settings.smtp_password:
        return False, "SMTP not configured"

    import smtplib
    from email.message import EmailMessage

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = settings.smtp_from or settings.smtp_user
    msg["To"] = to_addr
    msg.set_content(body)

    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=30) as smtp:
            if settings.smtp_use_tls:
                smtp.starttls()
            if settings.smtp_user:
                smtp.login(settings.smtp_user, settings.smtp_password)
            smtp.send_message(msg)
        return True, f"delivered to {to_addr}"
    except Exception as e:
        logger.error(f"[NOTICE] SMTP delivery failed: {e}")
        return False, f"SMTP error: {e}"


def send_notice(
    db: Session,
    defect_id: int,
    force: bool = False,
    actor: str = "notice_service"
) -> Dict[str, Any]:
    notice_data = generate_notice(db, defect_id)
    settings = get_settings()

    is_live = settings.notify_contractors_live or force
    recipient = notice_data["recipient_email"]

    # Only attempt real delivery when the operator has switched it on. The status
    # reflects what actually happened rather than what was intended.
    if is_live:
        delivered, detail = _deliver_email(
            recipient, notice_data["subject"], notice_data["notice_text"]
        )
        if delivered:
            delivery_status = "SENT"
        elif detail == "SMTP not configured":
            # Nothing was attempted, so this is not a delivery failure — say so
            # plainly rather than reporting an error the operator cannot debug.
            delivery_status = "SIMULATED"
            detail = "SMTP not configured — set SMTP_HOST/SMTP_USER/SMTP_PASSWORD in backend/.env"
        else:
            delivery_status = "FAILED"
    else:
        delivered, detail = False, "live dispatch disabled (NOTIFY_CONTRACTORS_LIVE=False)"
        delivery_status = "SIMULATED"

    # Log to audit trail
    record_audit(
        db=db,
        entity="defect",
        entity_id=defect_id,
        actor=actor,
        action="issue_contractor_notice",
        from_status="NOTICED",
        to_status="NOTICED",
        note=f"Contractor complaint {notice_data['notice_ref']} {delivery_status} to {recipient} ({detail}) (SLA: 48h)"
    )

    logger.info(
        f"[NOTICE] {delivery_status} complaint {notice_data['notice_ref']} "
        f"for Defect #{defect_id} -> {recipient} ({detail})"
    )

    return {
        "status": delivery_status,
        "detail": detail,
        "recipient": recipient,
        "contractor": notice_data["contractor_name"],
        "notice": notice_data
    }
