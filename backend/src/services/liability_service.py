import datetime
from typing import Optional
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

def evaluate_liability(db: Session, defect_id: int) -> LiabilityVerdict:
    """
    Evaluates contractor warranty and liability for a defect based on its road segment mapping.
    
    Computes one of:
      - IN_WARRANTY: Governing tender found and today <= dlp_expiry_date
      - OUT_OF_WARRANTY: Governing tender found and today > dlp_expiry_date
      - DISPUTED: Multiple conflicting tenders mapped to segment
      - NO_MATCHING_CONTRACT: No tender record mapped to segment
      
    Inserts an append-only row into liability_verdict table.
    """
    defect = db.query(Defect).filter(Defect.id == defect_id).first()
    if not defect:
        raise ValueError(f"Defect with id={defect_id} not found")

    today = datetime.date.today()
    segment_id = defect.segment_id

    verdict_str = "NO_MATCHING_CONTRACT"
    confidence = 0.0
    matched_tender_id: Optional[int] = None
    dlp_expiry_str = "N/A"
    contractor_info = ""

    if segment_id is not None:
        tender_mappings = db.query(TenderSegment).filter(TenderSegment.segment_id == segment_id).all()
        
        if len(tender_mappings) == 1:
            tender = db.query(Tender).filter(Tender.id == tender_mappings[0].tender_id).first()
            if tender:
                matched_tender_id = tender.id
                dlp_expiry = tender.dlp_expiry_date
                dlp_expiry_str = str(dlp_expiry) if dlp_expiry else "Unspecified"
                contractor_info = f" ({tender.contractor_name}, {tender.tender_ref})"

                if dlp_expiry and today <= dlp_expiry:
                    verdict_str = "IN_WARRANTY"
                    confidence = 0.95
                else:
                    verdict_str = "OUT_OF_WARRANTY"
                    confidence = 0.90

        elif len(tender_mappings) > 1:
            # Check if multiple conflicting tenders exist
            tenders = [
                db.query(Tender).filter(Tender.id == tm.tender_id).first()
                for tm in tender_mappings
            ]
            tenders = [t for t in tenders if t is not None]

            active_tenders = [t for t in tenders if t.dlp_expiry_date and today <= t.dlp_expiry_date]
            
            if len(active_tenders) > 1:
                verdict_str = "DISPUTED"
                confidence = 0.50
                matched_tender_id = active_tenders[0].id
                dlp_expiry_str = f"Multiple active contracts ({', '.join(t.tender_ref for t in active_tenders if t.tender_ref)})"
            elif len(active_tenders) == 1:
                t = active_tenders[0]
                matched_tender_id = t.id
                dlp_expiry_str = str(t.dlp_expiry_date)
                contractor_info = f" ({t.contractor_name}, {t.tender_ref})"
                verdict_str = "IN_WARRANTY"
                confidence = 0.90
            else:
                # All expired
                verdict_str = "OUT_OF_WARRANTY"
                confidence = 0.85
                matched_tender_id = tenders[0].id if tenders else None
                dlp_expiry_str = "All mapped tenders expired"

    rationale_text = HEDGE_TEMPLATE.format(
        verdict=verdict_str,
        dlp_expiry=f"{dlp_expiry_str}{contractor_info}"
    )

    verdict_record = LiabilityVerdict(
        defect_id=defect.id,
        tender_id=matched_tender_id,
        verdict=verdict_str,
        confidence=confidence,
        rationale=rationale_text,
        generated_at=datetime.datetime.utcnow()
    )
    db.add(verdict_record)
    db.commit()
    db.refresh(verdict_record)

    logger.info(
        f"[LIABILITY] Defect #{defect_id} (segment #{segment_id}) -> "
        f"verdict='{verdict_str}' confidence={confidence} tender_id={matched_tender_id}"
    )
    return verdict_record
