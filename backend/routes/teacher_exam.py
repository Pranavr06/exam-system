from fastapi import APIRouter, Depends, HTTPException, Body
from db import get_connection
from security import get_current_user
import mysql.connector

router = APIRouter()


@router.post("/teacher/exams/create")
def create_teacher_exam(
    exam_name: str = Body(...),
    subject_id: int = Body(...),
    duration: int = Body(...),
    user=Depends(get_current_user),
):
    # 🔒 role guard
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Teacher access required")

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    try:
        # ✅ get teacher department
        cursor.execute(
            "SELECT department_id FROM teacher WHERE teacher_id = %s",
            (user["user_id"],),
        )
        teacher_row = cursor.fetchone()

        if not teacher_row or not teacher_row["department_id"]:
            raise HTTPException(
                status_code=400,
                detail="Teacher not mapped to department"
            )

        department_id = teacher_row["department_id"]

        # ✅ verify subject belongs to same department
        cursor.execute(
            "SELECT department_id FROM subject WHERE subject_id = %s",
            (subject_id,),
        )
        subject_row = cursor.fetchone()

        if not subject_row:
            raise HTTPException(status_code=404, detail="Subject not found")

        if subject_row["department_id"] != department_id:
            raise HTTPException(
                status_code=403,
                detail="Cannot create exam for another department",
            )

        # 🚨 DUPLICATE CHECK (backend layer)
        cursor.execute(
            """
            SELECT exam_id FROM exam
            WHERE exam_name = %s
            AND subject_id = %s
            AND created_by_teacher = %s
            """,
            (exam_name, subject_id, user["user_id"]),
        )

        if cursor.fetchone():
            raise HTTPException(
                status_code=400,
                detail="Exam with same name already exists for this subject",
            )

        # ✅ insert exam
        insert_query = """
            INSERT INTO exam (
                exam_name,
                subject_id,
                date,
                duration,
                status,
                created_by_admin,
                created_by_teacher,
                department_id,
                exam_scope
            )
            VALUES (%s, %s, NOW(), %s, 'scheduled', NULL, %s, %s, 'SECTION')
        """

        cursor.execute(
            insert_query,
            (
                exam_name,
                subject_id,
                duration,
                user["user_id"],
                department_id,
            ),
        )
        conn.commit()

        return {"message": "Teacher exam created successfully"}

    except mysql.connector.IntegrityError:
        # 🛡️ DB-level safety net
        raise HTTPException(
            status_code=400,
            detail="Duplicate exam prevented by database constraint",
        )

    finally:
        cursor.close()
        conn.close()