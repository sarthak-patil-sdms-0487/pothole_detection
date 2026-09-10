from tests.auth_helpers import auth_headers
import sys
import os
import unittest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from main import app
from src.scripts.seed_demo_scenarios import seed_demo_scenarios

class TestTask10DemoScenarios(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        seed_demo_scenarios()
        cls.client = TestClient(app)

    def test_all_six_lifecycle_scenarios_queryable(self):
        res = self.client.get("/api/defects", headers=auth_headers("ENGINEER"))
        self.assertEqual(res.status_code, 200)
        defects = res.json()
        self.assertEqual(len(defects), 6, "Must have exactly 6 seeded demo defects")

        # Map by state and characteristics
        sighting = next(d for d in defects if d["state"] == "SIGHTING")
        confirmed = next(d for d in defects if d["state"] == "CONFIRMED")
        noticed_active = next(d for d in defects if d["state"] == "NOTICED" and not d["breach_flag"] and d.get("latest_verdict", {}).get("verdict") == "IN_WARRANTY")
        noticed_out = next(d for d in defects if d["state"] == "NOTICED" and d.get("latest_verdict", {}).get("verdict") == "OUT_OF_WARRANTY")
        noticed_breached = next(d for d in defects if d["state"] == "NOTICED" and d["breach_flag"])
        closed = next(d for d in defects if d["state"] == "CLOSED")

        # 1. Verify SIGHTING
        self.assertIsNone(sighting["noticed_at"])
        self.assertEqual(len(sighting["sightings"]), 1)

        # 2. Verify CONFIRMED (2 sightings)
        self.assertIsNone(confirmed["noticed_at"])
        self.assertEqual(confirmed["repeat_sighting_count"], 2)

        # 3. Verify NOTICED active in-warranty (approx 36 hours remaining)
        self.assertIsNotNone(noticed_active["sla_due_at"])
        self.assertGreater(noticed_active["sla_hours_remaining"], 0)
        self.assertFalse(noticed_active["breach_flag"])

        # 4. Verify NOTICED out of warranty
        self.assertEqual(noticed_out["latest_verdict"]["verdict"], "OUT_OF_WARRANTY")

        # 5. Verify NOTICED breached
        self.assertTrue(noticed_breached["breach_flag"])

        # 6. Verify CLOSED with before & after evidences
        self.assertIsNotNone(closed["closed_at"])
        self.assertFalse(closed["breach_flag"])
        self.assertEqual(len(closed["evidence_list"]), 2)
        kinds = [e["kind"] for e in closed["evidence_list"]]
        self.assertIn("BEFORE", kinds)
        self.assertIn("AFTER", kinds)

    def test_statutory_notice_endpoint_for_in_warranty_demo_defect(self):
        # Find the in-warranty active defect
        res = self.client.get("/api/defects", headers=auth_headers("ENGINEER"))
        defects = res.json()
        target = next(d for d in defects if d["state"] == "NOTICED" and not d["breach_flag"] and d.get("latest_verdict", {}).get("verdict") == "IN_WARRANTY")
        
        res_notice = self.client.get(f"/api/defects/{target['id']}/notice")
        self.assertEqual(res_notice.status_code, 200)
        notice = res_notice.json()
        self.assertIn("SIDC/NOT/2026/", notice["notice_ref"])
        self.assertEqual(notice["contractor_name"], "B.G. Shirke Construction Technology Pvt Ltd")
        self.assertIn("NOTICE UNDER ROAD WORK DEFECT LIABILITY PERIOD", notice["legal_hedge"])

if __name__ == "__main__":
    unittest.main()
