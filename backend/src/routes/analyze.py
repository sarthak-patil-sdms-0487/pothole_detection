from fastapi import APIRouter, File, UploadFile, Form
from typing import Optional

from ..controllers import analyze_controller

router = APIRouter()

@router.post("/analyze")
async def analyze_image_route(
    image: UploadFile = File(...),
    detection_method: str = Form("YOLO (best.pt)"),
    user_pothole_count: Optional[int] = Form(None),
    message: Optional[str] = Form(None),
    camera_height_m: Optional[float] = Form(1.2),
    tilt_angle_deg: Optional[float] = Form(45.0),
    fov_vertical_deg: Optional[float] = Form(45.0),
    fov_horizontal_deg: Optional[float] = Form(60.0),
    conf_threshold: Optional[float] = Form(0.35),
    capture_source: Optional[str] = Form("WORKER")
):
    return await analyze_controller.analyze_image(
        image=image,
        detection_method=detection_method,
        user_pothole_count=user_pothole_count,
        message=message,
        camera_height_m=camera_height_m,
        tilt_angle_deg=tilt_angle_deg,
        fov_vertical_deg=fov_vertical_deg,
        fov_horizontal_deg=fov_horizontal_deg,
        conf_threshold=conf_threshold,
        capture_source=capture_source
    )