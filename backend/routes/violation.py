from fastapi import APIRouter, Depends, HTTPException, Body
from db import get_connection
from security import get_current_user
from datetime import datetime

router = APIRouter()


# Weighted scoring model
VIOLATION_WEIGHTS = {
    "TAB_SWITCH": 1.0,
    "WINDOW_BLUR": 0.5,
    "MOBILE_DETECTED": 5.0,
    "REPEATED_FOCUS_LOSS": 2.0
}


@router.post("/student/violation")
def record_violation(
    exam_id: int = Body(...),
    question_id: int = Body(...),
    violation_type: str = Body(...),
    confidence_score: float = Body(1.0),
    user=Depends(get_current_user),
):
    if user["role"] != "student":
        raise HTTPException(status_code=403, detail="Student access required")

    if violation_type not in VIOLATION_WEIGHTS:
        raise HTTPException(status_code=400, detail="Invalid violation type")

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    try:
        # Ensure attempt is active
        cursor.execute("""
            SELECT attempt_id, status, risk_score
            FROM attempt
            WHERE student_id = %s
            AND exam_id = %s
        """, (user["user_id"], exam_id))

        attempt = cursor.fetchone()

        if not attempt or attempt["status"] != "IN_PROGRESS":
            raise HTTPException(status_code=400, detail="Exam not active")

        # Insert violation
        cursor.execute("""
            INSERT INTO violation (
                student_id,
                exam_id,
                question_id,
                violation_type,
                confidence_score,
                timestamp,
                review_status
            )
            VALUES (%s, %s, %s, %s, %s, %s, 'Pending')
        """, (
            user["user_id"],
            exam_id,
            question_id,
            violation_type,
            confidence_score,
            datetime.now()
        ))

        # Update risk score
        weight = VIOLATION_WEIGHTS[violation_type] * confidence_score
        new_risk_score = attempt["risk_score"] + weight

        cursor.execute("""
            UPDATE attempt
            SET risk_score = %s
            WHERE attempt_id = %s
        """, (new_risk_score, attempt["attempt_id"]))

        conn.commit()

        return {
            "message": "Violation recorded",
            "new_risk_score": new_risk_score
        }

    finally:
        cursor.close()
        conn.close()