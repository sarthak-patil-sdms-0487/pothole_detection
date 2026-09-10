from tests.auth_helpers import auth_headers
import sys
import os
import unittest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from main import app
from src.config.database import SessionLocal, init_db
from src.schemas import Defect, LiabilityVerdict, AuditLog, Report
from src.scripts.load_segments import load_segments
from src.scripts.seed_tenders import seed_tenders

class TestTask6PromotionPolicy(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        init_db()
        load_segments()
        seed_tenders()
        cls.client = TestClient(app)

    def test_repeat_sighting_auto_promotion_to_confirmed(self):
        # 1. First opportunistic sighting on Segment 2 (Spine Road Center)
        # Lat: 18.7530, Lng: 73.7830
        pos = {"lat": 18.7530, "lng": 73.7830}
        res1 = self.client.post("/api/reports", json={
            "original_image_url": "https://s3.example.com/rep1.jpg",
            "annotated_image_url": "https://s3.example.com/rep1_annot.jpg",
            "detection_method": "YOLO (best.pt)",
            "lat": pos["lat"],
            "lng": pos["lng"],
            "capture_source": "OPPORTUNISTIC",
            "severity": "Low"
        })
        self.assertEqual(res1.status_code, 200)
        defect_id = res1.json()["defect_id"]

        db = SessionLocal()
        d_initial = db.query(Defect).filter(Defect.id == defect_id).first()
        self.assertIn(d_initial.state, ["SIGHTING", "CONFIRMED"])
        db.close()

        # 2. Second sighting ~3m away on same segment
        res2 = self.client.post("/api/reports", json={
            "original_image_url": "https://s3.example.com/rep2.jpg",
            "annotated_image_url": "https://s3.example.com/rep2_annot.jpg",
            "detection_method": "YOLO (best.pt)",
            "lat": pos["lat"] + 0.00002,
            "lng": pos["lng"] + 0.00002,
            "capture_source": "OPPORTUNISTIC",
            "severity": "Low"
        })
        self.assertEqual(res2.status_code, 200)
        self.assertEqual(res2.json()["defect_id"], defect_id)

        # 3. Check defect state auto-promoted to CONFIRMED
        db = SessionLocal()
        d_updated = db.query(Defect).filter(Defect.id == defect_id).first()
        self.assertIn(d_updated.state, ["CONFIRMED", "NOTICED"])
        self.assertIsNotNone(d_updated.confirmed_at)
        db.close()

    def test_policy_threshold_auto_promotes_to_noticed_with_sla(self):
        # Sighting with high severity (0.9) on Segment 1 (Spine Road: traffic weight 2.5 + weighbridge + active DLP)
        pos = {"lat": 18.75105, "lng": 73.78105}
        res = self.client.post("/api/reports", json={
            "original_image_url": "https://s3.example.com/critical_pothole.jpg",
            "annotated_image_url": "https://s3.example.com/critical_pothole_annot.jpg",
            "detection_method": "YOLO (best.pt)",
            "lat": pos["lat"],
            "lng": pos["lng"],
            "capture_source": "WORKER",
            "severity": "High"
        })
        self.assertEqual(res.status_code, 200)
        defect_id = res.json()["defect_id"]

        db = SessionLocal()
        d = db.query(Defect).filter(Defect.id == defect_id).first()
        self.assertEqual(d.state, "NOTICED", "High-score defect must auto-promote to NOTICED")
        self.assertIsNotNone(d.noticed_at)
        self.assertIsNotNone(d.sla_due_at)
        
        # 48 hour SLA check
        sla_hours = (d.sla_due_at - d.noticed_at).total_seconds() / 3600.0
        self.assertAlmostEqual(sla_hours, 48.0, delta=0.5)

        # Liability verdict attached
        verdict = db.query(LiabilityVerdict).filter(LiabilityVerdict.defect_id == d.id).first()
        self.assertIsNotNone(verdict, "Entering NOTICED must trigger automatic liability evaluation")
        self.assertEqual(verdict.verdict, "IN_WARRANTY")
        db.close()

    def test_engineer_manual_notice_endpoint(self):
        # Create a SIGHTING defect
        db = SessionLocal()
        d = Defect(segment_id=2, state="SIGHTING", severity=0.4)
        db.add(d)
        db.commit()
        db.refresh(d)
        defect_id = d.id
        db.close()

        # 1. Non-engineer role fails with 403 Forbidden
        res_forbidden = self.client.post(f"/api/defects/{defect_id}/notice", headers=auth_headers("SURVEYOR"))
        self.assertEqual(res_forbidden.status_code, 403)

        # 2. Engineer role succeeds and promotes to NOTICED
        res_success = self.client.post(f"/api/defects/{defect_id}/notice", headers=auth_headers("ENGINEER"))
        self.assertEqual(res_success.status_code, 200)
        data = res_success.json()
        self.assertEqual(data["state"], "NOTICED")
        self.assertIsNotNone(data["sla_due_at"])
        self.assertIsNotNone(data["latest_verdict"])

        # 3. Check audit log entry
        db = SessionLocal()
        audit = db.query(AuditLog).filter(
            AuditLog.entity == "defect",
            AuditLog.entity_id == defect_id,
            AuditLog.action == "promote_to_noticed"
        ).first()
        self.assertIsNotNone(audit)
        self.assertEqual(audit.actor, "ENGINEER")
        db.close()

    def test_defects_list_and_sweep(self):
        # 1. Query defects list
        res = self.client.get("/api/defects")
        self.assertEqual(res.status_code, 200)
        defects = res.json()
        self.assertGreaterEqual(len(defects), 1)

        # 2. Trigger policy sweep endpoint
        res_sweep = self.client.post("/api/defects/sweep")
        self.assertEqual(res_sweep.status_code, 200)
        sweep_data = res_sweep.json()
        self.assertIn("evaluated_count", sweep_data)
        self.assertIn("promoted_to_noticed_count", sweep_data)

if __name__ == "__main__":
    unittest.main()
