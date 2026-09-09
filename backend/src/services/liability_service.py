import datetime
from typing import Optional, Tuple
from sqlalchemy.orm import Session
import logging

from ..schemas.defect import Defect
from ..schemas.tender import Tender, TenderSegment
from ..schemas.liability_verdict import LiabilityVerdict

logger = logging.getLogger(__name__)

HEDGE_TEMPLATE = (
    "Probable contractor/tender match based on road-segment mapping — "
    "verdict {verdict}, DLP expiry {dlp_expiry}. "
    "To be verified against tender and contract documents before any liability action."
)


def resolve_governing_tender(
    db: Session,
    segment_id: Optional[int],
) -> Tuple[Optional[Tender], str, float, str]:
    """
    Resolves which tender governs a road segment, and what that implies for liability.

    This is the single source of truth for contractor attribution. Both the
    liability verdict and the statutory notice call it, so a notice can never
    name a different contractor than the verdict it was issued under.

    Returns (tender, verdict, confidence, dlp_expiry_description):
      - IN_WARRANTY:          governing tender found, today <= dlp_expiry_date
      - OUT_OF_WARRANTY:      governing tender found, today > dlp_expiry_date
      - DISPUTED:             more than one tender with a live DLP on the segment
      - NO_MATCHING_CONTRACT: no tender mapped to the segment
    """
    if segment_id is None:
        return None, "NO_MATCHING_CONTRACT", 0.0, "N/A"

    today = datetime.date.today()
    mappings = db.query(TenderSegment).filter(TenderSegment.segment_id == segment_id).all()
    tenders = [
        db.query(Tender).filter(Tender.id == tm.tender_id).first()
        for tm in mappings
    ]
    tenders = [t for t in tenders if t is not None]

    if not tenders:
        return None, "NO_MATCHING_CONTRACT", 0.0, "N/A"

    active = [t for t in tenders if t.dlp_expiry_date and today <= t.dlp_expiry_date]

    if len(tenders) == 1:
        t = tenders[0]
        expiry = str(t.dlp_expiry_date) if t.dlp_expiry_date else "Unspecified"
        if active:
            return t, "IN_WARRANTY", 0.95, expiry
        return t, "OUT_OF_WARRANTY", 0.90, expiry

    if len(active) > 1:
        # Overlapping live contracts on one segment. We still surface a governing
        # tender so a notice can be addressed, but the verdict is flagged for a
        # human to resolve against the contract documents.
        refs = ", ".join(t.tender_ref for t in active if t.tender_ref)
        return active[0], "DISPUTED", 0.50, f"Multiple active contracts ({refs})"

    if len(active) == 1:
        t = active[0]
        return t, "IN_WARRANTY", 0.90, str(t.dlp_expiry_date)

    return tenders[0], "OUT_OF_WARRANTY", 0.85, "All mapped tenders expired"


def evaluate_liability(db: Session, defect_id: int) -> LiabilityVerdict:
    """
    Evaluates contractor warranty and liability for a defect based on its road
    segment mapping, and appends a row to liability_verdict. Verdict rows are
    append-only — an earlier verdict is never rewritten, so the attribution
    history stays auditable.
    """
    defect = db.query(Defect).filter(Defect.id == defect_id).first()
    if not defect:
        raise ValueError(f"Defect with id={defect_id} not found")

    tender, verdict_str, confidence, dlp_expiry_str = resolve_governing_tender(db, defect.segment_id)

    contractor_info = ""
    if tender:
        contractor_info = f" ({tender.contractor_name}, {tender.tender_ref})"

    rationale_text = HEDGE_TEMPLATE.format(
        verdict=verdict_str,
        dlp_expiry=f"{dlp_expiry_str}{contractor_info}"
    )

    verdict_record = LiabilityVerdict(
        defect_id=defect.id,
        tender_id=tender.id if tender else None,
        verdict=verdict_str,
        confidence=confidence,
        rationale=rationale_text,
        generated_at=datetime.datetime.utcnow()
    )
    db.add(verdict_record)
    db.commit()
    db.refresh(verdict_record)

    logger.info(
        f"[LIABILITY] Defect #{defect_id} (segment #{defect.segment_id}) -> "
        f"verdict='{verdict_str}' confidence={confidence} tender_id={verdict_record.tender_id}"
    )
    return verdict_record
