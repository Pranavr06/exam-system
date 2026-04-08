import os
from dotenv import load_dotenv

# Explicitly find the .env file in the backend folder
ENV_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.env')
load_dotenv(ENV_PATH)

import cv2
import numpy as np
from datetime import datetime
from typing import Optional
from collections import defaultdict
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from ultralytics import YOLO
from db import get_connection # Use existing DB utility
from security import get_current_user # Use existing security utility
import mysql.connector
from supabase import create_client, Client

router = APIRouter()

# 1. MODEL & STORAGE SETUP
try:
    model = YOLO("yolov8n.pt")
except Exception as e:
    print(f"Warning: Could not load YOLOv8 model. Proctoring will be disabled. Error: {e}")
    model = None

COCO_PERSON_CLASS = 0
COCO_PHONE_CLASS = 67

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
SUPABASE_BUCKET = os.getenv("SUPABASE_BUCKET_NAME", "exam-proctoring-bucket")

supabase_client: Client = None
if SUPABASE_URL and SUPABASE_KEY:
    supabase_client = create_client(SUPABASE_URL, SUPABASE_KEY)
    print("✅ Supabase successfully connected for Proctoring!")
else:
    print("Warning: Supabase credentials missing. Screenshots will not be uploaded.")

# 2. TEMPORAL TRACKING STATE (In-Memory)
# WARNING: This is not suitable for multi-worker production environments.
# Consider using Redis or a database for distributed state management.
SESSION_STATES = defaultdict(lambda: {
    "phone": 0,
    "multi_person": 0,
    "no_person": 0
})

# 3. DATABASE & STORAGE HELPERS
def upload_to_supabase(image_bytes: bytes, exam_id: int, student_id: int, v_type: str, prefix: str = "img") -> str:
    global supabase_client
    
    # Late initialization just in case env variables were loaded late
    if not supabase_client:
        load_dotenv(ENV_PATH) # Force reload
        s_url = os.getenv("SUPABASE_URL")
        s_key = os.getenv("SUPABASE_KEY")
        if s_url and s_key:
            supabase_client = create_client(s_url, s_key)
            print("✅ Supabase late-initialized successfully!")
        else:
            print("\n" + "="*50)
            print(f"❌ UPLOAD SKIPPED: Missing Supabase credentials!")
            print(f"Could not find SUPABASE_URL or SUPABASE_KEY in: {ENV_PATH}")
            print("="*50 + "\n")
            return None
    
    # Added %f (microseconds) to prevent overlapping filenames if multiple violations happen in the same second
    timestamp = datetime.now().strftime("%Y-%m-%dT%H-%M-%S-%f")
    key = f"{exam_id}/{student_id}/{v_type}/{prefix}_{timestamp}.jpg"
    
    try:
        # Using positional arguments for safer compatibility with the Supabase Python library
        supabase_client.storage.from_(SUPABASE_BUCKET).upload(
            key,
            image_bytes,
            {"content-type": "image/jpeg"}
        )
        
        # Return the public URL to store in the database
        return supabase_client.storage.from_(SUPABASE_BUCKET).get_public_url(key)
    except Exception as e:
        print("\n" + "="*50)
        print(f"❌ SUPABASE UPLOAD FAILED: {e}")
        print("-> If 'AuthApiError' or '403': You are using the 'anon' key. Use the 'service_role' secret key.")
        print("-> If 'Bucket not found': Ensure your bucket is named exactly 'exam-proctoring-bucket'")
        print("="*50 + "\n")
        return None

def log_violation_and_evidence(
    exam_id: int, 
    student_id: int, 
    v_type: str, 
    duration: int, 
    image_bytes: bytes = None,
    evidence_bytes: bytes = None,
    confidence: float = 0.9,
    question_id: int = None
):
    conn = get_connection()
    cursor = conn.cursor()
    try:
        # Insert into violation table
        v_query = """
            INSERT INTO violation (exam_id, student_id, violation_type, detected_at, review_status, confidence_score, question_id)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
        """
        v_params = (exam_id, student_id, v_type, datetime.now(), 'Pending', confidence, question_id)
        cursor.execute(v_query, v_params)
        violation_id = cursor.lastrowid

        # If there's an image, upload to Supabase and log to evidence table separating webcam and screen
        webcam_url = None
        screen_url = None
        if image_bytes:
            webcam_url = upload_to_supabase(image_bytes, exam_id, student_id, v_type, "webcam")
        if evidence_bytes:
            screen_url = upload_to_supabase(evidence_bytes, exam_id, student_id, v_type, "screen")
            
        if webcam_url or screen_url:
            e_query = """
                INSERT INTO evidence (violation_id, camera_image_path, screenshot_path, captured_time)
                VALUES (%s, %s, %s, %s)
            """
            e_params = (violation_id, webcam_url, screen_url, datetime.now())
            cursor.execute(e_query, e_params)
        
        conn.commit()
    except mysql.connector.Error as err:
        conn.rollback()
        print(f"❌ DB Logging Failed for violation '{v_type}': {err}")
    finally:
        cursor.close()
        conn.close()

# 4. DETECTION FUNCTION
def process_frame(image_bytes: bytes):
    if not model:
        return 0, False

    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None or img.size == 0:
        return 0, False
        
    img = cv2.resize(img, (640, 480))
    
    results = model(img, verbose=False)[0]
    
    person_count = 0
    phone_detected = False
    
    for box in results.boxes:
        cls_id = int(box.cls[0])
        conf = float(box.conf[0])
        
        # Much more lenient person detection (0.40) to stop false "Face not detected"
        if cls_id == COCO_PERSON_CLASS and conf >= 0.40:
            person_count += 1
            
        # Strict phone detection (0.15) to aggressively catch mobiles
        elif cls_id == COCO_PHONE_CLASS and conf >= 0.15:
            phone_detected = True
            
    return person_count, phone_detected

# 5. MAIN API ENDPOINT
@router.post("/proctor/detect")
async def detect_violation(
    exam_id: int = Form(...),
    student_id: int = Form(...),
    exam_mode: str = Form(...),
    event_type: str = Form("FRAME"),
    question_id: Optional[int] = Form(None),
    image: Optional[UploadFile] = File(None),
    evidence_image: Optional[UploadFile] = File(None),
    user: dict = Depends(get_current_user)
):
    if user['role'] != 'student' or user['user_id'] != student_id:
        raise HTTPException(status_code=403, detail="Unauthorized: You can only submit proctoring data for yourself.")

    session_key = (exam_id, student_id)
    state = SESSION_STATES[session_key]
    
    response = {"person_count": -1, "phone_detected": False, "violations": [], "terminate": False}

    if exam_mode == "CENTER":
        evidence_bytes = await evidence_image.read() if evidence_image else None
        if event_type == "TAB_SWITCH":
            log_violation_and_evidence(exam_id, student_id, event_type, 0, None, evidence_bytes, confidence=1.0, question_id=question_id)
            response["violations"].append(event_type)
        return response

    if exam_mode == "ONLINE":
        if not image: raise HTTPException(status_code=400, detail="Webcam frame required for ONLINE exams")
        image_bytes = await image.read()
        evidence_bytes = await evidence_image.read() if evidence_image else None

        # EARLY RETURN FOR TAB SWITCH: Do not run AI on this frame to prevent double-upload crashes
        if event_type == "TAB_SWITCH":
            log_violation_and_evidence(exam_id, student_id, event_type, 0, image_bytes, evidence_bytes, confidence=1.0, question_id=question_id)
            response["violations"].append(event_type)
            return response

        # Process AI Frame
        person_count, phone_detected = process_frame(image_bytes)

        response.update({"person_count": person_count, "phone_detected": phone_detected})

        state["phone"] = state["phone"] + 1 if phone_detected else 0
        state["multi_person"] = state["multi_person"] + 1 if person_count > 1 else 0
        state["no_person"] = state["no_person"] + 1 if person_count == 0 else 0

        def handle_violation(v_type: str, time_count: int):
            # Strict capture: Take evidence exactly on 1st second, and then every 3 seconds to guarantee storage
            if time_count == 1 or (time_count > 1 and time_count % 3 == 0): 
                log_violation_and_evidence(exam_id, student_id, v_type, time_count, image_bytes, evidence_bytes, question_id=question_id)
                response["violations"].append(v_type)
            elif time_count > 1:
                response["violations"].append(v_type)
            if time_count >= 15: # Terminate after 15 straight seconds
                response["terminate"] = True

        if state["phone"] > 0: handle_violation("MOBILE_DETECTED", state["phone"])
        if state["multi_person"] > 0: handle_violation("MULTI_PERSON", state["multi_person"])
        if state["no_person"] > 0: handle_violation("FOCUS_LOSS", state["no_person"])
        
        return response

    raise HTTPException(status_code=400, detail="Invalid exam_mode specified.")