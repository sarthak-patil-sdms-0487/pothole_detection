import sys
import os
import unittest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from main import app
from src.config.database import SessionLocal, init_db
from src.schemas import Defect, AuditLog
from src.scripts.load_segments import load_segments
from src.scripts.seed_tenders import seed_tenders

class TestTask8ContractorNotices(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        init_db()
        load_segments()
        seed_tenders()
        cls.client = TestClient(app)

    def test_notice_generation_for_in_warranty_defect(self):
        # 1. Open a defect on Segment 1 (B.G. Shirke)
        pos = {"lat": 18.7512, "lng": 73.7812}
        res_rep = self.client.post("/api/reports", json={
            "original_image_url": "https://s3.example.com/pothole_notice_test.jpg",
            "annotated_image_url": "https://s3.example.com/pothole_notice_test_annot.jpg",
            "lat": pos["lat"],
            "lng": pos["lng"],
            "segment_id": 1,
            "capture_source": "WORKER",
            "severity": "High"
        })
        self.assertEqual(res_rep.status_code, 200)
        defect_id = res_rep.json()["defect_id"]

        # Promote to NOTICED
        res_notice = self.client.post(f"/api/defects/{defect_id}/notice", headers={"X-Role": "ENGINEER"})
        self.assertEqual(res_notice.status_code, 200)

        # 2. Fetch formatted statutory notice
        res_get_notice = self.client.get(f"/api/defects/{defect_id}/notice")
        self.assertEqual(res_get_notice.status_code, 200)
        notice = res_get_notice.json()

        self.assertIn("notice_ref", notice)
        self.assertIn("MIDC/NOT/2026/", notice["notice_ref"])
        self.assertEqual(notice["contractor_name"], "B.G. Shirke Construction Technology Pvt Ltd")
        self.assertEqual(notice["contractor_email"], "contracts@bgshirke.com")
        self.assertEqual(notice["tender_ref"], "MIDC/EE/PUNE/2024/TR-01")
        self.assertEqual(notice["verdict"], "IN_WARRANTY")
        self.assertEqual(notice["statutory_deadline_hours"], 48)
        self.assertIn("NOTICE UNDER ROAD WORK DEFECT LIABILITY PERIOD", notice["legal_hedge"])
        self.assertIn("STATUTORY REPAIR DIRECTIVE", notice["notice_text"])

    def test_automatic_and_manual_notice_dispatch(self):
        # 1. Defect explicitly on Segment 4 (Ashoka Buildcon)
        res_rep = self.client.post("/api/reports", json={
            "original_image_url": "https://s3.example.com/pothole_ashoka.jpg",
            "annotated_image_url": "https://s3.example.com/pothole_ashoka_annot.jpg",
            "lat": 18.7550,
            "lng": 73.7840,
            "segment_id": 4,
            "capture_source": "WORKER",
            "severity": "High"
        })
        self.assertEqual(res_rep.status_code, 200)
        defect_id = res_rep.json()["defect_id"]

        # Promote to NOTICED
        self.client.post(f"/api/defects/{defect_id}/notice", headers={"X-Role": "ENGINEER"})

        # Check audit log for auto-dispatch
        db = SessionLocal()
        auto_audit = db.query(AuditLog).filter(
            AuditLog.entity == "defect",
            AuditLog.entity_id == defect_id,
            AuditLog.action == "issue_contractor_notice"
        ).first()
        self.assertIsNotNone(auto_audit, "Promoting in-warranty defect to NOTICED must auto-issue contractor notice")
        db.close()

        # 2. Manual resend test - non-engineer gets 403
        res_forbid = self.client.post(f"/api/defects/{defect_id}/notice/send", headers={"X-Role": "SURVEYOR"})
        self.assertEqual(res_forbid.status_code, 403)

        # 3. Engineer triggers resend
        res_send = self.client.post(f"/api/defects/{defect_id}/notice/send", headers={"X-Role": "ENGINEER"})
        self.assertEqual(res_send.status_code, 200)
        send_report = res_send.json()
        self.assertIn(send_report["status"], ["SIMULATED", "SENT"])
        self.assertEqual(send_report["contractor"], "Ashoka Buildcon Ltd")

if __name__ == "__main__":
    unittest.main()
