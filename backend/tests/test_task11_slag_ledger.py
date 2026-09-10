from tests.auth_helpers import auth_headers
import sys
import os
import unittest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from main import app
from src.config.database import init_db
from src.scripts.seed_slag import seed_slag
from src.schemas.slag_dto import STANDARD_SLAG_RATE_INR_PER_KG

class TestTask11SlagLedger(unittest.TestCase):
    def setUp(self):
        init_db()
        seed_slag()
        self.client = TestClient(app)

    def test_get_slag_summary(self):
        res = self.client.get("/api/slag/summary")
        self.assertEqual(res.status_code, 200)
        summary = res.json()
        self.assertEqual(summary["total_lots"], 4)
        self.assertEqual(summary["total_tonnes_allocated"], 150.0)
        self.assertGreater(summary["total_kg_drawn"], 1000.0)
        self.assertEqual(summary["rate_per_kg_inr"], STANDARD_SLAG_RATE_INR_PER_KG)
        self.assertGreater(summary["co2_avoided_tonnes"], 0.1)

    def test_list_slag_lots_and_draws(self):
        res_lots = self.client.get("/api/slag/lots")
        self.assertEqual(res_lots.status_code, 200)
        lots = res_lots.json()
        self.assertEqual(len(lots), 4)
        for lot in lots:
            self.assertGreaterEqual(lot["kg_remaining"], 0)
            self.assertIn("tenant_unit_name", lot)

        res_draws = self.client.get("/api/slag/draws")
        self.assertEqual(res_draws.status_code, 200)
        draws = res_draws.json()
        self.assertEqual(len(draws), 6)

    def test_create_lot_and_draw_material(self):
        # 1. Create a new lot (e.g. 10 tonnes = 10,000 kg)
        lot_payload = {
            "tenant_unit_name": "Test Steel Works Ltd",
            "tonnes": 10.0,
            "stockpile_location": "Yard B"
        }
        res_create_lot = self.client.post("/api/slag/lots", json=lot_payload, headers=auth_headers("ENGINEER"))
        self.assertEqual(res_create_lot.status_code, 200)
        created_lot = res_create_lot.json()
        lot_id = created_lot["id"]
        self.assertEqual(created_lot["kg_total"], 10000.0)
        self.assertEqual(created_lot["kg_remaining"], 10000.0)

        # 2. Draw 500 kg against new lot
        draw_payload = {
            "slag_lot_id": lot_id,
            "repair_job_id": 1,
            "kg_drawn": 500.0
        }
        res_draw = self.client.post("/api/slag/draws", json=draw_payload, headers=auth_headers("ENGINEER"))
        self.assertEqual(res_draw.status_code, 200)
        draw_data = res_draw.json()
        self.assertEqual(draw_data["kg_drawn"], 500.0)
        self.assertAlmostEqual(draw_data["notional_value_inr"], 500.0 * STANDARD_SLAG_RATE_INR_PER_KG, places=2)

        # 3. Draw exceeding remaining balance (e.g. 20,000 kg) -> 400 Bad Request
        over_draw_payload = {
            "slag_lot_id": lot_id,
            "repair_job_id": 1,
            "kg_drawn": 20000.0
        }
        res_over = self.client.post("/api/slag/draws", json=over_draw_payload, headers=auth_headers("ENGINEER"))
        self.assertEqual(res_over.status_code, 400)

if __name__ == "__main__":
    unittest.main()
