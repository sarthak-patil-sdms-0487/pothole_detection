import sys
import os
import unittest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from src.schemas import (
    Base, Estate, RoadSegment, Defect, Tender, TenderSegment,
    LiabilityVerdict, RepairJob, Evidence, SlagLot, SlagDraw, AuditLog, Report
)
from src.services.audit_service import record_audit
from src.middlewares.role import get_current_role

class TestTask1SchemaAuditRole(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
        cls.Session = sessionmaker(autocommit=False, autoflush=False, bind=cls.engine)
        Base.metadata.create_all(bind=cls.engine)

    @classmethod
    def tearDownClass(cls):
        Base.metadata.drop_all(bind=cls.engine)

    def setUp(self):
        self.db = self.Session()

    def tearDown(self):
        self.db.rollback()
        self.db.close()

    def test_full_schema_models(self):
        # 1. Estate
        estate = Estate(name="MIDC Chakan Phase 2", config_json={"confirm_repeat_threshold": 2})
        self.db.add(estate)
        self.db.commit()
        self.assertIsNotNone(estate.id)

        # 2. Road Segment
        segment = RoadSegment(
            estate_id=estate.id,
            name="Main spine road",
            geometry={"type": "LineString", "coordinates": [[73.85, 18.52], [73.86, 18.53]]},
            length_m=500.0,
            owner="SIDC",
            traffic_class="HEAVY",
            traffic_class_weight=1.5,
            near_gate_or_weighbridge=True,
            has_active_dlp=True
        )
        self.db.add(segment)
        self.db.commit()
        self.assertIsNotNone(segment.id)
        self.assertTrue(segment.near_gate_or_weighbridge)

        # 3. Defect
        defect = Defect(
            segment_id=segment.id,
            state="SIGHTING",
            severity=0.75,
            promotion_reason="initial_capture"
        )
        self.db.add(defect)
        self.db.commit()
        self.assertIsNotNone(defect.id)
        self.assertEqual(defect.state, "SIGHTING")

        # 4. Report with new columns
        report = Report(
            original_image_url="https://s3.example.com/orig.jpg",
            annotated_image_url="https://s3.example.com/annot.jpg",
            lat=18.52,
            lng=73.85,
            defect_id=defect.id,
            segment_id=segment.id,
            capture_source="OPPORTUNISTIC"
        )
        self.db.add(report)
        self.db.commit()
        self.assertEqual(report.defect_id, defect.id)
        self.assertEqual(report.segment_id, segment.id)
        self.assertEqual(report.capture_source, "OPPORTUNISTIC")

        # 5. Tender & TenderSegment
        tender = Tender(
            tender_ref="TND-2024-001",
            contractor_name="Apex Infra Ltd",
            contractor_contact_email="apex@example.com",
            description="Spine road resurfacing",
            dlp_years=3.0
        )
        self.db.add(tender)
        self.db.commit()

        tender_seg = TenderSegment(tender_id=tender.id, segment_id=segment.id)
        self.db.add(tender_seg)
        self.db.commit()

        # 6. Liability Verdict
        verdict = LiabilityVerdict(
            defect_id=defect.id,
            tender_id=tender.id,
            verdict="IN_WARRANTY",
            confidence=0.95,
            rationale="Probable contractor/tender match based on road-segment mapping — verdict IN_WARRANTY"
        )
        self.db.add(verdict)
        self.db.commit()
        self.assertEqual(verdict.verdict, "IN_WARRANTY")

        # 7. Repair Job & Evidence
        job = RepairJob(
            defect_id=defect.id,
            assigned_to="Contractor Crew 1",
            material_type="Cold mix asphalt",
            material_kg=50.0,
            cost_inr=1500.00
        )
        self.db.add(job)
        self.db.commit()

        ev_before = Evidence(
            defect_id=defect.id,
            kind="BEFORE",
            photo_uri="https://s3.example.com/before.jpg",
            lat=18.52,
            lng=73.85
        )
        self.db.add(ev_before)
        self.db.commit()
        self.assertEqual(ev_before.kind, "BEFORE")

        # 8. Slag Lot & Slag Draw
        slag_lot = SlagLot(
            tenant_unit_name="Tata Steel Chakan",
            estate_id=estate.id,
            tonnes=120.5,
            stockpile_location="Yard 4B"
        )
        self.db.add(slag_lot)
        self.db.commit()

        slag_draw = SlagDraw(
            slag_lot_id=slag_lot.id,
            repair_job_id=job.id,
            kg_drawn=50.0,
            notional_value_inr=785.00
        )
        self.db.add(slag_draw)
        self.db.commit()
        self.assertEqual(slag_draw.kg_drawn, 50.0)

    def test_record_audit(self):
        audit = record_audit(
            db=self.db,
            entity="defect",
            entity_id=10,
            actor="ENGINEER",
            action="notice",
            from_status="CONFIRMED",
            to_status="NOTICED",
            note="Promoted via policy threshold score 82/100"
        )
        self.assertIsNotNone(audit.id)
        self.assertEqual(audit.entity, "defect")
        self.assertEqual(audit.actor, "ENGINEER")
        self.assertEqual(audit.from_status, "CONFIRMED")
        self.assertEqual(audit.to_status, "NOTICED")
        self.assertIn("policy threshold", audit.note)

    def test_role_resolution(self):
        self.assertEqual(get_current_role(x_role="ENGINEER"), "ENGINEER")
        self.assertEqual(get_current_role(x_role="engineer"), "ENGINEER")
        self.assertEqual(get_current_role(x_role="SURVEYOR"), "SURVEYOR")
        self.assertEqual(get_current_role(x_role=None, role="engineer"), "ENGINEER")
        self.assertEqual(get_current_role(x_role=None, role=None), "SURVEYOR")
        self.assertEqual(get_current_role(x_role="random"), "SURVEYOR")

if __name__ == "__main__":
    unittest.main()
