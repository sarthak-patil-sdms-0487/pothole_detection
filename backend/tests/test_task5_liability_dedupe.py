from tests.auth_helpers import auth_headers
import sys
import os
import unittest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from main import app
from src.config.database import SessionLocal, init_db
from src.schemas import Defect, LiabilityVerdict, Report
from src.scripts.load_segments import load_segments
from src.scripts.seed_tenders import seed_tenders
from src.services.liability_service import evaluate_liability

class TestTask5LiabilityDedupe(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        init_db()
        load_segments()
        seed_tenders()
        cls.client = TestClient(app)

    def test_worker_report_creates_confirmed_or_noticed_defect_directly(self):
        payload = {
            "original_image_url": "https://s3.example.com/worker_report.jpg",
            "annotated_image_url": "https://s3.example.com/worker_report_annot.jpg",
            "detection_method": "YOLO (best.pt)",
            "lat": 18.7692,
            "lng": 73.7912,
            "capture_source": "WORKER",
            "severity": "Low"
        }
        res = self.client.post("/api/reports", json=payload, headers=auth_headers("SURVEYOR"))
        self.assertEqual(res.status_code, 200)
        report_data = res.json()
        defect_id = report_data["defect_id"]
        self.assertIsNotNone(defect_id)

        db = SessionLocal()
        defect = db.query(Defect).filter(Defect.id == defect_id).first()
        self.assertIn(defect.state, ["CONFIRMED", "NOTICED"], "Worker report must skip SIGHTING and create CONFIRMED or higher directly")
        self.assertIsNotNone(defect.confirmed_at)
        db.close()

    def test_opportunistic_capture_creates_sighting_defect(self):
        payload = {
            "original_image_url": "https://s3.example.com/opp_report.jpg",
            "annotated_image_url": "https://s3.example.com/opp_report_annot.jpg",
            "detection_method": "YOLO (best.pt)",
            "lat": 18.7600,
            "lng": 73.7890,
            "capture_source": "OPPORTUNISTIC",
            "severity": "Low"
        }
        res = self.client.post("/api/reports", json=payload, headers=auth_headers("SURVEYOR"))
        self.assertEqual(res.status_code, 200)
        report_data = res.json()
        defect_id = report_data["defect_id"]
        self.assertIsNotNone(defect_id)

        db = SessionLocal()
        defect = db.query(Defect).filter(Defect.id == defect_id).first()
        self.assertEqual(defect.state, "SIGHTING", "Opportunistic report must start at SIGHTING")
        self.assertIsNone(defect.confirmed_at)
        db.close()

    def test_deduplication_clusters_within_15m(self):
        # 1. First opportunistic sighting at point A
        pos1 = {"lat": 18.75405, "lng": 73.78355}
        res1 = self.client.post("/api/reports", json={
            "original_image_url": "https://s3.example.com/cluster1.jpg",
            "annotated_image_url": "https://s3.example.com/cluster1_annot.jpg",
            "detection_method": "YOLO (best.pt)",
            "lat": pos1["lat"],
            "lng": pos1["lng"],
            "capture_source": "OPPORTUNISTIC",
            "severity": "Medium"
        })
        self.assertEqual(res1.status_code, 200)
        defect_id_1 = res1.json()["defect_id"]

        # 2. Second sighting ~8 meters away on the same segment
        pos2 = {"lat": 18.75409, "lng": 73.78359}
        res2 = self.client.post("/api/reports", json={
            "original_image_url": "https://s3.example.com/cluster2.jpg",
            "annotated_image_url": "https://s3.example.com/cluster2_annot.jpg",
            "detection_method": "YOLO (best.pt)",
            "lat": pos2["lat"],
            "lng": pos2["lng"],
            "capture_source": "OPPORTUNISTIC",
            "severity": "High"
        })
        self.assertEqual(res2.status_code, 200)
        defect_id_2 = res2.json()["defect_id"]

        # Must attach to the same defect ID
        self.assertEqual(defect_id_1, defect_id_2, "Sightings within 15m on same segment must cluster into the same defect")

    def test_liability_evaluation_verdicts(self):
        db = SessionLocal()
        try:
            # Test 1: Defect on Segment 1 (B.G. Shirke, Active DLP till 2027)
            d1 = Defect(segment_id=1, state="NOTICED", severity=0.8)
            db.add(d1)
            db.commit()
            db.refresh(d1)

            v1 = evaluate_liability(db, d1.id)
            self.assertEqual(v1.verdict, "IN_WARRANTY")
            self.assertGreaterEqual(v1.confidence, 0.90)
            self.assertIn("Probable contractor/tender match", v1.rationale)
            self.assertIn("B.G. Shirke", v1.rationale)

            # Test 2: Defect on Segment 3 (Supreme Infra, Expired June 2024)
            d2 = Defect(segment_id=3, state="NOTICED", severity=0.7)
            db.add(d2)
            db.commit()
            db.refresh(d2)

            v2 = evaluate_liability(db, d2.id)
            self.assertEqual(v2.verdict, "OUT_OF_WARRANTY")
            self.assertIn("Probable contractor/tender match", v2.rationale)

            # Test 3: Defect on Segment with no tender (e.g. Segment 13 - Sub-Station Feeder)
            d3 = Defect(segment_id=13, state="NOTICED", severity=0.5)
            db.add(d3)
            db.commit()
            db.refresh(d3)

            v3 = evaluate_liability(db, d3.id)
            self.assertEqual(v3.verdict, "NO_MATCHING_CONTRACT")
            self.assertIn("NO_MATCHING_CONTRACT", v3.rationale)

        finally:
            db.close()

if __name__ == "__main__":
    unittest.main()
