import os
import math
import cv2
import numpy as np
from ultralytics import YOLO
import logging

logger = logging.getLogger(__name__)

# Resolve model path robustly relative to current file directory
MODELS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "models"))
MODEL_PATH = os.path.join(MODELS_DIR, "best.pt")
if not os.path.exists(MODEL_PATH):
    MODEL_PATH = os.path.join(MODELS_DIR, "best1.pt")

model = None

def get_yolo_model():
    global model
    if model is None:
        try:
            logger.info(f"[YOLO] Loading model from: {MODEL_PATH}")
            if os.path.exists(MODEL_PATH):
                model = YOLO(MODEL_PATH)
                logger.info(f"[YOLO] Model loaded successfully: {model.names}")
            else:
                logger.error(f"[YOLO] Model file not found at: {MODEL_PATH}")
        except Exception as e:
            logger.error(f"[YOLO] Error loading model: {e}", exc_info=True)
    return model

# Initialize on startup
get_yolo_model()

def calculate_cm_per_pixel(camera_height_m, tilt_angle_deg, fov_vertical_deg,
                             fov_horizontal_deg, image_height_px, image_width_px,
                             pothole_center_y_px):
    try:
        tilt_rad = math.radians(tilt_angle_deg)
        fov_v_rad = math.radians(fov_vertical_deg)
        fov_h_rad = math.radians(fov_horizontal_deg)
        pixel_offset_ratio = (pothole_center_y_px - image_height_px / 2) / (image_height_px / 2)
        angle_offset = pixel_offset_ratio * (fov_v_rad / 2)
        effective_angle = tilt_rad + angle_offset
        if effective_angle <= 0.05:
            return None
        distance_m = camera_height_m / math.tan(effective_angle)
        real_width_at_distance_m = 2 * distance_m * math.tan(fov_h_rad / 2)
        cm_per_pixel = (real_width_at_distance_m * 100) / image_width_px
        return cm_per_pixel, distance_m
    except Exception:
        return None

def process_image_with_yolo(image_bytes, camera_height_m=1.2, tilt_angle_deg=45.0, fov_vertical_deg=45.0, fov_horizontal_deg=60.0, conf_threshold=0.15):
    yolo = get_yolo_model()
    if not yolo:
        raise Exception(f"AI model not loaded from {MODEL_PATH}")

    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        raise Exception("Failed to decode image bytes into image array")
    
    # Run YOLO inference
    results = yolo.predict(img, conf=conf_threshold, verbose=False)
    result = results[0]
    boxes = result.boxes

    pothole_details = []
    annotated_img = img.copy()

    if len(boxes) > 0:
        img_h, img_w = annotated_img.shape[:2]
        for i, box in enumerate(boxes):
            x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
            conf = float(box.conf[0])
            width_px = max(1, x2 - x1)
            center_y = (y1 + y2) / 2
            
            calc_result = calculate_cm_per_pixel(
                camera_height_m, tilt_angle_deg, fov_vertical_deg,
                fov_horizontal_deg, img_h, img_w, center_y
            )
            
            est_dist = round(calc_result[1], 2) if calc_result else None
            est_width = round(width_px * calc_result[0], 1) if calc_result else None

            pothole_id_in_image = i + 1
            pothole_details.append({
                "pothole_id_in_image": pothole_id_in_image,
                "confidence": round(conf, 3),
                "box_pixels": {"x1": x1, "y1": y1, "x2": x2, "y2": y2},
                "estimated_distance_m": est_dist,
                "estimated_width_cm": est_width
            })

            # Draw green bounding box with label
            cv2.rectangle(annotated_img, (x1, y1), (x2, y2), (0, 255, 0), 2)
            label = f"Pothole #{pothole_id_in_image} ({conf*100:.0f}%)"
            (w, h), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 2)
            cv2.rectangle(annotated_img, (x1, max(0, y1 - h - 6)), (x1 + w + 4, y1), (0, 255, 0), -1)
            cv2.putText(annotated_img, label, (x1 + 2, max(12, y1 - 4)), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 0, 0), 2)

    return annotated_img, pothole_details
