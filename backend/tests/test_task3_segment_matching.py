import sys
import os
import unittest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from main import app
from src.config.database import SessionLocal, init_db
from src.scripts.load_segments import load_segments
from src.services.segment_service import match_segment, reload_segments_cache

class TestTask3SegmentMatching(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        init_db()
        load_segments()
        reload_segments_cache()
        cls.client = TestClient(app)

    def test_direct_segment_matching_success(self):
        # Point on Spine Road North (coordinates: [[73.7810, 18.7510], ...])
        # Latitude ~18.75105, Longitude ~73.78105 (approx 6 meters from LineString)
        seg_id = match_segment(lat=18.75105, lng=73.78105, tolerance_m=30.0)
        self.assertIsNotNone(seg_id)

    def test_direct_segment_matching_out_of_tolerance(self):
        # Point far outside Chakan industrial estate (e.g. Mumbai coordinates 19.0760, 72.8777)
        seg_id = match_segment(lat=19.0760, lng=72.8777, tolerance_m=30.0)
        self.assertIsNone(seg_id)

    def test_auto_segment_assignment_on_report_creation(self):
        # 1. Report near Spine Road Central (coordinates: [[73.7860, 18.7570], ...])
        payload = {
            "original_image_url": "https://s3.example.com/seg_test.jpg",
            "annotated_image_url": "https://s3.example.com/seg_test_annot.jpg",
            "detection_method": "YOLO (best.pt)",
            "lat": 18.75702,
            "lng": 73.78602,
            "status": "SIGHTING",
            "capture_source": "WORKER",
            "severity": "High"
        }
        response = self.client.post("/api/reports", json=payload)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIsNotNone(data.get("segment_id"), "segment_id should be auto-resolved")
        self.assertEqual(data.get("capture_source"), "WORKER")

    def test_report_far_away_gets_none_segment(self):
        # Report with coordinates far away from all segments
        payload = {
            "original_image_url": "https://s3.example.com/remote.jpg",
            "annotated_image_url": "https://s3.example.com/remote_annot.jpg",
            "detection_method": "YOLO (best.pt)",
            "lat": 12.9716, # Bangalore coordinates
            "lng": 77.5946,
            "status": "SIGHTING",
            "capture_source": "OPPORTUNISTIC"
        }
        response = self.client.post("/api/reports", json=payload)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIsNone(data.get("segment_id"), "Remote coordinate should resolve to None")

if __name__ == "__main__":
    unittest.main()
