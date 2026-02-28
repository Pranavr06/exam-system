from fastapi import APIRouter, Depends, HTTPException, Body
from db import get_connection
from security import get_current_user
import mysql.connector

router = APIRouter()


@router.post("/admin/exams/create")
def create_exam(
    exam_name: str = Body(...),
    subject_id: int = Body(...),
    duration: int = Body(...),
    exam_date: str = Body(...),
    exam_scope: str = Body("DEPARTMENT"),
    section_id: int = Body(None),
    user=Depends(get_current_user),
):
    # 🔒 role guard
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    try:
        # ✅ get admin department
        cursor.execute(
            "SELECT department_id FROM admin WHERE admin_id = %s",
            (user["user_id"],),
        )
        admin_row = cursor.fetchone()

        if not admin_row or not admin_row["department_id"]:
            raise HTTPException(
                status_code=400,
                detail="Admin not mapped to department"
            )

        department_id = admin_row["department_id"]

        # ✅ verify subject belongs to same department (IMPORTANT)
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

        # ✅ Validate Section if Scope is SECTION
        if exam_scope == "SECTION":
            if not section_id:
                raise HTTPException(status_code=400, detail="Section ID is required for SECTION scope")
            
            cursor.execute("SELECT department_id FROM section WHERE section_id = %s", (section_id,))
            section_row = cursor.fetchone()
            
            if not section_row or section_row["department_id"] != department_id:
                raise HTTPException(status_code=403, detail="Invalid section or section belongs to another department")

        # 🚨 DUPLICATE CHECK (backend layer)
        cursor.execute(
            """
            SELECT exam_id FROM exam
            WHERE exam_name = %s
            AND subject_id = %s
            AND created_by_admin = %s
            """,
            (exam_name, subject_id, user["user_id"]),
        )

        if cursor.fetchone():
            raise HTTPException(
                status_code=400,
                detail="Exam with same name already exists for this subject",
            )

        # ✅ Format date for MySQL (YYYY-MM-DD HH:MM)
        formatted_date = exam_date.replace("T", " ")

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
            VALUES (%s, %s, %s, %s, 'scheduled', %s, NULL, %s, %s)
        """

        cursor.execute(
            insert_query,
            (
                exam_name,
                subject_id,
                formatted_date,
                duration,
                user["user_id"],
                department_id,
                exam_scope,
            ),
        )
        
        # ✅ If Scope is SECTION, assign it immediately
        if exam_scope == "SECTION" and section_id:
            new_exam_id = cursor.lastrowid
            cursor.execute(
                "INSERT INTO exam_section (exam_id, section_id) VALUES (%s, %s)",
                (new_exam_id, section_id)
            )

        conn.commit()

        return {"message": "Exam created successfully"}

    except mysql.connector.IntegrityError:
        # 🛡️ DB safety net
        raise HTTPException(
            status_code=400,
            detail="Duplicate exam prevented by database constraint",
        )

    finally:
        cursor.close()
        conn.close()


@router.get("/admin/exams")
def get_exams(user=Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    try:
        cursor.execute("SELECT department_id FROM admin WHERE admin_id = %s", (user["user_id"],))
        admin_row = cursor.fetchone()
        if not admin_row or not admin_row["department_id"]:
            raise HTTPException(status_code=400, detail="Admin not assigned to department")
        
        cursor.execute("""
            SELECT exam_id, exam_name 
            FROM exam 
            WHERE department_id = %s 
            ORDER BY date DESC
        """, (admin_row["department_id"],))
        
        return cursor.fetchall()
    finally:
        cursor.close()
        conn.close()


@router.post("/admin/exams/add-question")
def add_question(
    exam_id: int = Body(...),
    question_text: str = Body(...),
    marks: int = Body(1),
    options: list = Body(...),  # List of {text: str, is_correct: bool}
    user=Depends(get_current_user),
):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    if marks > 4:
        raise HTTPException(status_code=400, detail="Marks cannot exceed 4")

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    try:
        # Insert Question
        cursor.execute(
            "INSERT INTO question (exam_id, question_text, marks) VALUES (%s, %s, %s)",
            (exam_id, question_text, marks)
        )
        question_id = cursor.lastrowid

        # Insert Options
        for opt in options:
            cursor.execute(
                "INSERT INTO question_option (question_id, option_text, is_correct) VALUES (%s, %s, %s)",
                (question_id, opt["text"], opt["is_correct"])
            )
        
        conn.commit()
        return {"message": "Question added successfully"}
    finally:
        cursor.close()
        conn.close()


@router.get("/admin/exams/{exam_id}/questions")
def get_exam_questions_admin(
    exam_id: int,
    page: int = 1,
    limit: int = 5,
    user=Depends(get_current_user)
):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    if marks > 4:
        raise HTTPException(status_code=400, detail="Marks cannot exceed 4")

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    try:
        # Calculate offset
        offset = (page - 1) * limit

        # Get Total Count (for pagination)
        cursor.execute("""
            SELECT COUNT(*) as total
            FROM question q
            JOIN exam e ON q.exam_id = e.exam_id
            JOIN admin a ON e.department_id = a.department_id
            WHERE q.exam_id = %s AND a.admin_id = %s
        """, (exam_id, user["user_id"]))
        total = cursor.fetchone()["total"]

        # Get Paginated Questions
        cursor.execute("""
            SELECT q.question_id, q.question_text, q.marks
            FROM question q
            JOIN exam e ON q.exam_id = e.exam_id
            JOIN admin a ON e.department_id = a.department_id
            WHERE q.exam_id = %s AND a.admin_id = %s
            LIMIT %s OFFSET %s
        """, (exam_id, user["user_id"], limit, offset))
        
        questions = cursor.fetchall()

        return {
            "questions": questions,
            "total": total,
            "page": page,
            "limit": limit,
            "total_pages": (total + limit - 1) // limit if limit > 0 else 0
        }
    finally:
        cursor.close()
        conn.close()


@router.delete("/admin/questions/{question_id}")
def delete_question(question_id: int, user=Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    try:
        # Verify ownership via department
        cursor.execute("""
            SELECT q.question_id 
            FROM question q
            JOIN exam e ON q.exam_id = e.exam_id
            JOIN admin a ON e.department_id = a.department_id
            WHERE q.question_id = %s AND a.admin_id = %s
        """, (question_id, user["user_id"]))
        
        if not cursor.fetchone():
             raise HTTPException(status_code=404, detail="Question not found or access denied")

        cursor.execute("DELETE FROM question WHERE question_id = %s", (question_id,))
        conn.commit()
        return {"message": "Question deleted successfully"}
    finally:
        cursor.close()
        conn.close()


@router.get("/admin/questions/{question_id}")
def get_question(question_id: int, user=Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    try:
        # Verify ownership
        cursor.execute("""
            SELECT q.question_id, q.question_text, q.marks, q.exam_id
            FROM question q
            JOIN exam e ON q.exam_id = e.exam_id
            JOIN admin a ON e.department_id = a.department_id
            WHERE q.question_id = %s AND a.admin_id = %s
        """, (question_id, user["user_id"]))
        
        question = cursor.fetchone()
        if not question:
            raise HTTPException(status_code=404, detail="Question not found")

        # Fetch options
        cursor.execute("""
            SELECT option_text, is_correct 
            FROM question_option 
            WHERE question_id = %s 
            ORDER BY option_id ASC
        """, (question_id,))
        options = cursor.fetchall()
        
        question["options"] = options
        return question
    finally:
        cursor.close()
        conn.close()


@router.put("/admin/questions/{question_id}")
def update_question(
    question_id: int,
    question_text: str = Body(...),
    marks: int = Body(...),
    options: list = Body(...),
    user=Depends(get_current_user)
):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    try:
        # Verify ownership
        cursor.execute("""
            SELECT q.question_id 
            FROM question q
            JOIN exam e ON q.exam_id = e.exam_id
            JOIN admin a ON e.department_id = a.department_id
            WHERE q.question_id = %s AND a.admin_id = %s
        """, (question_id, user["user_id"]))
        
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Question not found")

        # Update Question
        cursor.execute(
            "UPDATE question SET question_text = %s, marks = %s WHERE question_id = %s",
            (question_text, marks, question_id)
        )

        # Replace Options (Delete all and re-insert)
        cursor.execute("DELETE FROM question_option WHERE question_id = %s", (question_id,))
        
        for opt in options:
            cursor.execute(
                "INSERT INTO question_option (question_id, option_text, is_correct) VALUES (%s, %s, %s)",
                (question_id, opt["text"], opt["is_correct"])
            )
        
        conn.commit()
        return {"message": "Question updated successfully"}
    finally:
        cursor.close()
        conn.close()


@router.get("/admin/exams/{exam_id}/sections")
def get_exam_assigned_sections(exam_id: int, user=Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    try:
        cursor.execute("""
            SELECT s.section_id, s.section_name, s.semester
            FROM section s
            JOIN exam_section es ON s.section_id = es.section_id
            WHERE es.exam_id = %s
        """, (exam_id,))
        
        return cursor.fetchall()
    finally:
        cursor.close()
        conn.close()

@router.delete("/admin/exams/{exam_id}")
def delete_exam(exam_id: int, user=Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    try:
        cursor.execute("SELECT department_id FROM admin WHERE admin_id = %s", (user["user_id"],))
        admin_dept = cursor.fetchone()["department_id"]

        cursor.execute("DELETE FROM exam WHERE exam_id = %s AND department_id = %s", (exam_id, admin_dept))
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Exam not found or access denied")
        
        conn.commit()
        return {"message": "Exam deleted successfully"}
    finally:
        cursor.close()
        conn.close()

@router.get("/admin/exams/{exam_id}")
def get_exam(exam_id: int, user=Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT department_id FROM admin WHERE admin_id = %s", (user["user_id"],))
        admin_dept = cursor.fetchone()["department_id"]
        cursor.execute("SELECT * FROM exam WHERE exam_id = %s AND department_id = %s", (exam_id, admin_dept))
        exam = cursor.fetchone()
        if not exam: raise HTTPException(status_code=404, detail="Exam not found")
        return exam
    finally:
        cursor.close()
        conn.close()

@router.put("/admin/exams/{exam_id}")
def update_exam(
    exam_id: int,
    exam_name: str = Body(...),
    subject_id: int = Body(...),
    duration: int = Body(...),
    exam_date: str = Body(...),
    exam_scope: str = Body("DEPARTMENT"),
    section_id: int = Body(None),
    user=Depends(get_current_user)
):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT department_id FROM admin WHERE admin_id = %s", (user["user_id"],))
        admin_dept = cursor.fetchone()["department_id"]
        
        formatted_date = exam_date.replace("T", " ")
        
        cursor.execute("""
            UPDATE exam SET exam_name=%s, subject_id=%s, duration=%s, date=%s, exam_scope=%s 
            WHERE exam_id=%s AND department_id=%s
        """, (exam_name, subject_id, duration, formatted_date, exam_scope, exam_id, admin_dept))
        conn.commit()
        return {"message": "Exam updated successfully"}
    finally:
        cursor.close()
        conn.close()