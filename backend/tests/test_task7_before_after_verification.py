from tests.auth_helpers import auth_headers
import sys
import os
import unittest
import io
import datetime
import numpy as np
import cv2
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from main import app
from src.config.database import SessionLocal, init_db
from src.schemas import Defect, Evidence, RepairJob, AuditLog
from src.scripts.load_segments import load_segments
from src.scripts.seed_tenders import seed_tenders

def create_dummy_clean_asphalt_image_bytes() -> bytes:
    """Creates a blank grey asphalt image with no potholes."""
    img = np.full((300, 300, 3), 80, dtype=np.uint8)
    _, encoded = cv2.imencode(".jpg", img)
    return encoded.tobytes()

class TestTask7BeforeAfterVerification(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        init_db()
        load_segments()
        seed_tenders()
        cls.client = TestClient(app)

    def test_passing_repair_verification_and_close_met_sla(self):
        # 1. Open a NOTICED defect on Segment 1
        pos = {"lat": 18.7512, "lng": 73.7812}
        res_rep = self.client.post("/api/reports", json={
            "original_image_url": "https://s3.example.com/pothole1.jpg",
            "annotated_image_url": "https://s3.example.com/pothole1_annot.jpg",
            "lat": pos["lat"],
            "lng": pos["lng"],
            "capture_source": "WORKER",
            "severity": "High"
        })
        self.assertEqual(res_rep.status_code, 200)
        defect_id = res_rep.json()["defect_id"]

        # Ensure defect is NOTICED
        res_notice = self.client.post(f"/api/defects/{defect_id}/notice", headers=auth_headers("ENGINEER"))
        self.assertEqual(res_notice.status_code, 200)
        defect_data = res_notice.json()
        self.assertEqual(defect_data["state"], "NOTICED")

        # 2. Submit clean after photo within 5m
        clean_bytes = create_dummy_clean_asphalt_image_bytes()
        files = {"file": ("after_clean.jpg", io.BytesIO(clean_bytes), "image/jpeg")}
        data = {
            "after_lat": str(pos["lat"] + 0.00003), # ~3.3m
            "after_lng": str(pos["lng"] + 0.00003),
            "contractor_notes": "Filled with 50kg steel slag cold asphalt mix",
            "material_type": "Steel Slag Cold Mix",
            "material_kg": "50.0"
        }
        res_evidence = self.client.post(
            f"/api/defects/{defect_id}/repair-evidence",
            files=files,
            data=data,
            headers=auth_headers("SURVEYOR")
        )
        self.assertEqual(res_evidence.status_code, 200)
        ev_data = res_evidence.json()
        self.assertTrue(ev_data["verified"])
        self.assertEqual(ev_data["detections_found"], 0)
        self.assertLessEqual(ev_data["distance_m"], 20.0)

        # Check DB evidence
        db = SessionLocal()
        after_ev = db.query(Evidence).filter(Evidence.defect_id == defect_id, Evidence.kind == "AFTER").first()
        self.assertIsNotNone(after_ev)
        job = db.query(RepairJob).filter(RepairJob.defect_id == defect_id).first()
        self.assertIsNotNone(job)
        self.assertEqual(job.material_type, "Steel Slag Cold Mix")
        db.close()

        # 3. Close the defect (SLA is met since now < sla_due_at)
        res_close = self.client.post(
            f"/api/defects/{defect_id}/close",
            json={"reason": "Certified restoration completed"},
            headers=auth_headers("ENGINEER")
        )
        self.assertEqual(res_close.status_code, 200)
        close_data = res_close.json()
        self.assertEqual(close_data["state"], "CLOSED")
        self.assertFalse(close_data["breach_flag"], "Must not breach SLA when completed within 48h")
        self.assertIsNotNone(close_data["closed_at"])

    def test_failing_repair_verification_on_distance(self):
        # 1. Open a NOTICED defect
        pos = {"lat": 18.7512, "lng": 73.7812}
        res_rep = self.client.post("/api/reports", json={
            "original_image_url": "https://s3.example.com/pothole2.jpg",
            "annotated_image_url": "https://s3.example.com/pothole2_annot.jpg",
            "lat": pos["lat"],
            "lng": pos["lng"],
            "capture_source": "WORKER",
            "severity": "Low"
        })
        defect_id = res_rep.json()["defect_id"]

        # 2. Submit after photo with coordinates 150m away
        clean_bytes = create_dummy_clean_asphalt_image_bytes()
        files = {"file": ("after_far.jpg", io.BytesIO(clean_bytes), "image/jpeg")}
        data = {
            "after_lat": str(pos["lat"] + 0.001), # ~110-150m away
            "after_lng": str(pos["lng"] + 0.001)
        }
        res_fail = self.client.post(
            f"/api/defects/{defect_id}/repair-evidence",
            files=files,
            data=data,
            headers=auth_headers("SURVEYOR")
        )
        self.assertEqual(res_fail.status_code, 422, "Must return HTTP 422 when verification checks fail")
        fail_body = res_fail.json()
        self.assertIn("detail", fail_body)
        details = fail_body["detail"]["details"]
        self.assertGreater(details["distance_m"], 20.0)
        self.assertFalse(details["verified"])
        self.assertTrue(len(details["errors"]) > 0)

    def test_sla_breach_detection_on_close(self):
        # Create a defect whose sla_due_at is 2 days in the past
        db = SessionLocal()
        d = Defect(
            segment_id=1,
            state="NOTICED",
            first_seen_at=datetime.datetime.utcnow() - datetime.timedelta(days=4),
            noticed_at=datetime.datetime.utcnow() - datetime.timedelta(days=3),
            sla_due_at=datetime.datetime.utcnow() - datetime.timedelta(days=1), # Expired 24h ago
            severity=0.8
        )
        db.add(d)
        db.commit()
        db.refresh(d)
        defect_id = d.id
        db.close()

        # Engineer closes with override
        res_close = self.client.post(
            f"/api/defects/{defect_id}/close",
            json={"reason": "Late municipal repair", "override_verification": True},
            headers=auth_headers("ENGINEER")
        )
        self.assertEqual(res_close.status_code, 200)
        data = res_close.json()
        self.assertEqual(data["state"], "CLOSED")
        self.assertTrue(data["breach_flag"], "Must flag breach when closed after sla_due_at")

if __name__ == "__main__":
    unittest.main()
