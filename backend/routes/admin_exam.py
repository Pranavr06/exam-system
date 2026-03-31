from fastapi import APIRouter, Depends, HTTPException, Body, Request, Query
from db import get_connection
from security import get_current_user
from .system_logger import log_action
from passlib.context import CryptContext
import mysql.connector
from datetime import datetime

router = APIRouter()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


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
    override_conflicts: bool = Body(False),
    mode: str = Body("ONLINE"),
    lab_id: int = Body(None),
    password: str = Body(None),
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

        # ✅ Validate, sanitize, and hash Center Mode Details
        hashed_password = None
        if mode == "CENTER":
            if not password or not password.strip():
                raise HTTPException(status_code=400, detail="A non-empty password is required for Center-based exams.")
            if not lab_id:
                raise HTTPException(status_code=400, detail="A lab is required for Center-based exams.")
            hashed_password = pwd_context.hash(password.strip())
        if mode == "ONLINE":
            lab_id = None

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
        if len(formatted_date) == 16:
            formatted_date += ":00"
            
        # ✅ Check for Past Date
        exam_datetime = datetime.strptime(formatted_date, "%Y-%m-%d %H:%M:%S")
        if exam_datetime < datetime.now():
            raise HTTPException(status_code=400, detail="Cannot schedule an exam in the past.")
            
        # ✅ Resolve target sections for Overlap Check & Insertion
        target_section_ids = []
        if exam_scope == "SECTION":
            target_section_ids.append(section_id)
        elif exam_scope == "BATCH":
            cursor.execute("SELECT section_id FROM section WHERE department_id = %s AND batch_year = %s AND semester = %s", (department_id, batch_year, semester))
            target_section_ids = [row["section_id"] for row in cursor.fetchall()]
        elif exam_scope == "DEPARTMENT":
            cursor.execute("SELECT section_id FROM section WHERE department_id = %s", (department_id,))
            target_section_ids = [row["section_id"] for row in cursor.fetchall()]

        if not target_section_ids:
            raise HTTPException(status_code=400, detail="No sections found for the specified scope. Cannot create exam.")

        # ✅ Check for overlapping exams in the selected sections
        if not override_conflicts:
            overlap_format_strings = ','.join(['%s'] * len(target_section_ids))
            overlap_query = f"""
                SELECT DISTINCT e.exam_name, sec.section_name 
                FROM exam e
                JOIN exam_section es ON e.exam_id = es.exam_id
                JOIN section sec ON es.section_id = sec.section_id
                WHERE es.section_id IN ({overlap_format_strings})
                  AND e.status != 'completed'
                  AND e.is_archived = 0
                  AND e.date < DATE_ADD(%s, INTERVAL %s MINUTE)
                  AND DATE_ADD(e.date, INTERVAL e.duration MINUTE) > %s
            """
            overlap_params = tuple(target_section_ids) + (formatted_date, duration, formatted_date)
            cursor.execute(overlap_query, overlap_params)
            overlaps = cursor.fetchall()
            
            if overlaps:
                overlap_details = ", ".join([f"'{o['exam_name']}' (Section {o['section_name']})" for o in overlaps])
                raise HTTPException(status_code=400, detail=f"Time conflict! The selected sections already have exams scheduled: {overlap_details}")

        cursor.execute(
            """
            INSERT INTO exam (
                exam_name, subject_id, date, duration, total_marks, status, 
                created_by_admin, department_id, exam_scope, batch_year, semester,
                mode, lab_id, password_hash
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                exam_name, subject_id, formatted_date, duration, total_marks,
                'scheduled', user["user_id"], department_id, exam_scope, batch_year, 
                semester, mode, lab_id, hashed_password
            )
        )
        new_exam_id = cursor.lastrowid
        log_action(user["user_id"], user["role"], department_id, f"Created Exam: {exam_name}", "exam", new_exam_id, ip_address=request.client.host)
        
        # ✅ Insert into exam_section consistently for all scopes
        if target_section_ids:
            values = [(new_exam_id, s_id) for s_id in target_section_ids]
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
def get_exams(
    subject_id: int = Query(None),
    status: str = Query(None),
    search: str = Query(None),
    archived: bool = Query(False),
    user=Depends(get_current_user)
):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    try:
        # Auto-update status for expired exams
        cursor.execute("""
            UPDATE exam 
            SET status = 'completed' 
            WHERE status != 'completed' AND NOW() > DATE_ADD(date, INTERVAL duration MINUTE)
        """)
        conn.commit()

        cursor.execute("SELECT department_id FROM admin WHERE admin_id = %s", (user["user_id"],))
        admin_row = cursor.fetchone()
        if not admin_row or not admin_row["department_id"]:
            raise HTTPException(status_code=400, detail="Admin not assigned to department")
        
        query = """
            SELECT 
                e.exam_id, e.exam_name, sub.subject_name, e.date, e.duration, e.total_marks, e.created_by_admin, e.exam_type, e.parent_exam_id, e.mode,
                CASE
                    WHEN e.status = 'completed' THEN 'completed'
                    WHEN NOW() > (e.date + INTERVAL e.duration MINUTE) THEN 'completed'
                    WHEN e.status = 'active' AND NOW() >= e.date THEN 'active'
                    ELSE 'scheduled'
                END as status, e.exam_scope, e.batch_year, e.semester,
                GROUP_CONCAT(s.section_name SEPARATOR ', ') as section_details
            FROM exam e
            LEFT JOIN exam_section es ON e.exam_id = es.exam_id
            LEFT JOIN section s ON es.section_id = s.section_id
            JOIN subject sub ON e.subject_id = sub.subject_id
            WHERE e.department_id = %s AND e.is_archived = %s
        """
        params = [admin_row["department_id"], 1 if archived else 0]

        if subject_id:
            query += " AND e.subject_id = %s"
            params.append(subject_id)
        if search:
            query += " AND e.exam_name LIKE %s"
            params.append(f"%{search}%")
        
        query += " GROUP BY e.exam_id"
        
        if status:
            query += " HAVING status = %s"
            params.append(status)
            
        query += " ORDER BY e.date DESC"

        cursor.execute(query, tuple(params))
        return cursor.fetchall()
    finally:
        cursor.close()
        conn.close()

@router.post("/admin/exams/{exam_id}/re-exam/class")
def create_reexam_class(
    exam_id: int,
    request: Request,
    exam_date: str = Body(...),
    duration: int = Body(...),
    override_conflicts: bool = Body(False),
    user=Depends(get_current_user)
):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        # Fetch original exam
        cursor.execute("SELECT * FROM exam WHERE exam_id = %s", (exam_id,))
        original = cursor.fetchone()
        if not original:
            raise HTTPException(status_code=404, detail="Original exam not found")

        formatted_date = exam_date.replace("T", " ")
        if len(formatted_date) == 16:
            formatted_date += ":00"
            
        exam_datetime = datetime.strptime(formatted_date, "%Y-%m-%d %H:%M:%S")
        if exam_datetime < datetime.now():
            raise HTTPException(status_code=400, detail="Cannot schedule a re-exam in the past.")
            
        new_name = f"Retake: {original['exam_name']}"

        # Create new exam instance
        cursor.execute("""
            INSERT INTO exam (
                exam_name, subject_id, date, duration, total_marks, status, 
                created_by_admin, department_id, exam_scope, batch_year, semester, 
                exam_type, parent_exam_id
            ) VALUES (%s, %s, %s, %s, %s, 'scheduled', %s, %s, %s, %s, %s, 'retake', %s)
        """, (
            new_name, original['subject_id'], formatted_date, duration, original['total_marks'],
            user["user_id"], original['department_id'], original['exam_scope'], 
            original['batch_year'], original['semester'], exam_id
        ))
        new_exam_id = cursor.lastrowid

        # Copy Sections
        cursor.execute("SELECT section_id FROM exam_section WHERE exam_id = %s", (exam_id,))
        sections = cursor.fetchall()
        target_section_ids = [s["section_id"] for s in sections]
        
        if target_section_ids:
            # Check overlap for class re-exam
            if not override_conflicts:
                overlap_format_strings = ','.join(['%s'] * len(target_section_ids))
                overlap_query = f"""
                    SELECT DISTINCT e.exam_name, sec.section_name 
                    FROM exam e
                    JOIN exam_section es ON e.exam_id = es.exam_id
                    JOIN section sec ON es.section_id = sec.section_id
                    WHERE es.section_id IN ({overlap_format_strings})
                      AND e.status != 'completed'
                      AND e.is_archived = 0
                      AND e.date < DATE_ADD(%s, INTERVAL %s MINUTE)
                      AND DATE_ADD(e.date, INTERVAL e.duration MINUTE) > %s
                """
                overlap_params = tuple(target_section_ids) + (formatted_date, duration, formatted_date)
                cursor.execute(overlap_query, overlap_params)
                overlaps = cursor.fetchall()
                
                if overlaps:
                    overlap_details = ", ".join([f"'{o['exam_name']}' (Section {o['section_name']})" for o in overlaps])
                    raise HTTPException(status_code=400, detail=f"Time conflict! The selected sections already have exams scheduled: {overlap_details}")

        if target_section_ids:
            values = [(new_exam_id, s_id) for s_id in target_section_ids]
            cursor.executemany("INSERT INTO exam_section (exam_id, section_id) VALUES (%s, %s)", values)

        # Copy Questions
        cursor.execute("SELECT * FROM question WHERE exam_id = %s", (exam_id,))
        questions = cursor.fetchall()
        for q in questions:
            cursor.execute("INSERT INTO question (exam_id, question_text, marks) VALUES (%s, %s, %s)", 
                           (new_exam_id, q['question_text'], q['marks']))
            new_q_id = cursor.lastrowid
            
            cursor.execute("SELECT * FROM question_option WHERE question_id = %s", (q['question_id'],))
            options = cursor.fetchall()
            if options:
                opt_values = [(new_q_id, o['option_text'], o['is_correct']) for o in options]
                cursor.executemany("INSERT INTO question_option (question_id, option_text, is_correct) VALUES (%s, %s, %s)", opt_values)

        log_action(user["user_id"], "admin", original['department_id'], f"Created Class Re-Exam: {new_name}", "exam", new_exam_id, ip_address=request.client.host)
        conn.commit()
        return {"message": "Class Re-Exam created successfully"}
    finally:
        cursor.close()
        conn.close()

@router.post("/admin/exams/{exam_id}/re-exam/students")
def create_reexam_students(
    exam_id: int,
    request: Request,
    student_ids: list[int] = Body(...),
    exam_date: str = Body(...),
    duration: int = Body(...),
    user=Depends(get_current_user)
):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    conn = get_connection()
    cursor = conn.cursor()
    try:
        formatted_date = exam_date.replace("T", " ")
        if len(formatted_date) == 16:
            formatted_date += ":00"
            
        exam_datetime = datetime.strptime(formatted_date, "%Y-%m-%d %H:%M:%S")
        if exam_datetime < datetime.now():
            raise HTTPException(status_code=400, detail="Cannot schedule a re-exam in the past.")
            
        cursor.execute("SELECT department_id FROM exam WHERE exam_id = %s", (exam_id,))
        exam = cursor.fetchone()
        if not exam:
            raise HTTPException(status_code=404, detail="Exam not found")

        values = [(exam_id, sid, formatted_date, duration, user["user_id"], 'scheduled') for sid in student_ids]
        cursor.executemany("""
            INSERT INTO exam_retake (exam_id, student_id, retake_date, retake_duration, created_by, status)
            VALUES (%s, %s, %s, %s, %s, %s)
        """, values)
        
        log_action(user["user_id"], "admin", exam['department_id'], f"Scheduled Student Re-Exam for {len(student_ids)} students", "exam", exam_id, ip_address=request.client.host)
        conn.commit()
        return {"message": "Student Re-Exams scheduled successfully"}
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

    # Validate Options
    if len(options) < 2:
        raise HTTPException(status_code=400, detail="At least 2 options are required")
    
    if sum(1 for opt in options if opt["is_correct"]) != 1:
        raise HTTPException(status_code=400, detail="Exactly one correct option must be selected")
    
    if any(not opt["text"].strip() for opt in options):
        raise HTTPException(status_code=400, detail="Option text cannot be empty")

    option_texts = [opt["text"].strip() for opt in options]
    if len(option_texts) != len(set(option_texts)):
        raise HTTPException(status_code=400, detail="Duplicate options provided. Each option must be unique.")

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    try:
        # Check if question already exists
        cursor.execute("SELECT question_id FROM question WHERE exam_id = %s AND question_text = %s", (exam_id, question_text))
        if cursor.fetchone():
            raise HTTPException(status_code=400, detail="This question already exists in the exam.")

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
    except mysql.connector.IntegrityError as e:
        if "unique_option_per_question" in str(e):
             raise HTTPException(status_code=400, detail="Duplicate options detected for this question.")
        raise HTTPException(status_code=400, detail=str(e))
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

        # Get exam total marks and sum of question marks
        cursor.execute("SELECT total_marks FROM exam WHERE exam_id = %s", (exam_id,))
        exam_details = cursor.fetchone()
        
        cursor.execute("SELECT SUM(marks) as total FROM question WHERE exam_id = %s", (exam_id,))
        marks_sum = cursor.fetchone()

        return {
            "questions": questions,
            "total": total,
            "page": page,
            "limit": limit,
            "total_pages": (total + limit - 1) // limit if limit > 0 else 0,
            "exam_total_marks": exam_details["total_marks"] if exam_details else 0,
            "total_marks_used": marks_sum["total"] if marks_sum and marks_sum["total"] else 0
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

        # Check if question text already exists (excluding current question)
        cursor.execute("SELECT question_id FROM question WHERE exam_id = (SELECT exam_id FROM question WHERE question_id = %s) AND question_text = %s AND question_id != %s", (question_id, question_text, question_id))
        if cursor.fetchone():
            raise HTTPException(status_code=400, detail="This question text already exists in the exam.")

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
    except mysql.connector.IntegrityError as e:
        if "unique_option_per_question" in str(e):
             raise HTTPException(status_code=400, detail="Duplicate options detected for this question.")
        raise HTTPException(status_code=400, detail=str(e))
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

        cursor.execute("UPDATE exam SET is_archived = 1 WHERE exam_id = %s AND department_id = %s", (exam_id, admin_dept))
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Exam not found or access denied")
        
        conn.commit()
        return {"message": "Exam archived successfully"}
    finally:
        cursor.close()
        conn.close()

@router.put("/admin/exams/{exam_id}/restore")
def restore_exam_admin(exam_id: int, user=Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    try:
        cursor.execute("SELECT department_id FROM admin WHERE admin_id = %s", (user["user_id"],))
        admin_dept = cursor.fetchone()["department_id"]

        cursor.execute("UPDATE exam SET is_archived = 0 WHERE exam_id = %s AND department_id = %s", (exam_id, admin_dept))
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Exam not found or access denied")
        
        conn.commit()
        return {"message": "Exam restored successfully"}
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
    request: Request,
    exam_name: str = Body(...),
    subject_id: int = Body(...),
    duration: int = Body(...),
    total_marks: int = Body(...),
    exam_date: str = Body(...),
    exam_scope: str = Body("DEPARTMENT"),
    section_id: int = Body(None),
    batch_year: int = Body(None),
    semester: int = Body(None),
    assigned_teacher_id: int = Body(None),
    override_conflicts: bool = Body(False),
    mode: str = Body("ONLINE"),
    lab_id: int = Body(None),
    password: str = Body(None),
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
        if len(formatted_date) == 16:
            formatted_date += ":00"
            
        exam_datetime = datetime.strptime(formatted_date, "%Y-%m-%d %H:%M:%S")
        if exam_datetime < datetime.now():
            raise HTTPException(status_code=400, detail="Cannot schedule an exam in the past.")
            
        # ✅ Resolve target sections to update mappings and check overlap
        target_section_ids = []
        if exam_scope == "SECTION":
            if not section_id:
                raise HTTPException(status_code=400, detail="Section ID is required for SECTION scope")
            target_section_ids.append(section_id)
        elif exam_scope == "BATCH":
            cursor.execute("SELECT section_id FROM section WHERE department_id = %s AND batch_year = %s AND semester = %s", (admin_dept, batch_year, semester))
            target_section_ids = [row["section_id"] for row in cursor.fetchall()]
        elif exam_scope == "DEPARTMENT":
            cursor.execute("SELECT section_id FROM section WHERE department_id = %s", (admin_dept,))
            target_section_ids = [row["section_id"] for row in cursor.fetchall()]

        if not target_section_ids:
            raise HTTPException(status_code=400, detail="No sections found for the specified scope.")
            
        # ✅ Validate, sanitize, and hash Center Mode Details
        hashed_password = None
        if mode == "CENTER":
            if not password or not password.strip():
                raise HTTPException(status_code=400, detail="A non-empty password is required for Center-based exams.")
            if not lab_id:
                raise HTTPException(status_code=400, detail="A lab is required for Center-based exams.")
            password = password.strip()
            if not password.startswith('$2b$'):
                hashed_password = pwd_context.hash(password)
            else:
                hashed_password = password # Assume it's the old hash being re-submitted
        if mode == "ONLINE":
            lab_id = None
            hashed_password = None

        # ✅ Check for overlapping exams (excluding current exam)
        if not override_conflicts:
            overlap_format_strings = ','.join(['%s'] * len(target_section_ids))
            overlap_query = f"""
                SELECT DISTINCT e.exam_name, sec.section_name 
                FROM exam e
                JOIN exam_section es ON e.exam_id = es.exam_id
                JOIN section sec ON es.section_id = sec.section_id
                WHERE es.section_id IN ({overlap_format_strings})
                  AND e.exam_id != %s
                  AND e.status != 'completed'
                  AND e.is_archived = 0
                  AND e.date < DATE_ADD(%s, INTERVAL %s MINUTE)
                  AND DATE_ADD(e.date, INTERVAL e.duration MINUTE) > %s
            """
            overlap_params = tuple(target_section_ids) + (exam_id, formatted_date, duration, formatted_date)
            cursor.execute(overlap_query, overlap_params)
            overlaps = cursor.fetchall()
            
            if overlaps:
                overlap_details = ", ".join([f"'{o['exam_name']}' (Section {o['section_name']})" for o in overlaps])
                raise HTTPException(status_code=400, detail=f"Time conflict! Scheduled exams overlap: {overlap_details}")
        
        # Base update query
        update_sql = """
            UPDATE exam SET exam_name=%s, subject_id=%s, duration=%s, total_marks=%s, date=%s, exam_scope=%s, batch_year=%s, semester=%s, mode=%s, lab_id=%s, password_hash=%s 
        """
        params = [exam_name, subject_id, duration, total_marks, formatted_date, exam_scope, batch_year, semester, mode, lab_id, hashed_password]

        # Handle Reassignment to a Teacher
        if assigned_teacher_id is not None:
            cursor.execute("SELECT teacher_id FROM teacher WHERE teacher_id = %s AND department_id = %s", (assigned_teacher_id, admin_dept))
            if not cursor.fetchone():
                 raise HTTPException(status_code=400, detail="Assigned teacher not found in department")
            update_sql += ", created_by_teacher=%s, created_by_admin=NULL"
            params.append(assigned_teacher_id)

        update_sql += " WHERE exam_id=%s AND department_id=%s"
        params.extend([exam_id, admin_dept])

        cursor.execute(update_sql, tuple(params))
        
        # Update Sections (Delete old, insert new)
        cursor.execute("DELETE FROM exam_section WHERE exam_id = %s", (exam_id,))
        if target_section_ids:
            values = [(exam_id, sec_id, user["user_id"] if assigned_teacher_id is None else None) for sec_id in target_section_ids]
            cursor.executemany("INSERT INTO exam_section (exam_id, section_id, assigned_by_admin) VALUES (%s, %s, %s)", values)

        log_action(user["user_id"], user["role"], admin_dept, f"Updated Exam: {exam_name}", "exam", exam_id, ip_address=request.client.host)
        
        conn.commit()
        return {"message": "Exam updated successfully"}
    finally:
        cursor.close()
        conn.close()

@router.post("/admin/exams/{exam_id}/publish")
def publish_exam_admin(exam_id: int, request: Request, user=Depends(get_current_user)):
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
        if abs(float(total_q_marks) - float(exam["total_marks"])) > 0.01:
            raise HTTPException(
                status_code=400, 
                detail=f"Marks mismatch! Exam Total: {exam['total_marks']}, Questions Total: {total_q_marks}."
            )
            
        cursor.execute("UPDATE exam SET status = 'active', date = NOW() WHERE exam_id = %s", (exam_id,))
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
        admin_row = cursor.fetchone()
        if not admin_row:
            raise HTTPException(status_code=400, detail="Admin not mapped to department")
            
        cursor.execute("SELECT department_id FROM exam WHERE exam_id = %s", (exam_id,))
        exam = cursor.fetchone()
        if not exam or exam["department_id"] != admin_row["department_id"]:
            raise HTTPException(status_code=403, detail="Access denied")
            
        cursor.execute("""
            SELECT r.result_id, s.student_id, s.name, s.usn, r.total_marks, r.result_status, r.generated_time
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