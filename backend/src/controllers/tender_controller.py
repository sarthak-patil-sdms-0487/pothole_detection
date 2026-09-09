from fastapi import HTTPException, Response
from sqlalchemy.orm import Session
from typing import List, Optional
import datetime

from ..schemas import tender as tender_model
from ..schemas import road_segment as segment_model
from ..schemas import tender_dto
from ..services.segment_service import reload_segments_cache

DAYS_PER_YEAR = 365.25


def calculate_active_dlp(expiry_date: Optional[datetime.date]) -> bool:
    if not expiry_date:
        return False
    return expiry_date >= datetime.date.today()


def derive_dlp_expiry(
    completion_date: Optional[datetime.date],
    dlp_years: Optional[float],
    explicit_expiry: Optional[datetime.date] = None,
) -> Optional[datetime.date]:
    """
    Resolves the DLP expiry date for a tender.

    An explicitly supplied expiry always wins — the DLP printed in the tender PDF
    is authoritative and may not be a clean multiple of the stated years. Only
    when it is absent do we derive completion_date + dlp_years.
    """
    if explicit_expiry:
        return explicit_expiry
    if completion_date and dlp_years:
        return completion_date + datetime.timedelta(days=int(dlp_years * DAYS_PER_YEAR))
    return None


def recompute_segment_dlp_flags(db: Session) -> None:
    """
    Recomputes road_segment.has_active_dlp for every segment from live tender data.

    This flag used to be set to True on tender creation and never cleared, so a
    segment whose DLP had expired kept scoring w_active_dlp in the promotion
    policy forever. It is derived state, so it is rebuilt wholesale rather than
    patched — 30 segments, this is cheap.
    """
    today = datetime.date.today()

    active_tender_ids = {
        t.id
        for t in db.query(tender_model.Tender).all()
        if t.dlp_expiry_date and t.dlp_expiry_date >= today
    }
    segments_under_active_dlp = {
        ts.segment_id
        for ts in db.query(tender_model.TenderSegment).all()
        if ts.tender_id in active_tender_ids
    }

    for seg in db.query(segment_model.RoadSegment).all():
        seg.has_active_dlp = seg.id in segments_under_active_dlp

    db.commit()


def _set_tender_segments(db: Session, tender_id: int, segment_ids: List[int]) -> None:
    """Replaces the segment mapping for a tender, ignoring ids that do not exist."""
    db.query(tender_model.TenderSegment).filter(
        tender_model.TenderSegment.tender_id == tender_id
    ).delete()

    for seg_id in segment_ids:
        seg = db.query(segment_model.RoadSegment).filter(
            segment_model.RoadSegment.id == seg_id
        ).first()
        if seg:
            db.add(tender_model.TenderSegment(tender_id=tender_id, segment_id=seg_id))


def _to_response(t: tender_model.Tender) -> tender_dto.TenderResponse:
    return tender_dto.TenderResponse(
        id=t.id,
        tender_ref=t.tender_ref,
        contractor_name=t.contractor_name,
        contractor_contact_email=t.contractor_contact_email,
        description=t.description,
        award_date=t.award_date,
        completion_date=t.completion_date,
        value_inr=float(t.value_inr) if t.value_inr is not None else None,
        dlp_years=t.dlp_years,
        dlp_expiry_date=t.dlp_expiry_date,
        source_url=t.source_url,
        dlp_source=t.dlp_source,
        segment_ids=[ts.segment_id for ts in t.segments],
        is_active_dlp=calculate_active_dlp(t.dlp_expiry_date),
    )


def _get_tender_or_404(tender_id: int, db: Session) -> tender_model.Tender:
    t = db.query(tender_model.Tender).filter(tender_model.Tender.id == tender_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Tender not found")
    return t


async def create_tender(tender_data: tender_dto.TenderCreate, db: Session) -> tender_dto.TenderResponse:
    data_dict = tender_data.model_dump() if hasattr(tender_data, "model_dump") else tender_data.dict()
    segment_ids = data_dict.pop("segment_ids", []) or []

    data_dict["dlp_expiry_date"] = derive_dlp_expiry(
        data_dict.get("completion_date"),
        data_dict.get("dlp_years"),
        data_dict.get("dlp_expiry_date"),
    )

    new_tender = tender_model.Tender(**data_dict)
    db.add(new_tender)
    db.commit()
    db.refresh(new_tender)

    _set_tender_segments(db, new_tender.id, segment_ids)
    db.commit()

    recompute_segment_dlp_flags(db)
    reload_segments_cache(db)
    db.refresh(new_tender)

    return _to_response(new_tender)


async def get_tenders(
    active_only: Optional[bool] = None,
    contractor: Optional[str] = None,
    db: Session = None
) -> List[tender_dto.TenderResponse]:
    query = db.query(tender_model.Tender)
    if contractor:
        query = query.filter(tender_model.Tender.contractor_name.ilike(f"%{contractor}%"))

    tenders = query.order_by(tender_model.Tender.id.desc()).all()
    results = []

    for t in tenders:
        response = _to_response(t)
        if active_only is True and not response.is_active_dlp:
            continue
        if active_only is False and response.is_active_dlp:
            continue
        results.append(response)

    return results


async def get_tender(tender_id: int, db: Session) -> tender_dto.TenderResponse:
    return _to_response(_get_tender_or_404(tender_id, db))


async def update_tender(tender_id: int, tender_update: tender_dto.TenderUpdate, db: Session) -> tender_dto.TenderResponse:
    t = _get_tender_or_404(tender_id, db)

    update_data = tender_update.model_dump(exclude_unset=True) if hasattr(tender_update, "model_dump") else tender_update.dict(exclude_unset=True)
    segment_ids = update_data.pop("segment_ids", None)

    for key, val in update_data.items():
        setattr(t, key, val)

    # Re-derive the expiry whenever completion_date or dlp_years moved and the
    # caller did not pin an explicit expiry in this same request. Previously the
    # derivation only ran on create, so editing dlp_years left a stale expiry.
    if ("completion_date" in update_data or "dlp_years" in update_data) and not update_data.get("dlp_expiry_date"):
        t.dlp_expiry_date = derive_dlp_expiry(t.completion_date, t.dlp_years, None)

    if segment_ids is not None:
        _set_tender_segments(db, t.id, segment_ids)

    db.commit()
    db.refresh(t)

    recompute_segment_dlp_flags(db)
    reload_segments_cache(db)
    db.refresh(t)

    return _to_response(t)


async def delete_tender(tender_id: int, db: Session):
    t = _get_tender_or_404(tender_id, db)

    db.delete(t)
    db.commit()

    recompute_segment_dlp_flags(db)
    reload_segments_cache(db)
    return Response(status_code=204)


async def map_tender_segments(tender_id: int, segment_ids: List[int], db: Session) -> tender_dto.TenderResponse:
    t = _get_tender_or_404(tender_id, db)

    _set_tender_segments(db, t.id, segment_ids)
    db.commit()
    db.refresh(t)

    recompute_segment_dlp_flags(db)
    reload_segments_cache(db)
    db.refresh(t)

    return _to_response(t)


async def get_all_segments(db: Session) -> List[tender_dto.SegmentBrief]:
    segments = db.query(segment_model.RoadSegment).order_by(segment_model.RoadSegment.id.asc()).all()
    return [
        tender_dto.SegmentBrief(
            id=s.id,
            name=s.name,
            length_m=s.length_m,
            owner=s.owner,
            has_active_dlp=s.has_active_dlp,
            traffic_class=s.traffic_class
        )
        for s in segments
    ]
