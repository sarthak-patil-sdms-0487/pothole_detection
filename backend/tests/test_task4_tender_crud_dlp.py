from tests.auth_helpers import auth_headers
import sys
import os
import unittest
import json
import datetime
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from main import app
from src.config.database import init_db
from src.scripts.load_segments import load_segments
from src.scripts.seed_tenders import seed_tenders

class TestTask4TenderCrudDlp(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        init_db()
        load_segments()
        seed_tenders()
        cls.client = TestClient(app)

    def test_list_tenders_and_active_filter(self):
        # 1. Get all tenders
        res_all = self.client.get("/api/tenders", headers=auth_headers("ENGINEER"))
        self.assertEqual(res_all.status_code, 200)
        tenders = res_all.json()
        self.assertGreaterEqual(len(tenders), 10)

        # 2. Get active DLP only
        res_active = self.client.get("/api/tenders?active_only=true", headers=auth_headers("ENGINEER"))
        self.assertEqual(res_active.status_code, 200)
        active_tenders = res_active.json()
        self.assertTrue(all(t["is_active_dlp"] is True for t in active_tenders))

    def test_create_and_delete_tender(self):
        payload = {
            "tender_ref": "MAHA/TEST/2026/09",
            "contractor_name": "Test Infra Corporation",
            "contractor_contact_email": "test@infracorp.com",
            "description": "Test road resurfacing project",
            "completion_date": str(datetime.date.today() + datetime.timedelta(days=30)),
            "dlp_years": 3.0,
            "dlp_expiry_date": str(datetime.date.today() + datetime.timedelta(days=1095)),
            "value_inr": 15000000.0,
            "segment_ids": [1, 2]
        }
        res_create = self.client.post("/api/tenders", json=payload, headers=auth_headers("ENGINEER"))
        self.assertEqual(res_create.status_code, 200)
        created = res_create.json()
        tender_id = created["id"]
        self.assertEqual(created["tender_ref"], "MAHA/TEST/2026/09")
        self.assertEqual(created["segment_ids"], [1, 2])
        self.assertTrue(created["is_active_dlp"])

        # Delete the test tender
        res_del = self.client.delete(f"/api/tenders/{tender_id}", headers=auth_headers("ENGINEER"))
        self.assertEqual(res_del.status_code, 204)

    def test_extracted_dlp_samples_exist(self):
        sample_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "../data/extracted_dlp_samples.json"))
        self.assertTrue(os.path.exists(sample_path), "extracted_dlp_samples.json must exist")
        with open(sample_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        self.assertEqual(len(data), 3)
        for item in data:
            self.assertIn("tender_ref", item)
            self.assertIn("dlp_years", item)
            self.assertIn("sla_mandate_hours", item)
            self.assertEqual(item["sla_mandate_hours"], 48)

if __name__ == "__main__":
    unittest.main()
