from fastapi import File, UploadFile, Form, HTTPException
from fastapi.responses import JSONResponse
from typing import Optional
import uuid
from io import BytesIO
import numpy as np
import cv2
from PIL import Image
import json

from ..services import yolo_service, gemini_service, s3_service

async def analyze_image(
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
    # Set default values if not provided
    camera_height_m = camera_height_m or 1.2
    tilt_angle_deg = tilt_angle_deg or 45.0
    fov_vertical_deg = fov_vertical_deg or 45.0
    fov_horizontal_deg = fov_horizontal_deg or 60.0
    conf_threshold = conf_threshold or 0.35
    capture_source = capture_source or "WORKER"

    if detection_method == "YOLO (best.pt)":
        response = await analyze_image_yolo(
            image=image,
            camera_height_m=camera_height_m,
            tilt_angle_deg=tilt_angle_deg,
            fov_vertical_deg=fov_vertical_deg,
            fov_horizontal_deg=fov_horizontal_deg,
            conf_threshold=conf_threshold,
            message=message
        )
    elif detection_method == "LLM - Gemini":
        response = await analyze_image_gemini(image=image, message=message)
    else:
        raise HTTPException(status_code=400, detail=f"Invalid detection method: {detection_method}")
    
    response_content = response.body.decode('utf-8')
    response_data = json.loads(response_content)
    response_data['detection_method'] = detection_method
    response_data['user_pothole_count'] = user_pothole_count
    response_data['capture_source'] = capture_source
    return JSONResponse(content=response_data)


async def analyze_image_yolo(
    image: UploadFile,
    camera_height_m: float,
    tilt_angle_deg: float,
    fov_vertical_deg: float,
    fov_horizontal_deg: float,
    conf_threshold: float,
    message: Optional[str]
):
    image_bytes = await image.read()
    analysis_id = str(uuid.uuid4())
    
    original_filename = f"analysis/{analysis_id}_original.jpg"
    original_s3_url = s3_service.upload_file_obj_to_s3(BytesIO(image_bytes), original_filename)
    if not original_s3_url:
        # Fallback to local data URI or placeholder if S3 credentials are not configured
        import base64
        b64 = base64.b64encode(image_bytes).decode("utf-8")
        original_s3_url = f"data:image/jpeg;base64,{b64}"

    annotated_img, pothole_details = yolo_service.process_image_with_yolo(
        image_bytes,
        camera_height_m,
        tilt_angle_deg,
        fov_vertical_deg,
        fov_horizontal_deg,
        conf_threshold
    )

    annotated_s3_url = original_s3_url
    if pothole_details:
        is_success, buffer = cv2.imencode(".jpg", annotated_img)
        if is_success:
            annotated_filename = f"analysis/{analysis_id}_annotated.jpg"
            uploaded_url = s3_service.upload_file_obj_to_s3(BytesIO(buffer), annotated_filename)
            if uploaded_url:
                annotated_s3_url = uploaded_url
            else:
                import base64
                b64 = base64.b64encode(buffer.tobytes()).decode("utf-8")
                annotated_s3_url = f"data:image/jpeg;base64,{b64}"

    camera_params = {
        "camera_height_m": camera_height_m,
        "tilt_angle_deg": tilt_angle_deg,
        "fov_vertical_deg": fov_vertical_deg,
        "fov_horizontal_deg": fov_horizontal_deg
    }

    return JSONResponse(content={
        "original_image_url": original_s3_url,
        "annotated_image_url": annotated_s3_url,
        "camera_params": camera_params,
        "pothole_details": pothole_details,
        "message": message
    })

async def analyze_image_gemini(
    image: UploadFile,
    message: Optional[str]
):
    image_bytes = await image.read()
    analysis_id = str(uuid.uuid4())
    
    original_filename = f"analysis/{analysis_id}_original.jpg"
    original_s3_url = s3_service.upload_file_obj_to_s3(BytesIO(image_bytes), original_filename)
    if not original_s3_url:
        import base64
        b64 = base64.b64encode(image_bytes).decode("utf-8")
        original_s3_url = f"data:image/jpeg;base64,{b64}"

    pil_image = Image.open(BytesIO(image_bytes)).convert("RGB")
    
    predictions, error = gemini_service.detect_with_gemini(pil_image)
    if error:
        raise HTTPException(status_code=500, detail=f"Gemini detection error: {error}")

    pothole_details = []
    img_array = np.array(pil_image)
    annotated_img = img_array.copy()
    annotated_s3_url = original_s3_url

    if len(predictions) > 0:
        img_h, img_w = annotated_img.shape[:2]
        for i, p in enumerate(predictions):
            y1n, x1n, y2n, x2n = p["box_2d"]
            x1 = int((x1n / 1000) * img_w)
            y1 = int((y1n / 1000) * img_h)
            x2 = int((x2n / 1000) * img_w)
            y2 = int((y2n / 1000) * img_h)
            
            pothole_id_in_image = i + 1
            pothole_details.append({
                "pothole_id_in_image": pothole_id_in_image,
                "confidence": p.get("confidence", None),
                "box_pixels": {"x1": x1, "y1": y1, "x2": x2, "y2": y2},
                "size_category": p.get("size_category", "unknown"),
                "estimated_width_cm_range": p.get("estimated_width_cm_range", "N/A"),
            })

            cv2.rectangle(annotated_img, (x1, y1), (x2, y2), (0, 255, 0), 2)
            label = f"Pothole #{pothole_id_in_image}"
            (w, h), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 2)
            cv2.rectangle(annotated_img, (x1, y1 - h - 5), (x1 + w, y1), (0, 255, 0), -1)
            cv2.putText(annotated_img, label, (x1, y1 - 5), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 2)

        is_success, buffer = cv2.imencode(".jpg", annotated_img)
        if is_success:
            annotated_filename = f"analysis/{analysis_id}_annotated.jpg"
            uploaded_url = s3_service.upload_file_obj_to_s3(BytesIO(buffer), annotated_filename)
            if uploaded_url:
                annotated_s3_url = uploaded_url
            else:
                import base64
                b64 = base64.b64encode(buffer.tobytes()).decode("utf-8")
                annotated_s3_url = f"data:image/jpeg;base64,{b64}"

    return JSONResponse(content={
        "original_image_url": original_s3_url,
        "annotated_image_url": annotated_s3_url,
        "pothole_details": pothole_details,
        "message": message
    })
