from fastapi import HTTPException, Response
from sqlalchemy.orm import Session
from typing import List, Optional
import datetime

from ..schemas import tender as tender_model
from ..schemas import road_segment as segment_model
from ..schemas import tender_dto
from ..services.segment_service import reload_segments_cache

def calculate_active_dlp(expiry_date: Optional[datetime.date]) -> bool:
    if not expiry_date:
        return False
    return expiry_date >= datetime.date.today()

async def create_tender(tender_data: tender_dto.TenderCreate, db: Session) -> tender_dto.TenderResponse:
    data_dict = tender_data.model_dump() if hasattr(tender_data, "model_dump") else tender_data.dict()
    segment_ids = data_dict.pop("segment_ids", []) or []

    # Auto-calculate dlp_expiry_date if completion_date and dlp_years are provided
    if data_dict.get("completion_date") and data_dict.get("dlp_years") and not data_dict.get("dlp_expiry_date"):
        comp_date = data_dict["completion_date"]
        days = int(data_dict["dlp_years"] * 365.25)
        data_dict["dlp_expiry_date"] = comp_date + datetime.timedelta(days=days)

    new_tender = tender_model.Tender(**data_dict)
    db.add(new_tender)
    db.commit()
    db.refresh(new_tender)

    # Link segments
    for seg_id in segment_ids:
        seg = db.query(segment_model.RoadSegment).filter(segment_model.RoadSegment.id == seg_id).first()
        if seg:
            db.add(tender_model.TenderSegment(tender_id=new_tender.id, segment_id=seg_id))
            if calculate_active_dlp(new_tender.dlp_expiry_date):
                seg.has_active_dlp = True
    
    db.commit()
    reload_segments_cache(db)

    linked_seg_ids = [ts.segment_id for ts in new_tender.segments]
    return tender_dto.TenderResponse(
        id=new_tender.id,
        tender_ref=new_tender.tender_ref,
        contractor_name=new_tender.contractor_name,
        contractor_contact_email=new_tender.contractor_contact_email,
        description=new_tender.description,
        award_date=new_tender.award_date,
        completion_date=new_tender.completion_date,
        value_inr=float(new_tender.value_inr) if new_tender.value_inr is not None else None,
        dlp_years=new_tender.dlp_years,
        dlp_expiry_date=new_tender.dlp_expiry_date,
        source_url=new_tender.source_url,
        dlp_source=new_tender.dlp_source,
        segment_ids=linked_seg_ids,
        is_active_dlp=calculate_active_dlp(new_tender.dlp_expiry_date)
    )

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
    today = datetime.date.today()

    for t in tenders:
        is_active = (t.dlp_expiry_date is not None) and (t.dlp_expiry_date >= today)
        if active_only is True and not is_active:
            continue
        if active_only is False and is_active:
            continue

        linked_seg_ids = [ts.segment_id for ts in t.segments]
        results.append(tender_dto.TenderResponse(
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
            segment_ids=linked_seg_ids,
            is_active_dlp=is_active
        ))
    return results

async def get_tender(tender_id: int, db: Session) -> tender_dto.TenderResponse:
    t = db.query(tender_model.Tender).filter(tender_model.Tender.id == tender_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Tender not found")
    
    linked_seg_ids = [ts.segment_id for ts in t.segments]
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
        segment_ids=linked_seg_ids,
        is_active_dlp=calculate_active_dlp(t.dlp_expiry_date)
    )

async def update_tender(tender_id: int, tender_update: tender_dto.TenderUpdate, db: Session) -> tender_dto.TenderResponse:
    t = db.query(tender_model.Tender).filter(tender_model.Tender.id == tender_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Tender not found")
    
    update_data = tender_update.model_dump(exclude_unset=True) if hasattr(tender_update, "model_dump") else tender_update.dict(exclude_unset=True)
    segment_ids = update_data.pop("segment_ids", None)

    for key, val in update_data.items():
        setattr(t, key, val)

    if segment_ids is not None:
        db.query(tender_model.TenderSegment).filter(tender_model.TenderSegment.tender_id == t.id).delete()
        for seg_id in segment_ids:
            db.add(tender_model.TenderSegment(tender_id=t.id, segment_id=seg_id))

    db.commit()
    db.refresh(t)
    reload_segments_cache(db)

    linked_seg_ids = [ts.segment_id for ts in t.segments]
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
        segment_ids=linked_seg_ids,
        is_active_dlp=calculate_active_dlp(t.dlp_expiry_date)
    )

async def delete_tender(tender_id: int, db: Session):
    t = db.query(tender_model.Tender).filter(tender_model.Tender.id == tender_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Tender not found")
    
    db.delete(t)
    db.commit()
    reload_segments_cache(db)
    return Response(status_code=204)

async def map_tender_segments(tender_id: int, segment_ids: List[int], db: Session) -> tender_dto.TenderResponse:
    t = db.query(tender_model.Tender).filter(tender_model.Tender.id == tender_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Tender not found")

    db.query(tender_model.TenderSegment).filter(tender_model.TenderSegment.tender_id == t.id).delete()
    for seg_id in segment_ids:
        db.add(tender_model.TenderSegment(tender_id=t.id, segment_id=seg_id))
    
    db.commit()
    db.refresh(t)
    reload_segments_cache(db)

    linked_seg_ids = [ts.segment_id for ts in t.segments]
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
        segment_ids=linked_seg_ids,
        is_active_dlp=calculate_active_dlp(t.dlp_expiry_date)
    )

async def get_all_segments(db: Session) -> List[tender_dto.SegmentBrief]:
    segments = db.query(segment_model.RoadSegment).all()
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
