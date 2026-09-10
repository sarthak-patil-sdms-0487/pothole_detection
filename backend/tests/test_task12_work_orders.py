from tests.auth_helpers import auth_headers
import sys
import os
import unittest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from main import app
from src.config.database import init_db
from src.scripts.load_segments import load_segments
from src.scripts.seed_tenders import seed_tenders


class TestTask12WorkOrders(unittest.TestCase):
    """The repair queue: only noticed work appears, and assignment is engineer-gated."""

    @classmethod
    def setUpClass(cls):
        init_db()
        load_segments()
        seed_tenders()
        cls.client = TestClient(app)

    def _open_noticed_defect(self, lat=18.7512, lng=73.7812, segment_id=1):
        res = self.client.post("/api/reports", json={
            "original_image_url": "https://s3.example.com/wo_before.jpg",
            "annotated_image_url": "https://s3.example.com/wo_before_annot.jpg",
            "lat": lat,
            "lng": lng,
            "segment_id": segment_id,
            "capture_source": "WORKER",
            "severity": "High",
        })
        self.assertEqual(res.status_code, 200)
        defect_id = res.json()["defect_id"]
        promoted = self.client.post(
            f"/api/defects/{defect_id}/notice", headers=auth_headers("ENGINEER")
        )
        self.assertEqual(promoted.status_code, 200)
        return defect_id

    def test_only_noticed_work_appears_in_queue(self):
        defect_id = self._open_noticed_defect()

        res = self.client.get("/api/work-orders")
        self.assertEqual(res.status_code, 200)
        orders = res.json()

        states = {o["state"] for o in orders}
        self.assertTrue(
            states.issubset({"NOTICED", "CLOSED"}),
            f"Queue must not contain unpromoted defects, got states={states}",
        )

        row = next((o for o in orders if o["defect_id"] == defect_id), None)
        self.assertIsNotNone(row, "A noticed defect must appear as a work order")

        # Attribution and the clock ride along with the row.
        self.assertIsNotNone(row["sla_due_at"])
        self.assertIsNotNone(row["contractor_name"])
        self.assertEqual(row["verdict"], "IN_WARRANTY")
        self.assertIsNone(row["job"], "A freshly noticed defect has no crew yet")

    def test_unpromoted_defect_is_absent_and_cannot_be_assigned(self):
        # An opportunistic capture in an empty area stays a SIGHTING.
        res = self.client.post("/api/reports", json={
            "original_image_url": "https://s3.example.com/wo_sighting.jpg",
            "annotated_image_url": "https://s3.example.com/wo_sighting_annot.jpg",
            "lat": 18.7601,
            "lng": 73.7901,
            "capture_source": "OPPORTUNISTIC",
            "severity": "Low",
        })
        self.assertEqual(res.status_code, 200)
        sighting_defect_id = res.json()["defect_id"]

        state = self.client.get(f"/api/defects/{sighting_defect_id}").json()["state"]
        self.assertIn(state, ["SIGHTING", "CONFIRMED"])

        orders = self.client.get("/api/work-orders").json()
        self.assertNotIn(
            sighting_defect_id,
            [o["defect_id"] for o in orders],
            "Nothing is owed on an unpromoted defect, so it is not a work order",
        )

        blocked = self.client.post(
            "/api/work-orders/assign",
            json={"defect_id": sighting_defect_id, "assigned_to": "Crew A"},
            headers=auth_headers("ENGINEER"),
        )
        self.assertEqual(blocked.status_code, 400)

    def test_assignment_is_engineer_gated_and_persists(self):
        defect_id = self._open_noticed_defect(lat=18.7550, lng=73.7840, segment_id=4)

        forbidden = self.client.post(
            "/api/work-orders/assign",
            json={"defect_id": defect_id, "assigned_to": "Crew A"},
            headers=auth_headers("SURVEYOR"),
        )
        self.assertEqual(forbidden.status_code, 403)

        assigned = self.client.post(
            "/api/work-orders/assign",
            json={
                "defect_id": defect_id,
                "assigned_to": "Ward 3 Cold-Mix Crew",
                "material_type": "ECOFIX Steel Slag Mix",
                "material_kg": 85.0,
                "start_now": True,
            },
            headers=auth_headers("ENGINEER"),
        )
        self.assertEqual(assigned.status_code, 200)
        job = assigned.json()["job"]
        self.assertEqual(job["assigned_to"], "Ward 3 Cold-Mix Crew")
        self.assertEqual(job["material_kg"], 85.0)
        self.assertIsNotNone(job["started_at"])

        # Updating the same defect edits the existing job rather than adding one.
        updated = self.client.post(
            "/api/work-orders/assign",
            json={"defect_id": defect_id, "assigned_to": "Ward 5 Crew", "cost_inr": 4200.0},
            headers=auth_headers("ENGINEER"),
        )
        self.assertEqual(updated.status_code, 200)
        updated_job = updated.json()["job"]
        self.assertEqual(updated_job["id"], job["id"])
        self.assertEqual(updated_job["assigned_to"], "Ward 5 Crew")
        self.assertEqual(updated_job["cost_inr"], 4200.0)
        self.assertEqual(updated_job["material_kg"], 85.0, "Unset fields must survive an update")

    def test_queue_filters(self):
        self._open_noticed_defect(lat=18.7520, lng=73.7820, segment_id=1)

        unassigned = self.client.get("/api/work-orders?unassigned_only=true").json()
        self.assertTrue(all(not (o["job"] and o["job"]["assigned_to"]) for o in unassigned))

        breaches = self.client.get("/api/work-orders?breach_only=true").json()
        self.assertTrue(all(o["breach_flag"] for o in breaches))

        closed = self.client.get("/api/work-orders?state=CLOSED").json()
        self.assertTrue(all(o["state"] == "CLOSED" for o in closed))


if __name__ == "__main__":
    unittest.main()
