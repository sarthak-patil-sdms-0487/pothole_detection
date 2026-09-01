import sys
import os
import datetime
from sqlalchemy.orm import Session

# Add backend root to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from src.config.database import engine, init_db, SessionLocal
from src.schemas import (
    Defect,
    Report,
    Evidence,
    RepairJob,
    LiabilityVerdict,
    AuditLog,
    RoadSegment,
    Tender,
    TenderSegment,
    SlagDraw
)
from src.scripts.load_segments import load_segments
from src.scripts.seed_tenders import seed_tenders
from src.services.liability_service import evaluate_liability
from src.services.notice_service import send_notice

SAMPLE_BEFORE_IMAGE = "https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?auto=format&fit=crop&w=800&q=80"
SAMPLE_ANNOTATED_IMAGE = "https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?auto=format&fit=crop&w=800&q=80"
SAMPLE_AFTER_IMAGE = "https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&w=800&q=80"

def seed_demo_scenarios():
    print("==================================================================")
    print("SEEDING COMPLETE HIGH COURT 4-STAGE LIFECYCLE DEMO SCENARIOS")
    print("==================================================================")
    
    init_db()
    load_segments()
    seed_tenders()

    db: Session = SessionLocal()
    try:
        # Clear existing defect & report tables in foreign-key safe order
        db.query(AuditLog).delete()
        db.query(Evidence).delete()
        db.query(SlagDraw).delete()
        db.query(RepairJob).delete()
        db.query(LiabilityVerdict).delete()
        db.query(Report).delete()
        db.query(Defect).delete()
        db.commit()

        now = datetime.datetime.utcnow()

        # ---------------------------------------------------------
        # Scenario A: SIGHTING (Single opportunistic capture, no clock)
        # ---------------------------------------------------------
        print("[SCENARIO A] Creating SIGHTING defect (Segment #9 - Internal Loop Road North)...")
        defect_a = Defect(
            segment_id=9,
            state="SIGHTING",
            first_seen_at=now - datetime.timedelta(hours=2),
            severity=0.35,
            promotion_reason="initial_opportunistic_sighting",
            breach_flag=False
        )
        db.add(defect_a)
        db.flush()

        rep_a = Report(
            defect_id=defect_a.id,
            segment_id=9,
            lat=18.7650,
            lng=73.7880,
            original_image_url=SAMPLE_BEFORE_IMAGE,
            annotated_image_url=SAMPLE_ANNOTATED_IMAGE,
            detection_method="YOLO (best.pt)",
            status="SIGHTING",
            severity="Low",
            capture_source="OPPORTUNISTIC",
            reportedBy="Autonomous Dashcam Pass #104",
            reportedDate=now - datetime.timedelta(hours=2)
        )
        db.add(rep_a)

        # ---------------------------------------------------------
        # Scenario B: CONFIRMED (2 repeat sightings clustered within 15m, no clock)
        # ---------------------------------------------------------
        print("[SCENARIO B] Creating CONFIRMED defect (Segment #6 - Steel Rolling Mill & Auto Cluster Link)...")
        defect_b = Defect(
            segment_id=6,
            state="CONFIRMED",
            first_seen_at=now - datetime.timedelta(hours=6),
            confirmed_at=now - datetime.timedelta(hours=4),
            severity=0.60,
            promotion_reason="repeat_sighting (2 sightings)",
            breach_flag=False
        )
        db.add(defect_b)
        db.flush()

        rep_b1 = Report(
            defect_id=defect_b.id,
            segment_id=6,
            lat=18.7601,
            lng=73.7821,
            original_image_url=SAMPLE_BEFORE_IMAGE,
            annotated_image_url=SAMPLE_ANNOTATED_IMAGE,
            detection_method="YOLO (best.pt)",
            status="CONFIRMED",
            severity="Medium",
            capture_source="OPPORTUNISTIC",
            reportedBy="Opportunistic Vehicle #202",
            reportedDate=now - datetime.timedelta(hours=6)
        )
        rep_b2 = Report(
            defect_id=defect_b.id,
            segment_id=6,
            lat=18.76014,
            lng=73.78215,
            original_image_url=SAMPLE_BEFORE_IMAGE,
            annotated_image_url=SAMPLE_ANNOTATED_IMAGE,
            detection_method="YOLO (best.pt)",
            status="CONFIRMED",
            severity="Medium",
            capture_source="OPPORTUNISTIC",
            reportedBy="Opportunistic Vehicle #209",
            reportedDate=now - datetime.timedelta(hours=4)
        )
        db.add_all([rep_b1, rep_b2])

        # ---------------------------------------------------------
        # Scenario C: NOTICED + IN_WARRANTY (12h into 48h clock, 36h remaining)
        # ---------------------------------------------------------
        print("[SCENARIO C] Creating NOTICED + IN_WARRANTY defect (Segment #1 - B.G. Shirke)...")
        defect_c = Defect(
            segment_id=1,
            state="NOTICED",
            first_seen_at=now - datetime.timedelta(hours=14),
            confirmed_at=now - datetime.timedelta(hours=13),
            noticed_at=now - datetime.timedelta(hours=12),
            sla_due_at=now - datetime.timedelta(hours=12) + datetime.timedelta(hours=48), # 36h left
            severity=0.85,
            promotion_reason="policy_threshold (score=4.0 >= 2.5)",
            breach_flag=False
        )
        db.add(defect_c)
        db.flush()

        rep_c = Report(
            defect_id=defect_c.id,
            segment_id=1,
            lat=18.7512,
            lng=73.7812,
            original_image_url=SAMPLE_BEFORE_IMAGE,
            annotated_image_url=SAMPLE_ANNOTATED_IMAGE,
            detection_method="YOLO (best.pt)",
            status="NOTICED",
            severity="High",
            capture_source="WORKER",
            reportedBy="Field Surveyor S. Kadam",
            reportedDate=now - datetime.timedelta(hours=14)
        )
        db.add(rep_c)
        db.flush()
        evaluate_liability(db, defect_c.id)
        send_notice(db, defect_c.id, force=False, actor="policy_engine")

        # ---------------------------------------------------------
        # Scenario D: NOTICED + OUT_OF_WARRANTY (Supreme Infra Expired Tender)
        # ---------------------------------------------------------
        print("[SCENARIO D] Creating NOTICED + OUT_OF_WARRANTY defect (Segment #3 - Supreme Infra Expired)...")
        defect_d = Defect(
            segment_id=3,
            state="NOTICED",
            first_seen_at=now - datetime.timedelta(hours=10),
            confirmed_at=now - datetime.timedelta(hours=9),
            noticed_at=now - datetime.timedelta(hours=8),
            sla_due_at=now - datetime.timedelta(hours=8) + datetime.timedelta(hours=48), # 40h left
            severity=0.75,
            promotion_reason="engineer_accept",
            breach_flag=False
        )
        db.add(defect_d)
        db.flush()

        rep_d = Report(
            defect_id=defect_d.id,
            segment_id=3,
            lat=18.7640,
            lng=73.7920,
            original_image_url=SAMPLE_BEFORE_IMAGE,
            annotated_image_url=SAMPLE_ANNOTATED_IMAGE,
            detection_method="YOLO (best.pt)",
            status="NOTICED",
            severity="High",
            capture_source="WORKER",
            reportedBy="Assistant Engineer M. Patil",
            reportedDate=now - datetime.timedelta(hours=10)
        )
        db.add(rep_d)
        db.flush()
        evaluate_liability(db, defect_d.id)

        # ---------------------------------------------------------
        # Scenario E: NOTICED + BREACHED (noticed_at was 56h ago, sla_due_at was 8h ago)
        # ---------------------------------------------------------
        print("[SCENARIO E] Creating NOTICED + SLA BREACHED defect (Segment #4 - Ashoka Buildcon)...")
        defect_e = Defect(
            segment_id=4,
            state="NOTICED",
            first_seen_at=now - datetime.timedelta(hours=60),
            confirmed_at=now - datetime.timedelta(hours=58),
            noticed_at=now - datetime.timedelta(hours=56),
            sla_due_at=now - datetime.timedelta(hours=56) + datetime.timedelta(hours=48), # Expired 8h ago!
            severity=0.95,
            promotion_reason="policy_threshold (score=3.85 >= 2.5)",
            breach_flag=True
        )
        db.add(defect_e)
        db.flush()

        rep_e = Report(
            defect_id=defect_e.id,
            segment_id=4,
            lat=18.7550,
            lng=73.7840,
            original_image_url=SAMPLE_BEFORE_IMAGE,
            annotated_image_url=SAMPLE_ANNOTATED_IMAGE,
            detection_method="YOLO (best.pt)",
            status="NOTICED",
            severity="High",
            capture_source="WORKER",
            reportedBy="Road Safety Auditor",
            reportedDate=now - datetime.timedelta(hours=60)
        )
        db.add(rep_e)
        db.flush()
        evaluate_liability(db, defect_e.id)
        send_notice(db, defect_e.id, force=False, actor="policy_engine")

        # ---------------------------------------------------------
        # Scenario F: CLOSED (Certified Repair with Before/After Evidence)
        # ---------------------------------------------------------
        print("[SCENARIO F] Creating CLOSED certified defect (Segment #8 - J. Kumar Infra)...")
        defect_f = Defect(
            segment_id=8,
            state="CLOSED",
            first_seen_at=now - datetime.timedelta(hours=30),
            confirmed_at=now - datetime.timedelta(hours=28),
            noticed_at=now - datetime.timedelta(hours=26),
            sla_due_at=now - datetime.timedelta(hours=26) + datetime.timedelta(hours=48),
            closed_at=now - datetime.timedelta(hours=4), # Closed in 22h (Met SLA)
            severity=0.70,
            promotion_reason="policy_threshold (score=3.1 >= 2.5)",
            breach_flag=False
        )
        db.add(defect_f)
        db.flush()

        rep_f = Report(
            defect_id=defect_f.id,
            segment_id=8,
            lat=18.7610,
            lng=73.7840,
            original_image_url=SAMPLE_BEFORE_IMAGE,
            annotated_image_url=SAMPLE_ANNOTATED_IMAGE,
            detection_method="YOLO (best.pt)",
            status="CLOSED",
            severity="High",
            capture_source="WORKER",
            reportedBy="Logistics Inspector R. Shinde",
            reportedDate=now - datetime.timedelta(hours=30)
        )
        db.add(rep_f)

        # Before & After Evidences
        ev_before = Evidence(
            defect_id=defect_f.id,
            kind="BEFORE",
            photo_uri=SAMPLE_BEFORE_IMAGE,
            lat=18.7610,
            lng=73.7840,
            captured_at=now - datetime.timedelta(hours=30)
        )
        ev_after = Evidence(
            defect_id=defect_f.id,
            kind="AFTER",
            photo_uri=SAMPLE_AFTER_IMAGE,
            lat=18.76102,
            lng=73.78402,
            captured_at=now - datetime.timedelta(hours=4)
        )
        db.add_all([ev_before, ev_after])

        # Repair Job
        job = RepairJob(
            defect_id=defect_f.id,
            assigned_to="J. Kumar Emergency Patch Crew #3",
            started_at=now - datetime.timedelta(hours=6),
            completed_at=now - datetime.timedelta(hours=4),
            material_type="Steel Slag Cold-Mix Asphalt",
            material_kg=65.0,
            cost_inr=1020.50
        )
        db.add(job)
        db.flush()
        evaluate_liability(db, defect_f.id)

        # Audit log for closure
        db.add(AuditLog(
            entity="defect",
            entity_id=defect_f.id,
            actor="ENGINEER",
            action="close_defect",
            from_status="NOTICED",
            to_status="CLOSED",
            at=now - datetime.timedelta(hours=4),
            note="Closed by Executive Engineer. SLA breached: False. Latency: 22.0h."
        ))

        db.commit()
        print("[SUCCESS] All 6 demo scenarios seeded successfully!")

    finally:
        db.close()

if __name__ == "__main__":
    seed_demo_scenarios()
