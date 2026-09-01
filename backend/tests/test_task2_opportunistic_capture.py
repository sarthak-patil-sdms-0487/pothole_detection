import sys
import os
import unittest
from io import BytesIO
from PIL import Image
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from main import app
from src.config.database import init_db

class TestTask2OpportunisticCapture(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        init_db()
        cls.client = TestClient(app)

    def test_analyze_endpoint_opportunistic(self):
        # Create a test synthetic JPEG image in memory
        img = Image.new('RGB', (320, 240), color=(100, 100, 100))
        img_byte_arr = BytesIO()
        img.save(img_byte_arr, format='JPEG')
        img_byte_arr.seek(0)

        response = self.client.post(
            "/api/analyze",
            data={
                "detection_method": "YOLO (best.pt)",
                "capture_source": "OPPORTUNISTIC",
                "conf_threshold": "0.35"
            },
            files={"image": ("test_drive_frame.jpg", img_byte_arr, "image/jpeg")}
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("original_image_url", data)
        self.assertIn("annotated_image_url", data)
        self.assertIn("pothole_details", data)
        self.assertEqual(data.get("capture_source"), "OPPORTUNISTIC")

    def test_create_report_with_opportunistic_source(self):
        payload = {
            "original_image_url": "https://s3.example.com/drive_orig.jpg",
            "annotated_image_url": "https://s3.example.com/drive_annot.jpg",
            "detection_method": "YOLO (best.pt)",
            "pothole_details": [{"box_pixels": {"x1": 10, "y1": 10, "x2": 50, "y2": 50}, "confidence": 0.85}],
            "user_pothole_count": 1,
            "lat": 18.5204,
            "lng": 73.8567,
            "status": "SIGHTING",
            "reportedBy": "Opportunistic Drive Mode",
            "capture_source": "OPPORTUNISTIC",
            "severity": "Medium"
        }
        response = self.client.post("/api/reports", json=payload, headers={"X-Role": "SURVEYOR"})
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data.get("capture_source"), "OPPORTUNISTIC")
        self.assertEqual(data.get("status"), "SIGHTING")
        self.assertIsNotNone(data.get("id"))

if __name__ == "__main__":
    unittest.main()
