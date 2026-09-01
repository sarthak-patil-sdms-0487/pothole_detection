import sys
import os
import datetime
from sqlalchemy.orm import Session

# Add backend root to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from src.config.database import init_db, SessionLocal
from src.schemas import SlagLot, SlagDraw, RepairJob, Defect
from src.schemas.slag_dto import STANDARD_SLAG_RATE_INR_PER_KG

SEED_SLAG_LOTS = [
    {
        "tenant_unit_name": "JSW Steel Ltd (Dolvi Works - Rail Dispatch)",
        "estate_id": 1,
        "generated_month": datetime.date(2024, 7, 1),
        "tonnes": 50.0, # 50,000 kg
        "stockpile_location": "Central Stockpile Yard #1 (Near Weighbridge A)"
    },
    {
        "tenant_unit_name": "Kalyani Steels Ltd (Mundhwa / Chakan Cluster)",
        "estate_id": 1,
        "generated_month": datetime.date(2024, 8, 1),
        "tonnes": 40.0, # 40,000 kg
        "stockpile_location": "Foundry Zone Bulk Aggregates Depot"
    },
    {
        "tenant_unit_name": "POSCO Maharashtra Steel Ltd (Heavy Processing Division)",
        "estate_id": 1,
        "generated_month": datetime.date(2024, 8, 15),
        "tonnes": 35.0, # 35,000 kg
        "stockpile_location": "Logistics Boulevard South Depot"
    },
    {
        "tenant_unit_name": "Sunflag Iron & Steel Co Ltd (Bhandara Corridor)",
        "estate_id": 1,
        "generated_month": datetime.date(2024, 9, 1),
        "tonnes": 25.0, # 25,000 kg
        "stockpile_location": "Sector 14 Highway Access Depot"
    }
]

def seed_slag():
    print("==================================================================")
    print("SEEDING M6 INDUSTRIAL STEEL SLAG CIRCULAR ALLOCATION LEDGER")
    print("==================================================================")
    
    init_db()
    db: Session = SessionLocal()
    try:
        db.query(SlagDraw).delete()
        db.query(SlagLot).delete()
        db.commit()

        lots = []
        for item in SEED_SLAG_LOTS:
            lot = SlagLot(**item)
            db.add(lot)
            lots.append(lot)
        db.commit()

        for l in lots:
            db.refresh(l)

        # Create or ensure RepairJobs exist for draws
        jobs = db.query(RepairJob).all()
        job_ids = [j.id for j in jobs]
        if not job_ids:
            j1 = RepairJob(assigned_to="B.G. Shirke Crew", material_type="Steel Slag Cold Mix", material_kg=85.0)
            j2 = RepairJob(assigned_to="Ashoka Buildcon Crew", material_type="Steel Slag Cold Mix", material_kg=120.0)
            j3 = RepairJob(assigned_to="J. Kumar Maintenance", material_type="Steel Slag Cold Mix", material_kg=65.0)
            db.add_all([j1, j2, j3])
            db.commit()
            job_ids = [j1.id, j2.id, j3.id]

        # Seed sample drawdowns
        draw_samples = [
            {"slag_lot_id": lots[0].id, "repair_job_id": job_ids[0], "kg_drawn": 250.0},
            {"slag_lot_id": lots[0].id, "repair_job_id": job_ids[0], "kg_drawn": 180.0},
            {"slag_lot_id": lots[1].id, "repair_job_id": job_ids[1] if len(job_ids) > 1 else job_ids[0], "kg_drawn": 420.0},
            {"slag_lot_id": lots[1].id, "repair_job_id": job_ids[1] if len(job_ids) > 1 else job_ids[0], "kg_drawn": 310.0},
            {"slag_lot_id": lots[2].id, "repair_job_id": job_ids[-1], "kg_drawn": 150.0},
            {"slag_lot_id": lots[3].id, "repair_job_id": job_ids[0], "kg_drawn": 200.0},
        ]

        total_drawn_kg = 0.0
        for d in draw_samples:
            draw_val = d["kg_drawn"] * STANDARD_SLAG_RATE_INR_PER_KG
            draw_rec = SlagDraw(
                slag_lot_id=d["slag_lot_id"],
                repair_job_id=d["repair_job_id"],
                kg_drawn=d["kg_drawn"],
                notional_value_inr=draw_val
            )
            db.add(draw_rec)
            total_drawn_kg += d["kg_drawn"]

        db.commit()
        print(f"[SUCCESS] Seeded {len(lots)} industrial slag lots (150 Tonnes total) and {len(draw_samples)} drawdowns ({total_drawn_kg}kg used)!")

    finally:
        db.close()

if __name__ == "__main__":
    seed_slag()
