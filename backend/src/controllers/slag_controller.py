from fastapi import HTTPException, Response
from sqlalchemy.orm import Session
from typing import List, Optional
import datetime

from ..schemas.slag import SlagLot, SlagDraw
from ..schemas.repair_job import RepairJob
from ..schemas import slag_dto
from ..services.audit_service import record_audit

STANDARD_RATE = slag_dto.STANDARD_SLAG_RATE_INR_PER_KG

def format_lot_response(lot: SlagLot, db: Session) -> slag_dto.SlagLotResponse:
    kg_total = (lot.tonnes or 0.0) * 1000.0
    drawn_records = db.query(SlagDraw).filter(SlagDraw.slag_lot_id == lot.id).all()
    kg_drawn = sum(d.kg_drawn for d in drawn_records)
    kg_remaining = max(0.0, kg_total - kg_drawn)
    notional_val = kg_total * STANDARD_RATE

    return slag_dto.SlagLotResponse(
        id=lot.id,
        tenant_unit_name=lot.tenant_unit_name,
        estate_id=lot.estate_id,
        generated_month=lot.generated_month,
        tonnes=lot.tonnes,
        kg_total=kg_total,
        kg_drawn=kg_drawn,
        kg_remaining=kg_remaining,
        stockpile_location=lot.stockpile_location,
        notional_value_inr=round(notional_val, 2)
    )

async def get_slag_summary(db: Session) -> slag_dto.SlagSummaryResponse:
    lots = db.query(SlagLot).all()
    draws = db.query(SlagDraw).all()

    total_tonnes = sum(l.tonnes for l in lots)
    total_kg_allocated = total_tonnes * 1000.0
    total_kg_drawn = sum(d.kg_drawn for d in draws)
    total_kg_remaining = max(0.0, total_kg_allocated - total_kg_drawn)

    total_reclaimed_value = total_kg_drawn * STANDARD_RATE
    # 0.28 tonnes CO2 avoided per tonne of steel slag used in place of virgin asphalt aggregate
    co2_avoided = (total_kg_drawn / 1000.0) * 0.28

    return slag_dto.SlagSummaryResponse(
        total_lots=len(lots),
        total_tonnes_allocated=round(total_tonnes, 2),
        total_kg_allocated=round(total_kg_allocated, 1),
        total_kg_drawn=round(total_kg_drawn, 1),
        total_kg_remaining=round(total_kg_remaining, 1),
        total_reclaimed_value_inr=round(total_reclaimed_value, 2),
        co2_avoided_tonnes=round(co2_avoided, 3),
        rate_per_kg_inr=STANDARD_RATE
    )

async def get_slag_lots(db: Session) -> List[slag_dto.SlagLotResponse]:
    lots = db.query(SlagLot).order_by(SlagLot.id.desc()).all()
    return [format_lot_response(l, db) for l in lots]

async def create_slag_lot(
    lot_create: slag_dto.SlagLotCreate,
    actor: str,
    db: Session
) -> slag_dto.SlagLotResponse:
    data = lot_create.model_dump() if hasattr(lot_create, "model_dump") else lot_create.dict()
    if not data.get("generated_month"):
        data["generated_month"] = datetime.date.today().replace(day=1)

    new_lot = SlagLot(**data)
    db.add(new_lot)
    db.commit()
    db.refresh(new_lot)

    record_audit(
        db=db,
        entity="slag_lot",
        entity_id=new_lot.id,
        actor=actor,
        action="create_slag_lot",
        from_status=None,
        to_status="AVAILABLE",
        note=f"Allocated {new_lot.tonnes} tonnes from {new_lot.tenant_unit_name}"
    )

    return format_lot_response(new_lot, db)

async def get_slag_draws(db: Session) -> List[slag_dto.SlagDrawResponse]:
    draws = db.query(SlagDraw).order_by(SlagDraw.id.desc()).all()
    results = []
    for d in draws:
        lot = db.query(SlagLot).filter(SlagLot.id == d.slag_lot_id).first()
        results.append(slag_dto.SlagDrawResponse(
            id=d.id,
            slag_lot_id=d.slag_lot_id,
            tenant_unit_name=lot.tenant_unit_name if lot else "Unknown Lot",
            repair_job_id=d.repair_job_id,
            kg_drawn=d.kg_drawn,
            notional_value_inr=float(d.notional_value_inr or (d.kg_drawn * STANDARD_RATE))
        ))
    return results

async def record_slag_draw(
    draw_create: slag_dto.SlagDrawCreate,
    actor: str,
    db: Session
) -> slag_dto.SlagDrawResponse:
    lot = db.query(SlagLot).filter(SlagLot.id == draw_create.slag_lot_id).first()
    if not lot:
        raise HTTPException(status_code=404, detail="Slag lot not found")

    # Check job
    job = db.query(RepairJob).filter(RepairJob.id == draw_create.repair_job_id).first()
    if not job:
        # Create minimal job if missing
        job = RepairJob(id=draw_create.repair_job_id)
        db.add(job)
        db.flush()

    # Check available kg
    existing_draws = db.query(SlagDraw).filter(SlagDraw.slag_lot_id == lot.id).all()
    already_drawn = sum(d.kg_drawn for d in existing_draws)
    available_kg = (lot.tonnes * 1000.0) - already_drawn

    if draw_create.kg_drawn > available_kg:
        raise HTTPException(
            status_code=400,
            detail=f"Requested {draw_create.kg_drawn}kg exceeds available balance ({available_kg}kg) for lot #{lot.id}"
        )

    notional_val = draw_create.notional_value_inr or (draw_create.kg_drawn * STANDARD_RATE)

    new_draw = SlagDraw(
        slag_lot_id=lot.id,
        repair_job_id=job.id,
        kg_drawn=draw_create.kg_drawn,
        notional_value_inr=notional_val
    )
    db.add(new_draw)

    # Also update repair job material kg
    job.material_type = "Steel Slag Cold Mix"
    job.material_kg = (job.material_kg or 0.0) + draw_create.kg_drawn

    db.commit()
    db.refresh(new_draw)

    record_audit(
        db=db,
        entity="slag_draw",
        entity_id=new_draw.id,
        actor=actor,
        action="draw_slag_material",
        from_status=None,
        to_status="DRAWN",
        note=f"Drawn {draw_create.kg_drawn}kg for RepairJob #{job.id} (Value: INR {notional_val:.2f})"
    )

    return slag_dto.SlagDrawResponse(
        id=new_draw.id,
        slag_lot_id=new_draw.slag_lot_id,
        tenant_unit_name=lot.tenant_unit_name,
        repair_job_id=new_draw.repair_job_id,
        kg_drawn=new_draw.kg_drawn,
        notional_value_inr=float(new_draw.notional_value_inr)
    )
