from fastapi import APIRouter, Depends, HTTPException
from db import get_connection
from security import get_current_user

router = APIRouter()


# 🔹 1️⃣ GET PENDING RESULTS (Role-Aware)
@router.get("/review/pending")
def get_pending_results(user=Depends(get_current_user)):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    try:
        if user["role"] == "teacher":
            cursor.execute("""
                SELECT r.student_id, r.exam_id, r.total_marks, r.result_status
                FROM result r
                JOIN exam e ON r.exam_id = e.exam_id
                WHERE r.result_status = 'Pending Review'
                AND e.created_by_teacher = %s
            """, (user["user_id"],))

        elif user["role"] == "admin":
            cursor.execute("""
                SELECT r.student_id, r.exam_id, r.total_marks, r.result_status
                FROM result r
                JOIN exam e ON r.exam_id = e.exam_id
                WHERE r.result_status = 'Pending Review'
                AND e.created_by_admin = %s
            """, (user["user_id"],))

        else:
            raise HTTPException(status_code=403, detail="Unauthorized role")

        results = cursor.fetchall()
        return {"pending_results": results}

    finally:
        cursor.close()
        conn.close()


# 🔹 2️⃣ VIEW FLAGGED ANSWERS (Ownership Protected)
@router.get("/review/details")
def review_exam(student_id: int, exam_id: int, user=Depends(get_current_user)):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    try:
        # 🔒 Verify ownership
        cursor.execute("""
            SELECT created_by_teacher, created_by_admin
            FROM exam
            WHERE exam_id = %s
        """, (exam_id,))
        exam = cursor.fetchone()

        if not exam:
            raise HTTPException(status_code=404, detail="Exam not found")

        if user["role"] == "teacher" and exam["created_by_teacher"] != user["user_id"]:
            raise HTTPException(status_code=403, detail="Not your exam")

        if user["role"] == "admin" and exam["created_by_admin"] != user["user_id"]:
            raise HTTPException(status_code=403, detail="Not your exam")

        cursor.execute("""
            SELECT 
                a.question_id,
                q.question_text,
                a.selected_option_id,
                a.evaluation_status,
                v.violation_type,
                v.confidence_score,
                v.timestamp
            FROM answer a
            JOIN question q ON a.question_id = q.question_id
            LEFT JOIN violation v 
                ON v.student_id = a.student_id 
                AND v.exam_id = a.exam_id 
                AND v.question_id = a.question_id
            WHERE a.student_id = %s
            AND a.exam_id = %s
            AND a.evaluation_status = 'PENDING'
        """, (student_id, exam_id))

        flagged_answers = cursor.fetchall()
        return {"flagged_answers": flagged_answers}

    finally:
        cursor.close()
        conn.close()


# 🔹 3️⃣ APPROVE / REJECT ANSWER (Ownership Protected)
@router.post("/review/answer")
def review_answer(
    student_id: int,
    exam_id: int,
    question_id: int,
    decision: str,
    user=Depends(get_current_user),
):
    if decision not in ["APPROVE", "REJECT"]:
        raise HTTPException(status_code=400, detail="Decision must be APPROVE or REJECT")

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    try:
        # 🔒 Verify ownership
        cursor.execute("""
            SELECT created_by_teacher, created_by_admin
            FROM exam
            WHERE exam_id = %s
        """, (exam_id,))
        exam = cursor.fetchone()

        if not exam:
            raise HTTPException(status_code=404, detail="Exam not found")

        if user["role"] == "teacher" and exam["created_by_teacher"] != user["user_id"]:
            raise HTTPException(status_code=403, detail="Not your exam")

        if user["role"] == "admin" and exam["created_by_admin"] != user["user_id"]:
            raise HTTPException(status_code=403, detail="Not your exam")

        if decision == "APPROVE":
            cursor.execute("""
                SELECT qo.is_correct, q.marks
                FROM answer a
                JOIN question_option qo ON a.selected_option_id = qo.option_id
                JOIN question q ON a.question_id = q.question_id
                WHERE a.student_id = %s
                AND a.exam_id = %s
                AND a.question_id = %s
            """, (student_id, exam_id, question_id))

            row = cursor.fetchone()
            marks = row["marks"] if row and row["is_correct"] else 0

            cursor.execute("""
                UPDATE answer
                SET evaluation_status = 'APPROVED',
                    marks_awarded = %s
                WHERE student_id = %s
                AND exam_id = %s
                AND question_id = %s
            """, (marks, student_id, exam_id, question_id))

        else:
            cursor.execute("""
                UPDATE answer
                SET evaluation_status = 'REJECTED',
                    marks_awarded = 0
                WHERE student_id = %s
                AND exam_id = %s
                AND question_id = %s
            """, (student_id, exam_id, question_id))

        conn.commit()
        return {"message": f"Answer {decision.lower()}ed successfully"}

    finally:
        cursor.close()
        conn.close()


# 🔹 4️⃣ FINALIZE RESULT (Ownership Protected)
@router.post("/review/finalize")
def finalize_result(student_id: int, exam_id: int, user=Depends(get_current_user)):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    try:
        # 🔒 Verify ownership
        cursor.execute("""
            SELECT created_by_teacher, created_by_admin
            FROM exam
            WHERE exam_id = %s
        """, (exam_id,))
        exam = cursor.fetchone()

        if not exam:
            raise HTTPException(status_code=404, detail="Exam not found")

        if user["role"] == "teacher" and exam["created_by_teacher"] != user["user_id"]:
            raise HTTPException(status_code=403, detail="Not your exam")

        if user["role"] == "admin" and exam["created_by_admin"] != user["user_id"]:
            raise HTTPException(status_code=403, detail="Not your exam")

        cursor.execute("""
            SELECT COUNT(*) AS pending_count
            FROM answer
            WHERE student_id = %s
            AND exam_id = %s
            AND evaluation_status = 'PENDING'
        """, (student_id, exam_id))

        if cursor.fetchone()["pending_count"] > 0:
            raise HTTPException(status_code=400, detail="Pending answers still exist")

        cursor.execute("""
            SELECT SUM(marks_awarded) AS total
            FROM answer
            WHERE student_id = %s
            AND exam_id = %s
        """, (student_id, exam_id))

        total = cursor.fetchone()["total"] or 0

        cursor.execute("""
            UPDATE result
            SET total_marks = %s,
                result_status = 'Finalized',
                generated_time = NOW()
            WHERE student_id = %s
            AND exam_id = %s
        """, (total, student_id, exam_id))

        conn.commit()

        return {
            "message": "Result finalized successfully",
            "final_total_marks": total
        }

    finally:
        cursor.close()
        conn.close()