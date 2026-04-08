import os
import cv2
import boto3
import numpy as np
from datetime import datetime
from collections import defaultdict
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from ultralytics import YOLO
from db import get_connection # Use existing DB utility
from security import get_current_user # Use existing security utility
import mysql.connector

router = APIRouter()

# 1. MODEL & S3 SETUP
try:
    model = YOLO("yolov8n.pt")
except Exception as e:
    print(f"Warning: Could not load YOLOv8 model. Proctoring will be disabled. Error: {e}")
    model = None

COCO_PERSON_CLASS = 0
COCO_PHONE_CLASS = 67

S3_BUCKET = os.getenv("S3_BUCKET_NAME", "exam-proctoring-bucket")
s3_client = boto3.client(
    "s3",
    aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
    aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
    region_name=os.getenv("AWS_REGION", "us-east-1")
)

# 2. TEMPORAL TRACKING STATE (In-Memory)
# WARNING: This is not suitable for multi-worker production environments.
# Consider using Redis or a database for distributed state management.
SESSION_STATES = defaultdict(lambda: {
    "phone": 0,
    "multi_person": 0,
    "no_person": 0
})

# 3. DATABASE & S3 HELPERS
def upload_to_s3(image_bytes: bytes, exam_id: int, student_id: int, v_type: str) -> str:
    timestamp = datetime.now().strftime("%Y-%m-%dT%H-%M-%S")
    key = f"{exam_id}/{student_id}/{v_type}/{timestamp}.jpg"
    
    try:
        s3_client.put_object(
            Bucket=S3_BUCKET,
            Key=key,
            Body=image_bytes,
            ContentType="image/jpeg"
        )
        # Return a presigned URL for immediate access if needed
        return s3_client.generate_presigned_url(
            'get_object',
            Params={'Bucket': S3_BUCKET, 'Key': key},
            ExpiresIn=3600  # URL valid for 1 hour
        )
    except Exception as e:
        print(f"S3 Upload Failed: {e}")
        return None

def log_violation_and_evidence(
    exam_id: int, 
    student_id: int, 
    v_type: str, 
    duration: int, 
    image_bytes: bytes = None,
    confidence: float = 0.9
):
    conn = get_connection()
    cursor = conn.cursor()
    try:
        # Insert into violation table
        v_query = """
            INSERT INTO violation (exam_id, student_id, violation_type, detected_at, review_status, confidence_score)
            VALUES (%s, %s, %s, %s, %s, %s)
        """
        v_params = (exam_id, student_id, v_type, datetime.now(), 'Pending', confidence)
        cursor.execute(v_query, v_params)
        violation_id = cursor.lastrowid

        # If there's an image, upload to S3 and log to evidence table
        if image_bytes:
            image_url = upload_to_s3(image_bytes, exam_id, student_id, v_type)
            if image_url:
                e_query = """
                    INSERT INTO evidence (violation_id, camera_image_path, captured_time)
                    VALUES (%s, %s, %s)
                """
                e_params = (violation_id, image_url, datetime.now())
                cursor.execute(e_query, e_params)
        
        conn.commit()
    except mysql.connector.Error as err:
        conn.rollback()
        print(f"DB Logging Failed: {err}")
    finally:
        cursor.close()
        conn.close()

# 4. DETECTION FUNCTION
def process_frame(image_bytes: bytes):
    if not model:
        return 0, False, None

    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    img = cv2.resize(img, (640, 480))
    
    results = model(img, verbose=False)[0]
    
    person_count = 0
    phone_detected = False
    
    for box in results.boxes:
        cls_id = int(box.cls[0])
        if cls_id == COCO_PERSON_CLASS:
            person_count += 1
        elif cls_id == COCO_PHONE_CLASS:
            phone_detected = True
            
    _, encoded_img = cv2.imencode('.jpg', img, [int(cv2.IMWRITE_JPEG_QUALITY), 70])
    compressed_bytes = encoded_img.tobytes()
    
    return person_count, phone_detected, compressed_bytes

# 5. MAIN API ENDPOINT
@router.post("/proctor/detect")
def detect_violation(
    exam_id: int = Form(...),
    student_id: int = Form(...),
    exam_mode: str = Form(...),
    event_type: str = Form("FRAME"),
    image: UploadFile = File(None),
    user: dict = Depends(get_current_user)
):
    if user['role'] != 'student' or user['user_id'] != student_id:
        raise HTTPException(status_code=403, detail="Unauthorized: You can only submit proctoring data for yourself.")

    session_key = (exam_id, student_id)
    state = SESSION_STATES[session_key]
    
    response = {"person_count": -1, "phone_detected": False, "violations": [], "terminate": False}

    if exam_mode == "CENTER":
        if event_type in ["TAB_SWITCH", "FOCUS_LOSS"]:
            log_violation_and_evidence(exam_id, student_id, event_type, 0, None, confidence=1.0)
            response["violations"].append(event_type)
        return response

    if exam_mode == "ONLINE":
        if not image: raise HTTPException(status_code=400, detail="Webcam frame required for ONLINE exams")
        image_bytes = image.read()

        if event_type in ["TAB_SWITCH", "FOCUS_LOSS"]:
            log_violation_and_evidence(exam_id, student_id, event_type, 0, image_bytes, confidence=1.0)
            response["violations"].append(event_type)

        person_count, phone_detected, compressed_img = process_frame(image_bytes)
        response.update({"person_count": person_count, "phone_detected": phone_detected})

        state["phone"] = state["phone"] + 1 if phone_detected else 0
        state["multi_person"] = state["multi_person"] + 1 if person_count > 1 else 0
        state["no_person"] = state["no_person"] + 1 if person_count == 0 else 0

        def handle_violation(v_type: str, time_count: int):
            if time_count == 3:
                log_violation_and_evidence(exam_id, student_id, v_type, time_count, compressed_img)
                response["violations"].append(v_type)
            elif time_count > 3:
                response["violations"].append(v_type)
            if time_count >= 10:
                response["terminate"] = True

        handle_violation("PHONE", state["phone"])
        handle_violation("MULTI_PERSON", state["multi_person"])
        handle_violation("NO_PERSON", state["no_person"])
        return response

    raise HTTPException(status_code=400, detail="Invalid exam_mode specified.")