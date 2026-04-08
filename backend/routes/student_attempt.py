from fastapi import APIRouter, Depends, HTTPException, Body
from db import get_connection
from security import get_current_user
from passlib.context import CryptContext
from datetime import datetime, timedelta

router = APIRouter()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

RISK_THRESHOLD = 5.0


# 🔥 INTERNAL AUTO FINALIZER
def auto_finalize_if_expired(cursor, student_id, exam_id):
    cursor.execute("""
        SELECT a.attempt_id, a.start_time, a.status, a.risk_score, e.duration
        FROM attempt a
        JOIN exam e ON a.exam_id = e.exam_id
        WHERE a.student_id = %s AND a.exam_id = %s
    """, (student_id, exam_id))

    attempt = cursor.fetchone()

    if not attempt:
        return None

    if attempt["status"] != "IN_PROGRESS":
        return None

    end_time_allowed = attempt["start_time"] + timedelta(minutes=attempt["duration"])

    if datetime.now() <= end_time_allowed:
        return None  # still valid

    # 🔥 AUTO COMPLETE ATTEMPT
    cursor.execute("""
        UPDATE attempt
        SET status = 'COMPLETED', end_time = NOW()
        WHERE attempt_id = %s
    """, (attempt["attempt_id"],))

    # Check pending answers
    cursor.execute("""
        SELECT COUNT(*) AS pending_count
        FROM answer
        WHERE student_id = %s
        AND exam_id = %s
        AND evaluation_status = 'PENDING'
    """, (student_id, exam_id))

    has_pending = cursor.fetchone()["pending_count"] > 0
    high_risk = attempt["risk_score"] >= RISK_THRESHOLD

    # Calculate total
    cursor.execute("""
        SELECT SUM(marks_awarded) AS total
        FROM answer
        WHERE student_id = %s AND exam_id = %s
    """, (student_id, exam_id))

    total = cursor.fetchone()["total"] or 0

    result_status = "Pending Review" if (has_pending or high_risk) else "Finalized"

    cursor.execute("""
        INSERT INTO result (student_id, exam_id, total_marks, result_status, generated_time)
        VALUES (%s, %s, %s, %s, NOW())
        ON DUPLICATE KEY UPDATE
            total_marks = VALUES(total_marks),
            result_status = VALUES(result_status),
            generated_time = NOW()
    """, (student_id, exam_id, total, result_status))

    return {
        "auto_submitted": True,
        "total_marks": total,
        "risk_score": attempt["risk_score"],
        "result_status": result_status
    }


# 🚀 START EXAM
@router.post("/student/exams/start")
def start_exam(exam_id: int = Body(...), password: str = Body(None), user=Depends(get_current_user)):
    if user["role"] != "student":
        raise HTTPException(status_code=403)

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    try:
        # Check exam mode and password if provided
        cursor.execute("SELECT mode, password_hash as exam_password, status, date, duration FROM exam WHERE exam_id = %s", (exam_id,))
        exam = cursor.fetchone()
        if not exam:
            raise HTTPException(status_code=404, detail="Exam not found")

        exam_start_time = exam['date']
        exam_end_time = exam['date'] + timedelta(minutes=exam['duration'])
        now = datetime.now()

        # Check time window first
        if now < exam_start_time:
            raise HTTPException(status_code=403, detail="Exam has not started yet.")
        if now > exam_end_time:
            raise HTTPException(status_code=403, detail="Exam has already ended.")

        # Now that we are in the window, check status.
        if exam['status'] not in ['active', 'scheduled']:
            raise HTTPException(status_code=403, detail=f"Exam is not available to start (status: {exam['status']}).")

        if exam['mode'] == 'CENTER':
            if not password:
                raise HTTPException(status_code=400, detail="Password is required for this exam.")
            if not exam['exam_password'] or not pwd_context.verify(password.strip(), exam['exam_password']):
                raise HTTPException(status_code=403, detail="Incorrect exam password.")

        # Check if attempt exists to handle resume
        cursor.execute("SELECT attempt_id FROM attempt WHERE student_id = %s AND exam_id = %s", (user['user_id'], exam_id))
        if cursor.fetchone():
             # It's a resume, no action needed as they will be redirected to the exam page
             pass
        else:
            # It's a new start
            cursor.execute(
                "INSERT INTO attempt (student_id, exam_id, status) VALUES (%s, %s, 'IN_PROGRESS')",
                (user["user_id"], exam_id),
            )

        conn.commit()
        return {"message": "Exam started successfully"}

    finally:
        cursor.close()
        conn.close()

# 🚀 FETCH QUESTIONS
@router.get("/student/exams/questions")
def get_exam_questions(exam_id: int, user=Depends(get_current_user)):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    try:
        expired = auto_finalize_if_expired(cursor, user["user_id"], exam_id)

        if expired:
            conn.commit()
            return {
                "message": "Exam auto-submitted due to timeout",
                **expired
            }

        cursor.execute("""
            SELECT a.status, a.start_time, e.duration, e.exam_name, e.mode
            FROM attempt a
            JOIN exam e ON a.exam_id = e.exam_id
            WHERE a.student_id = %s AND a.exam_id = %s
        """, (user["user_id"], exam_id))

        attempt = cursor.fetchone()

        if not attempt or attempt["status"] != "IN_PROGRESS":
            raise HTTPException(status_code=403, detail="Exam not active")

        # Calculate remaining time
        end_time = attempt["start_time"] + timedelta(minutes=attempt["duration"])
        remaining_seconds = (end_time - datetime.now()).total_seconds()
        if remaining_seconds < 0: remaining_seconds = 0

        cursor.execute("""
            SELECT q.question_id, q.question_text, q.marks,
                   o.option_id, o.option_text
            FROM question q
            JOIN question_option o ON q.question_id = o.question_id
            WHERE q.exam_id = %s
            ORDER BY q.question_id
        """, (exam_id,))

        rows = cursor.fetchall()

        questions = {}
        for row in rows:
            qid = row["question_id"]
            if qid not in questions:
                questions[qid] = {
                    "question_id": qid,
                    "question_text": row["question_text"],
                    "marks": row["marks"],
                    "options": [],
                }
            questions[qid]["options"].append({
                "option_id": row["option_id"],
                "option_text": row["option_text"]
            })

        return {
            "questions": list(questions.values()),
            "remaining_seconds": remaining_seconds,
            "exam_name": attempt["exam_name"],
            "exam_mode": attempt["mode"],
            "student_id": user["user_id"]
        }

    finally:
        cursor.close()
        conn.close()


# 🚀 SUBMIT ANSWER
@router.post("/student/exams/submit-answer")
def submit_answer(
    exam_id: int = Body(...),
    question_id: int = Body(...),
    selected_option_id: int = Body(...),
    user=Depends(get_current_user),
):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    try:
        expired = auto_finalize_if_expired(cursor, user["user_id"], exam_id)

        if expired:
            conn.commit()
            raise HTTPException(
                status_code=403,
                detail="Exam auto-submitted due to timeout"
            )

        cursor.execute("""
            SELECT status FROM attempt
            WHERE student_id = %s AND exam_id = %s
        """, (user["user_id"], exam_id))

        attempt = cursor.fetchone()

        if not attempt or attempt["status"] != "IN_PROGRESS":
            raise HTTPException(status_code=403, detail="Exam not active")

        cursor.execute("""
            SELECT is_correct FROM question_option
            WHERE option_id = %s AND question_id = %s
        """, (selected_option_id, question_id))

        option = cursor.fetchone()
        if not option:
            raise HTTPException(status_code=400)

        cursor.execute("""
            SELECT marks FROM question WHERE question_id = %s
        """, (question_id,))

        question = cursor.fetchone()

        marks_awarded = question["marks"] if option["is_correct"] else 0

        cursor.execute("""
            INSERT INTO answer (
                student_id, exam_id, question_id,
                selected_option_id, evaluation_status, marks_awarded
            )
            VALUES (%s, %s, %s, %s, 'NORMAL', %s)
            ON DUPLICATE KEY UPDATE
                selected_option_id = VALUES(selected_option_id),
                marks_awarded = VALUES(marks_awarded)
        """, (
            user["user_id"],
            exam_id,
            question_id,
            selected_option_id,
            marks_awarded
        ))

        conn.commit()
        return {"message": "Answer submitted"}

    finally:
        cursor.close()
        conn.close()


# 🚀 MANUAL FINISH
@router.post("/student/exams/finish")
def finish_exam(exam_id: int = Body(..., embed=True), user=Depends(get_current_user)):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    try:
        cursor.execute("""
            SELECT attempt_id, status, risk_score
            FROM attempt
            WHERE student_id = %s AND exam_id = %s
        """, (user["user_id"], exam_id))

        attempt = cursor.fetchone()

        if not attempt or attempt["status"] != "IN_PROGRESS":
            raise HTTPException(status_code=400, detail="Exam not active")

        cursor.execute("""
            UPDATE attempt
            SET status = 'COMPLETED', end_time = NOW()
            WHERE attempt_id = %s
        """, (attempt["attempt_id"],))

        cursor.execute("""
            SELECT COUNT(*) AS pending_count
            FROM answer
            WHERE student_id = %s AND exam_id = %s
            AND evaluation_status = 'PENDING'
        """, (user["user_id"], exam_id))

        has_pending = cursor.fetchone()["pending_count"] > 0
        high_risk = attempt["risk_score"] >= RISK_THRESHOLD

        cursor.execute("""
            SELECT SUM(marks_awarded) AS total
            FROM answer
            WHERE student_id = %s AND exam_id = %s
        """, (user["user_id"], exam_id))

        total = cursor.fetchone()["total"] or 0

        result_status = "Pending Review" if (has_pending or high_risk) else "Finalized"

        cursor.execute("""
            INSERT INTO result (student_id, exam_id, total_marks, result_status, generated_time)
            VALUES (%s, %s, %s, %s, NOW())
            ON DUPLICATE KEY UPDATE
                total_marks = VALUES(total_marks),
                result_status = VALUES(result_status),
                generated_time = NOW()
        """, (user["user_id"], exam_id, total, result_status))

        conn.commit()

        return {
            "message": "Exam submitted",
            "total_marks": total,
            "risk_score": attempt["risk_score"],
            "result_status": result_status
        }

    finally:
        cursor.close()
        conn.close()