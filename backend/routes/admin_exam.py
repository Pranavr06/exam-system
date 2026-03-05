from fastapi import APIRouter, Depends, HTTPException, Body, Request
from db import get_connection
from security import get_current_user
from .system_logger import log_action
import mysql.connector

router = APIRouter()


@router.post("/admin/exams/create")
def create_exam(
    request: Request,
    exam_name: str = Body(...),
    subject_id: int = Body(...),
    duration: int = Body(...),
    total_marks: int = Body(...),
    exam_date: str = Body(...),
    exam_scope: str = Body("DEPARTMENT"),
    batch_year: int = Body(None),
    semester: int = Body(None),
    section_id: int = Body(None),
    user=Depends(get_current_user),
):
    # 🔒 role guard
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    if total_marks <= 0:
        raise HTTPException(status_code=400, detail="Total marks must be greater than 0")
    if total_marks > 100:
        raise HTTPException(status_code=400, detail="Total marks cannot exceed 100")

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
        
        if exam_scope == "BATCH":
            if not batch_year or not semester:
                raise HTTPException(status_code=400, detail="Batch Year and Semester are required for BATCH scope")

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
                total_marks,
                status,
                created_by_admin,
                created_by_teacher,
                department_id,
                exam_scope,
                batch_year, # Store for display purposes
                semester # Store for display purposes
            )
            VALUES (%s, %s, %s, %s, %s, 'scheduled', %s, NULL, %s, %s, %s, %s)
        """

        cursor.execute(
            insert_query,
            (
                exam_name,
                subject_id,
                formatted_date,
                duration,
                total_marks,
                user["user_id"],
                department_id,
                exam_scope,
                batch_year,
                semester
            ),
        )
        new_exam_id = cursor.lastrowid
        log_action(user["user_id"], user["role"], department_id, f"Created Exam: {exam_name}", "exam", new_exam_id, ip_address=request.client.host)
        
        # ✅ If Scope is SECTION, assign it immediately
        if exam_scope == "SECTION" and section_id:
            cursor.execute(
                "INSERT INTO exam_section (exam_id, section_id) VALUES (%s, %s)",
                (new_exam_id, section_id)
            )
        
        # ✅ If Scope is BATCH, find all sections and assign
        if exam_scope == "BATCH":
            cursor.execute("""
                SELECT section_id FROM section 
                WHERE department_id = %s AND batch_year = %s AND semester = %s
            """, (department_id, batch_year, semester))
            sections_to_assign = cursor.fetchall()
            if sections_to_assign:
                values = [(new_exam_id, s['section_id']) for s in sections_to_assign]
                cursor.executemany("INSERT INTO exam_section (exam_id, section_id) VALUES (%s, %s)", values)

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
            SELECT 
                e.exam_id, e.exam_name, e.date, e.duration, e.total_marks, e.status, e.exam_scope, e.batch_year, e.semester,
                GROUP_CONCAT(s.section_name SEPARATOR ', ') as section_details
            FROM exam e
            LEFT JOIN exam_section es ON e.exam_id = es.exam_id
            LEFT JOIN section s ON es.section_id = s.section_id
            WHERE e.department_id = %s 
            GROUP BY e.exam_id
            ORDER BY e.date DESC
        """, (admin_row["department_id"],))
        
        return cursor.fetchall()
    finally:
        cursor.close()
        conn.close()


@router.post("/admin/exams/add-question")
def add_question(
    exam_id: int = Body(...),
    question_text: str = Body(...),
    marks: float = Body(1.0),
    options: list = Body(...),  # List of {text: str, is_correct: bool}
    user=Depends(get_current_user),
):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    if marks > 4:
        raise HTTPException(status_code=400, detail="Marks cannot exceed 4")
    if marks < 0.25:
        raise HTTPException(status_code=400, detail="Marks cannot be less than 0.25")

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
    marks: float = Body(...),
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
            SELECT s.section_id, s.section_name, s.batch_year, s.semester
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
    total_marks: int = Body(...),
    exam_date: str = Body(...),
    exam_scope: str = Body("DEPARTMENT"),
    section_id: int = Body(None),
    batch_year: int = Body(None),
    semester: int = Body(None),
    user=Depends(get_current_user)
):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    if total_marks <= 0:
        raise HTTPException(status_code=400, detail="Total marks must be greater than 0")
    if total_marks > 100:
        raise HTTPException(status_code=400, detail="Total marks cannot exceed 100")

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT department_id FROM admin WHERE admin_id = %s", (user["user_id"],))
        admin_dept = cursor.fetchone()["department_id"]
        
        formatted_date = exam_date.replace("T", " ")
        
        cursor.execute("""
            UPDATE exam SET exam_name=%s, subject_id=%s, duration=%s, total_marks=%s, date=%s, exam_scope=%s, batch_year=%s, semester=%s 
            WHERE exam_id=%s AND department_id=%s
        """, (exam_name, subject_id, duration, total_marks, formatted_date, exam_scope, batch_year, semester, exam_id, admin_dept))
        conn.commit()
        return {"message": "Exam updated successfully"}
    finally:
        cursor.close()
        conn.close()

@router.post("/admin/exams/{exam_id}/publish")
def publish_exam(exam_id: int, request: Request, user=Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    try:
        # 1. Get Exam Details
        cursor.execute("SELECT total_marks, department_id FROM exam WHERE exam_id = %s", (exam_id,))
        exam = cursor.fetchone()
        if not exam:
            raise HTTPException(status_code=404, detail="Exam not found")

        # 2. Calculate Total Question Marks
        cursor.execute("SELECT SUM(marks) as total_q_marks FROM question WHERE exam_id = %s", (exam_id,))
        result = cursor.fetchone()
        total_q_marks = result["total_q_marks"] or 0

        # 3. Validate
        if float(total_q_marks) != float(exam["total_marks"]):
            raise HTTPException(
                status_code=400, 
                detail=f"Marks mismatch! Exam Total: {exam['total_marks']}, Questions Total: {total_q_marks}. Please adjust questions."
            )

        # 4. Publish
        cursor.execute("UPDATE exam SET status = 'active' WHERE exam_id = %s", (exam_id,))
        log_action(user["user_id"], user["role"], exam["department_id"], f"Published Exam ID: {exam_id}", "exam", exam_id, ip_address=request.client.host)

        conn.commit()
        return {"message": "Exam published successfully"}

    finally:
        cursor.close()
        conn.close()

@router.get("/admin/exams/{exam_id}/results")
def get_exam_results(exam_id: int, user=Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    try:
        # Verify ownership/department
        cursor.execute("SELECT department_id FROM admin WHERE admin_id = %s", (user["user_id"],))
        admin_dept = cursor.fetchone()["department_id"]

        cursor.execute("SELECT department_id FROM exam WHERE exam_id = %s", (exam_id,))
        exam = cursor.fetchone()
        if not exam or exam["department_id"] != admin_dept:
             raise HTTPException(status_code=404, detail="Exam not found or access denied")

        # Fetch results
        cursor.execute("""
            SELECT r.student_id, s.name, s.usn, r.total_marks, r.result_status, r.generated_time
            FROM result r
            JOIN student s ON r.student_id = s.student_id
            WHERE r.exam_id = %s
            ORDER BY r.total_marks DESC
        """, (exam_id,))
        return cursor.fetchall()
    finally:
        cursor.close()
        conn.close()

@router.get("/admin/results/filter")
def filter_results(
    semester: int = None,
    section_id: int = None,
    subject_id: int = None,
    teacher_id: int = None,
    search: str = None,
    user=Depends(get_current_user)
):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    try:
        cursor.execute("SELECT department_id FROM admin WHERE admin_id = %s", (user["user_id"],))
        admin_dept = cursor.fetchone()["department_id"]

        query = """
            SELECT 
                r.result_id, 
                s.name AS student_name, 
                s.usn, 
                s.semester,
                sec.section_name,
                e.exam_name, 
                sub.subject_name, 
                t.name AS teacher_name,
                r.total_marks AS obtained_marks, 
                e.total_marks AS max_marks, 
                r.result_status,
                r.generated_time
            FROM result r
            JOIN student s ON r.student_id = s.student_id
            JOIN exam e ON r.exam_id = e.exam_id
            JOIN subject sub ON e.subject_id = sub.subject_id
            LEFT JOIN section sec ON s.section_id = sec.section_id
            LEFT JOIN teacher t ON e.created_by_teacher = t.teacher_id
            WHERE s.department_id = %s
        """
        params = [admin_dept]

        if semester:
            query += " AND s.semester = %s"
            params.append(semester)
        if section_id:
            query += " AND s.section_id = %s"
            params.append(section_id)
        if subject_id:
            query += " AND e.subject_id = %s"
            params.append(subject_id)
        if teacher_id:
            query += " AND e.created_by_teacher = %s"
            params.append(teacher_id)
        if search:
            query += " AND (s.name LIKE %s OR s.usn LIKE %s)"
            params.extend([f"%{search}%", f"%{search}%"])

        query += " ORDER BY r.generated_time DESC LIMIT 500"
        cursor.execute(query, tuple(params))
        return cursor.fetchall()
    finally:
        cursor.close()
        conn.close()