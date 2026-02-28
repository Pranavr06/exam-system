from fastapi import APIRouter, Depends, HTTPException, Body
from db import get_connection
from security import get_current_user
import mysql.connector

router = APIRouter()


@router.post("/exams/assign-section")
def assign_exam_to_section(
    exam_id: int = Body(...),
    section_id: int = Body(...),
    user=Depends(get_current_user),
):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    try:
        # 🔍 get exam
        cursor.execute(
            "SELECT department_id, created_by_teacher, created_by_admin FROM exam WHERE exam_id = %s",
            (exam_id,),
        )
        exam = cursor.fetchone()

        if not exam:
            raise HTTPException(status_code=404, detail="Exam not found")

        # 🔍 get section
        cursor.execute(
            "SELECT department_id FROM section WHERE section_id = %s",
            (section_id,),
        )
        section = cursor.fetchone()

        if not section:
            raise HTTPException(status_code=404, detail="Section not found")

        # 🚫 department mismatch guard
        if exam["department_id"] != section["department_id"]:
            raise HTTPException(
                status_code=403,
                detail="Exam and section belong to different departments",
            )

        # 🔒 role ownership guard
        if user["role"] == "teacher":
            if exam["created_by_teacher"] != user["user_id"]:
                raise HTTPException(
                    status_code=403,
                    detail="Teachers can assign only their own exams",
                )
            assigned_by_teacher = user["user_id"]
            assigned_by_admin = None

        elif user["role"] == "admin":
            assigned_by_teacher = None
            assigned_by_admin = user["user_id"]

        else:
            raise HTTPException(status_code=403, detail="Unauthorized role")

        # 🚨 duplicate protection
        cursor.execute(
            "SELECT id FROM exam_section WHERE exam_id = %s AND section_id = %s",
            (exam_id, section_id),
        )
        if cursor.fetchone():
            raise HTTPException(
                status_code=400,
                detail="Exam already assigned to this section",
            )

        # ✅ insert mapping
        cursor.execute(
            """
            INSERT INTO exam_section (
                exam_id,
                section_id,
                assigned_by_teacher,
                assigned_by_admin
            )
            VALUES (%s, %s, %s, %s)
            """,
            (exam_id, section_id, assigned_by_teacher, assigned_by_admin),
        )

        conn.commit()
        return {"message": "Exam assigned to section successfully"}

    except mysql.connector.IntegrityError:
        raise HTTPException(
            status_code=400,
            detail="Duplicate assignment prevented by database constraint",
        )

    finally:
        cursor.close()
        conn.close()


@router.delete("/exams/{exam_id}/sections/{section_id}")
def unassign_exam_from_section(
    exam_id: int,
    section_id: int,
    user=Depends(get_current_user),
):
    # 🔒 Role check
    if user["role"] not in ["admin", "teacher"]:
        raise HTTPException(status_code=403, detail="Unauthorized role")

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    try:
        # 🔒 Ownership check
        cursor.execute(
            "SELECT created_by_admin, created_by_teacher FROM exam WHERE exam_id = %s",
            (exam_id,)
        )
        exam = cursor.fetchone()
        if not exam:
            raise HTTPException(status_code=404, detail="Exam not found")

        if user["role"] == "teacher" and exam["created_by_teacher"] != user["user_id"]:
            raise HTTPException(status_code=403, detail="Teachers can only modify their own exam assignments")

        # ✅ Perform deletion
        cursor.execute(
            "DELETE FROM exam_section WHERE exam_id = %s AND section_id = %s",
            (exam_id, section_id)
        )
        
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Assignment not found")

        conn.commit()
        return {"message": "Section unassigned from exam successfully"}
    finally:
        cursor.close()
        conn.close()