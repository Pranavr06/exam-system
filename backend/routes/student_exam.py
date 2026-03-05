from fastapi import APIRouter, Depends, HTTPException
from db import get_connection
from security import get_current_user

router = APIRouter()


@router.get("/student/profile")
def get_student_profile(user=Depends(get_current_user)):
    if user["role"] != "student":
        raise HTTPException(status_code=403, detail="Access denied")
    
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("""
            SELECT s.name, s.email, s.usn, s.semester, sec.section_name, d.department_name
            FROM student s
            JOIN department d ON s.department_id = d.department_id
            LEFT JOIN section sec ON s.section_id = sec.section_id
            WHERE s.student_id = %s
        """, (user["user_id"],))
        profile = cursor.fetchone()
        if not profile:
            raise HTTPException(status_code=404, detail="Profile not found")
        return profile
    finally:
        cursor.close()
        conn.close()

@router.get("/student/exams")
def get_student_exams(user=Depends(get_current_user)):
    # 🔒 Role guard
    if user["role"] != "student":
        raise HTTPException(status_code=403, detail="Student access required")

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    try:
        # 🔍 Get student's section
        cursor.execute(
            "SELECT section_id FROM student WHERE student_id = %s",
            (user["user_id"],),
        )
        student = cursor.fetchone()

        if not student or not student["section_id"]:
            raise HTTPException(
                status_code=400,
                detail="Student not assigned to any section",
            )

        section_id = student["section_id"]

        # 🔍 Fetch exams assigned to that section
        cursor.execute(
            """
            SELECT e.exam_id, e.exam_name, e.date, e.duration, e.status
            FROM exam e
            JOIN exam_section es ON e.exam_id = es.exam_id
            WHERE es.section_id = %s
            ORDER BY e.date DESC
            """,
            (section_id,),
        )

        exams = cursor.fetchall()

        return {"exams": exams}

    finally:
        cursor.close()
        conn.close()