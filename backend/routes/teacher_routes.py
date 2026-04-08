from fastapi import APIRouter, Depends, HTTPException, Body, Query, Request
from db import get_connection
from security import get_current_user
from .system_logger import log_action, log_teacher_action
from passlib.context import CryptContext
import mysql.connector
from datetime import datetime

router = APIRouter()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# --- Profile ---
@router.get("/teacher/profile")
def get_teacher_profile(user=Depends(get_current_user)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Access denied")
    
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("""
            SELECT t.name, t.email, d.department_name
            FROM teacher t
            JOIN department d ON t.department_id = d.department_id
            WHERE t.teacher_id = %s
        """, (user["user_id"],))
        profile = cursor.fetchone()
        if not profile:
            raise HTTPException(status_code=404, detail="Profile not found")
        return profile
    finally:
        cursor.close()
        conn.close()

# --- Dashboard Stats ---
@router.get("/teacher/dashboard/stats")
def get_teacher_stats(user=Depends(get_current_user)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Access denied")
    
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

        # Total Assigned Subjects
        cursor.execute("SELECT COUNT(DISTINCT subject_id) as count FROM teaching_assignment WHERE teacher_id = %s", (user["user_id"],))
        subjects_count = cursor.fetchone()["count"]

        # Total Sections
        cursor.execute("SELECT COUNT(DISTINCT section_id) as count FROM teaching_assignment WHERE teacher_id = %s", (user["user_id"],))
        sections_count = cursor.fetchone()["count"]

        # Total Exams Created
        cursor.execute("SELECT COUNT(*) as count FROM exam WHERE created_by_teacher = %s AND is_archived = 0", (user["user_id"],))
        total_exams_created = cursor.fetchone()["count"]

        # Active Exams
        cursor.execute("SELECT COUNT(*) as count FROM exam WHERE created_by_teacher = %s AND status = 'active' AND NOW() >= date AND NOW() <= (date + INTERVAL duration MINUTE) AND is_archived = 0", (user["user_id"],))
        active_exams = cursor.fetchone()["count"]

        # Upcoming Exams (Scheduled)
        cursor.execute("SELECT COUNT(*) as count FROM exam WHERE created_by_teacher = %s AND (status = 'scheduled' OR (status = 'active' AND NOW() < date)) AND is_archived = 0", (user["user_id"],))
        upcoming_exams = cursor.fetchone()["count"]

        # Recent Exams (Last 5 created)
        cursor.execute("""
            SELECT e.exam_name, s.subject_name, e.date, 
                   CASE
                       WHEN e.status = 'completed' THEN 'completed'
                       WHEN NOW() > (e.date + INTERVAL e.duration MINUTE) THEN 'completed'
                       WHEN e.status = 'active' AND NOW() >= e.date THEN 'active'
                       ELSE 'scheduled'
                   END as status, e.exam_id,
                   GROUP_CONCAT(DISTINCT CONCAT(sec.section_name, ' (', sec.batch_year, ', Sem ', sec.semester, ')') SEPARATOR ', ') as sections
            FROM exam e
            JOIN subject s ON e.subject_id = s.subject_id
            LEFT JOIN exam_section es ON e.exam_id = es.exam_id
            LEFT JOIN section sec ON es.section_id = sec.section_id
            WHERE e.created_by_teacher = %s AND e.is_archived = 0
            GROUP BY e.exam_id
            ORDER BY e.exam_id DESC LIMIT 5
        """, (user["user_id"],))
        recent_exams = cursor.fetchall()

        # Upcoming Exams This Week
        cursor.execute("""
            SELECT e.exam_name, e.date
            FROM exam e
            WHERE e.created_by_teacher = %s 
            AND e.status = 'scheduled'
            AND e.is_archived = 0
            AND e.date BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 7 DAY)
            ORDER BY e.date ASC
        """, (user["user_id"],))
        upcoming_week_exams = cursor.fetchall()

        # Recent Results Summary (Latest exam with results)
        # Re-fetch with exam_id to use for pass/fail distribution
        cursor.execute("""
            SELECT e.exam_id, e.exam_name, AVG(r.total_marks) as avg_score, MAX(r.total_marks) as max_score, MIN(r.total_marks) as min_score, COUNT(r.result_id) as total_attempts
            FROM result r
            JOIN exam e ON r.exam_id = e.exam_id
            WHERE e.created_by_teacher = %s
            GROUP BY e.exam_id
            ORDER BY e.date DESC
            LIMIT 1
        """, (user["user_id"],))
        result_summary = cursor.fetchone()

        # Pass/Fail distribution for the latest completed exam
        pass_fail_distribution = None
        if result_summary:
            latest_exam_id = result_summary["exam_id"]
            cursor.execute("""
                SELECT 
                    SUM(CASE WHEN (r.total_marks / e.total_marks) * 100 >= 40 THEN 1 ELSE 0 END) as pass_count,
                    SUM(CASE WHEN (r.total_marks / e.total_marks) * 100 < 40 THEN 1 ELSE 0 END) as fail_count
                FROM result r
                JOIN exam e ON r.exam_id = e.exam_id
                WHERE e.exam_id = %s
            """, (latest_exam_id,))
            pass_fail_distribution = cursor.fetchone()

        # --- Alerts ---
        alerts = []
        
        # 1. Exams without questions
        cursor.execute("""
            SELECT e.exam_id, e.exam_name 
            FROM exam e 
            LEFT JOIN question q ON e.exam_id = q.exam_id 
            WHERE e.created_by_teacher = %s AND e.is_archived = 0 AND q.question_id IS NULL AND e.status != 'completed'
        """, (user["user_id"],))
        empty_exams = cursor.fetchall()
        for e in empty_exams:
            alerts.append({
                "type": "warning", 
                "message": f"⚠️ Exam '{e['exam_name']}' has no questions.",
                "action": "add_questions",
                "exam_id": e["exam_id"]
            })

        # 2. Questions without options (less than 2)
        cursor.execute("""
            SELECT e.exam_id, e.exam_name, q.question_text
            FROM question q
            JOIN exam e ON q.exam_id = e.exam_id
            LEFT JOIN question_option qo ON q.question_id = qo.question_id
            WHERE e.created_by_teacher = %s AND e.is_archived = 0 AND e.status != 'completed'
            GROUP BY q.question_id
            HAVING COUNT(qo.option_id) < 2
        """, (user["user_id"],))
        invalid_questions = cursor.fetchall()
        for q in invalid_questions:
             q_text = (q['question_text'][:30] + '..') if len(q['question_text']) > 30 else q['question_text']
             alerts.append({
                 "type": "warning", 
                 "message": f"⚠️ Question '{q_text}' in '{q['exam_name']}' has insufficient options.",
                 "action": "add_questions",
                 "exam_id": q["exam_id"]
             })

        return {
            "subjects_count": subjects_count,
            "sections_count": sections_count,
            "total_exams_created": total_exams_created,
            "active_exams": active_exams,
            "upcoming_exams": upcoming_exams,
            "recent_exams": recent_exams,
            "upcoming_week_exams": upcoming_week_exams,
            "result_summary": result_summary,
            "pass_fail_distribution": pass_fail_distribution,
            "alerts": alerts
        }
    finally:
        cursor.close()
        conn.close()

# --- My Subjects ---
@router.get("/teacher/subjects")
def get_assigned_subjects(user=Depends(get_current_user)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Access denied")
    
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        # Get detailed assignment info with student counts
        query = """
            SELECT s.subject_id, s.subject_name, sec.section_id, sec.section_name, sec.batch_year, sec.semester, 
                   COUNT(st.student_id) as student_count
            FROM teaching_assignment ta
            JOIN subject s ON ta.subject_id = s.subject_id
            JOIN section sec ON ta.section_id = sec.section_id
            LEFT JOIN student st ON sec.section_id = st.section_id
            WHERE ta.teacher_id = %s
            GROUP BY ta.assignment_id
            ORDER BY s.subject_name, sec.semester, sec.section_name
        """
        cursor.execute(query, (user["user_id"],))
        return cursor.fetchall()
    finally:
        cursor.close()
        conn.close()

# --- My Sections ---
@router.get("/teacher/sections")
def get_assigned_sections(user=Depends(get_current_user)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Access denied")
    
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        # Get sections and student count using subquery to avoid duplicates
        query = """
            SELECT sec.section_id, sec.section_name, sec.batch_year, sec.semester, COUNT(st.student_id) as student_count
            FROM section sec
            LEFT JOIN student st ON sec.section_id = st.section_id
            WHERE sec.section_id IN (
                SELECT DISTINCT section_id FROM teaching_assignment WHERE teacher_id = %s
            )
            GROUP BY sec.section_id
            ORDER BY sec.semester, sec.section_name
        """
        cursor.execute(query, (user["user_id"],))
        return cursor.fetchall()
    finally:
        cursor.close()
        conn.close()

@router.get("/teacher/sections/{section_id}/students")
def get_section_students(section_id: int, user=Depends(get_current_user)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Access denied")
    
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        # Verify assignment
        cursor.execute("SELECT assignment_id FROM teaching_assignment WHERE teacher_id = %s AND section_id = %s", (user["user_id"], section_id))
        if not cursor.fetchone():
            raise HTTPException(status_code=403, detail="Access denied to this section")

        cursor.execute("SELECT student_id, name, usn, email FROM student WHERE section_id = %s ORDER BY name", (section_id,))
        return cursor.fetchall()
    finally:
        cursor.close()
        conn.close()

# --- Department Sections (For Filters) ---
@router.get("/teacher/department/sections")
def get_department_sections(user=Depends(get_current_user)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Access denied")
    
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT department_id FROM teacher WHERE teacher_id = %s", (user["user_id"],))
        dept_id = cursor.fetchone()["department_id"]

        cursor.execute("""
            SELECT section_id, section_name, batch_year, semester 
            FROM section 
            WHERE department_id = %s 
            ORDER BY semester, section_name
        """, (dept_id,))
        return cursor.fetchall()
    finally:
        cursor.close()
        conn.close()

# --- Create Exam ---
@router.post("/teacher/exams/create")
def create_exam_teacher(
    request: Request,
    exam_name: str = Body(...),
    subject_id: int = Body(...),
    duration: int = Body(...),
    total_marks: int = Body(...),
    exam_date: str = Body(...),
    section_ids: list[int] = Body(...),
    mode: str = Body("ONLINE"),
    lab_id: int = Body(None),
    password: str = Body(None),
    user=Depends(get_current_user),
):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Access denied")

    if total_marks <= 0:
        raise HTTPException(status_code=400, detail="Total marks must be greater than 0")
    if total_marks > 100:
        raise HTTPException(status_code=400, detail="Total marks cannot exceed 100")

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    try:
        # 1. Validate Assignment (Subject)
        cursor.execute("""
            SELECT assignment_id FROM teaching_assignment 
            WHERE teacher_id = %s AND subject_id = %s
        """, (user["user_id"], subject_id))
        if not cursor.fetchone():
            raise HTTPException(status_code=403, detail="You are not assigned to this subject")

        # 2. Validate Assignment (Sections)
        if not section_ids:
            raise HTTPException(status_code=400, detail="At least one section must be selected")

        format_strings = ','.join(['%s'] * len(section_ids))
        cursor.execute(f"SELECT COUNT(DISTINCT section_id) as count FROM teaching_assignment WHERE teacher_id = %s AND subject_id = %s AND section_id IN ({format_strings})", (user["user_id"], subject_id, *section_ids))
        count = cursor.fetchone()["count"]
        if count != len(set(section_ids)):
            raise HTTPException(status_code=403, detail="You are not assigned to one or more selected sections for this subject")

        # 3. Get Department ID (from teacher profile)
        cursor.execute("SELECT department_id FROM teacher WHERE teacher_id = %s", (user["user_id"],))
        dept_id = cursor.fetchone()["department_id"]

        # Ensure date is in correct format for MySQL (YYYY-MM-DD HH:MM:SS)
        formatted_date = exam_date.replace("T", " ")
        if len(formatted_date) == 16: formatted_date += ":00"

        # Prevent scheduling in the past
        exam_datetime = datetime.strptime(formatted_date, "%Y-%m-%d %H:%M:%S")
        if exam_datetime < datetime.now():
            raise HTTPException(status_code=400, detail="Cannot schedule an exam in the past.")

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
            password = None

        exam_scope = "SECTION" # Default for teachers

        # Check for overlapping exams in the selected sections
        overlap_format_strings = ','.join(['%s'] * len(section_ids))
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
        overlap_params = tuple(section_ids) + (formatted_date, duration, formatted_date)
        cursor.execute(overlap_query, overlap_params)
        overlaps = cursor.fetchall()
        
        if overlaps:
            overlap_details = ", ".join([f"'{o['exam_name']}' (Section {o['section_name']})" for o in overlaps])
            raise HTTPException(
                status_code=400, 
                detail=f"Time conflict! The selected sections already have exams scheduled during this time: {overlap_details}"
            )

        # 4. Insert Exam
        try:
            cursor.execute("""
                INSERT INTO exam (
                    exam_name, subject_id, date, duration, total_marks, status, 
                    created_by_teacher, department_id, exam_scope, mode, lab_id, password_hash
                ) VALUES (%s, %s, %s, %s, %s, 'scheduled', %s, %s, %s, %s, %s, %s)
            """, (exam_name, subject_id, formatted_date, duration, total_marks, user["user_id"], dept_id, exam_scope, mode, lab_id, hashed_password))
            
            new_exam_id = cursor.lastrowid
        except mysql.connector.IntegrityError:
            raise HTTPException(status_code=400, detail="Exam with this name already exists for this subject.")

        # 5. Assign Sections
        values = [(new_exam_id, sec_id, user["user_id"]) for sec_id in section_ids]
        cursor.executemany("INSERT INTO exam_section (exam_id, section_id, assigned_by_teacher) VALUES (%s, %s, %s)", values)

        log_action(user["user_id"], user["role"], dept_id, f"Created Exam: {exam_name}", "exam", new_exam_id, ip_address=request.client.host)
        log_teacher_action(user["user_id"], dept_id, f"Created Exam: {exam_name}", exam_id=new_exam_id, ip_address=request.client.host)

        conn.commit()
        return {"message": "Exam created successfully"}
    finally:
        cursor.close()
        conn.close()

# --- My Exams ---
@router.get("/teacher/exams")
def get_teacher_exams(
    subject_id: int = None,
    status: str = None,
    search: str = None,
    archived: bool = Query(False),
    user=Depends(get_current_user)
):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Access denied")
    
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

        query = """
            SELECT e.exam_id, e.exam_name, s.subject_name, e.date, e.mode,
                   CASE
                       WHEN e.status = 'completed' THEN 'completed'
                       WHEN NOW() > (e.date + INTERVAL e.duration MINUTE) THEN 'completed'
                       WHEN e.status = 'active' AND NOW() >= e.date THEN 'active'
                       ELSE 'scheduled'
                   END as status, e.total_marks, e.duration, e.subject_id,
                   COALESCE(GROUP_CONCAT(DISTINCT CONCAT(sec.section_name, ' (', sec.batch_year, ', Sem ', sec.semester, ')') SEPARATOR ', '), 'N/A') as sections,
                   GROUP_CONCAT(DISTINCT sec.section_id) as section_ids
            FROM exam e
            JOIN subject s ON e.subject_id = s.subject_id
            LEFT JOIN exam_section es ON e.exam_id = es.exam_id
            LEFT JOIN section sec ON es.section_id = sec.section_id
            WHERE e.created_by_teacher = %s AND e.is_archived = %s
        """
        params = [user["user_id"], 1 if archived else 0]

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

@router.put("/teacher/exams/{exam_id}/restore")
def restore_exam_teacher(exam_id: int, user=Depends(get_current_user)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Access denied")

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        # Verify Ownership (even if archived)
        cursor.execute("SELECT exam_id FROM exam WHERE exam_id = %s AND created_by_teacher = %s", (exam_id, user["user_id"]))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Exam not found or access denied")

        cursor.execute("UPDATE exam SET is_archived = 0 WHERE exam_id = %s", (exam_id,))
        conn.commit()
        return {"message": "Exam restored successfully"}
    finally:
        cursor.close()
        conn.close()

# --- Add Questions (Reuse logic but restricted) ---
# Note: We can reuse the admin add_question endpoint if we modify it to allow teachers who own the exam,
# OR create a specific one. For clarity and strict separation, I'll create a specific one here.

@router.post("/teacher/exams/add-question")
def add_question_teacher(
    exam_id: int = Body(...),
    question_text: str = Body(...),
    marks: float = Body(1.0),
    options: list = Body(...),
    user=Depends(get_current_user),
):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Access denied")

    if marks <= 0:
        raise HTTPException(status_code=400, detail="Marks must be greater than 0")

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        # Verify Ownership and Status
        cursor.execute("SELECT exam_id, status FROM exam WHERE exam_id = %s AND created_by_teacher = %s", (exam_id, user["user_id"]))
        exam = cursor.fetchone()
        if not exam:
            raise HTTPException(status_code=403, detail="You can only add questions to your own exams")

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

        if exam["status"] != "scheduled":
             raise HTTPException(status_code=400, detail="Exam is not in scheduled state. Editing not allowed.")

        # Check if question already exists
        cursor.execute("SELECT question_id FROM question WHERE exam_id = %s AND question_text = %s", (exam_id, question_text))
        if cursor.fetchone():
            raise HTTPException(status_code=400, detail="This question already exists in the exam.")

        # Insert Question
        cursor.execute("INSERT INTO question (exam_id, question_text, marks) VALUES (%s, %s, %s)", (exam_id, question_text, marks))
        question_id = cursor.lastrowid

        # Insert Options
        for opt in options:
            cursor.execute("INSERT INTO question_option (question_id, option_text, is_correct) VALUES (%s, %s, %s)", (question_id, opt["text"], opt["is_correct"]))
        
        conn.commit()
        return {"message": "Question added successfully"}
    except mysql.connector.IntegrityError as e:
        if "unique_option_per_question" in str(e):
             raise HTTPException(status_code=400, detail="Duplicate options detected for this question.")
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        cursor.close()
        conn.close()

@router.get("/teacher/exams/{exam_id}/questions")
def get_exam_questions_teacher(exam_id: int, user=Depends(get_current_user)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Access denied")

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        # Verify Ownership
        cursor.execute("SELECT total_marks FROM exam WHERE exam_id = %s AND created_by_teacher = %s", (exam_id, user["user_id"]))
        exam = cursor.fetchone()
        if not exam:
            raise HTTPException(status_code=403, detail="Access denied")

        # Get Questions
        cursor.execute("""
            SELECT q.question_id, q.question_text, q.marks, 
                   (SELECT option_text FROM question_option WHERE question_id = q.question_id AND is_correct = 1 LIMIT 1) as correct_option
            FROM question q WHERE q.exam_id = %s
        """, (exam_id,))
        questions = cursor.fetchall()

        # Calculate total marks used
        total_used = sum(q["marks"] for q in questions)

        return {
            "questions": questions,
            "exam_total_marks": exam["total_marks"],
            "total_marks_used": total_used
        }
    finally:
        cursor.close()
        conn.close()

@router.delete("/teacher/questions/{question_id}")
def delete_question_teacher(question_id: int, user=Depends(get_current_user)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Access denied")

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        # Verify Ownership via Exam
        cursor.execute(""" 
            SELECT q.question_id, e.status
            FROM question q
            JOIN exam e ON q.exam_id = e.exam_id
            WHERE q.question_id = %s AND e.created_by_teacher = %s
        """, (question_id, user["user_id"]))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=403, detail="Access denied")

        if row["status"] != "scheduled":
             raise HTTPException(status_code=400, detail="Exam is not in scheduled state. Deletion not allowed.")

        cursor.execute("DELETE FROM question WHERE question_id = %s", (question_id,))
        conn.commit()
        return {"message": "Question deleted successfully"}
    finally:
        cursor.close()
        conn.close()

@router.get("/teacher/questions/{question_id}")
def get_question_details_teacher(question_id: int, user=Depends(get_current_user)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Access denied")

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        # Verify ownership via exam
        cursor.execute("""
            SELECT q.question_id, q.question_text, q.marks, q.exam_id
            FROM question q
            JOIN exam e ON q.exam_id = e.exam_id
            WHERE q.question_id = %s AND e.created_by_teacher = %s
        """, (question_id, user["user_id"]))
        
        question = cursor.fetchone()
        if not question:
            raise HTTPException(status_code=404, detail="Question not found or access denied")

        # Fetch options
        cursor.execute("""
            SELECT option_id, option_text, is_correct 
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

@router.put("/teacher/questions/{question_id}")
def update_question_teacher(
    question_id: int,
    question_text: str = Body(...),
    marks: float = Body(...),
    options: list = Body(...),
    user=Depends(get_current_user)
):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Access denied")

    if marks <= 0:
        raise HTTPException(status_code=400, detail="Marks must be greater than 0")

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
        # Verify ownership and get exam date
        cursor.execute("""
            SELECT e.status FROM question q JOIN exam e ON q.exam_id = e.exam_id
            WHERE q.question_id = %s AND e.created_by_teacher = %s
        """, (question_id, user["user_id"]))
        exam = cursor.fetchone()
        if not exam:
            raise HTTPException(status_code=404, detail="Question not found or access denied")

        if exam["status"] != "scheduled":
             raise HTTPException(status_code=400, detail="Exam is not in scheduled state. Editing not allowed.")

        # Check if question text already exists (excluding current question)
        cursor.execute("SELECT question_id FROM question WHERE exam_id = (SELECT exam_id FROM question WHERE question_id = %s) AND question_text = %s AND question_id != %s", (question_id, question_text, question_id))
        if cursor.fetchone():
            raise HTTPException(status_code=400, detail="This question text already exists in the exam.")

        cursor.execute("UPDATE question SET question_text = %s, marks = %s WHERE question_id = %s", (question_text, marks, question_id))
        cursor.execute("DELETE FROM question_option WHERE question_id = %s", (question_id,))
        for opt in options:
            cursor.execute("INSERT INTO question_option (question_id, option_text, is_correct) VALUES (%s, %s, %s)", (question_id, opt["text"], opt["is_correct"]))
        conn.commit()
        return {"message": "Question updated successfully"}
    except mysql.connector.IntegrityError as e:
        if "unique_option_per_question" in str(e):
             raise HTTPException(status_code=400, detail="Duplicate options detected for this question.")
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        cursor.close()
        conn.close()

@router.get("/teacher/results")
def get_teacher_results(
    semester: int = None,
    section_id: int = None,
    search: str = None,
    user=Depends(get_current_user)
):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Access denied")

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        query = """
            SELECT 
                r.result_id, 
                s.name AS student_name, 
                s.usn, 
                sec.section_name, 
                sec.semester,
                e.exam_name, 
                sub.subject_name, 
                r.total_marks AS obtained_marks, 
                e.total_marks AS max_marks, 
                r.result_status,
                r.generated_time
            FROM result r
            JOIN student s ON r.student_id = s.student_id
            JOIN section sec ON s.section_id = sec.section_id
            JOIN exam e ON r.exam_id = e.exam_id
            JOIN subject sub ON e.subject_id = sub.subject_id
            WHERE e.created_by_teacher = %s
        """
        params = [user["user_id"]]

        if semester:
            query += " AND sec.semester = %s"
            params.append(semester)
        if section_id:
            query += " AND s.section_id = %s"
            params.append(section_id)
        if search:
            query += " AND (s.name LIKE %s OR s.usn LIKE %s OR e.exam_name LIKE %s)"
            params.extend([f"%{search}%", f"%{search}%", f"%{search}%"])
            
        query += " ORDER BY r.generated_time DESC LIMIT 100"
        
        cursor.execute(query, tuple(params))
        return cursor.fetchall()
    finally:
        cursor.close()
        conn.close()

# --- Teacher Activity Logs ---
@router.get("/teacher/activity-logs")
def get_teacher_activity_logs(
    page: int = 1,
    limit: int = 20,
    start_date: str = Query(None),
    end_date: str = Query(None),
    exam_id: int = Query(None),
    section_id: int = Query(None),
    user=Depends(get_current_user)
):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Access denied")

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        # Base WHERE clause
        where_clauses = ["tal.teacher_id = %s"]
        params = [user["user_id"]]

        if start_date:
            where_clauses.append("tal.created_at >= %s")
            params.append(start_date)
        if end_date:
            where_clauses.append("tal.created_at <= %s")
            params.append(end_date)
        if exam_id:
            where_clauses.append("tal.exam_id = %s")
            params.append(exam_id)
        if section_id:
            where_clauses.append("tal.section_id = %s")
            params.append(section_id)

        where_str = "WHERE " + " AND ".join(where_clauses)

        # Count total
        cursor.execute(f"SELECT COUNT(*) as total FROM teacher_activity_logs tal {where_str}", tuple(params))
        total = cursor.fetchone()["total"]

        # Fetch logs with joins for names
        query = f"""
            SELECT tal.*, e.exam_name, s.name as student_name, sec.section_name, sec.semester, sec.batch_year,
            (
                SELECT GROUP_CONCAT(CONCAT(s2.section_name, ' (Sem ', s2.semester, ')') SEPARATOR ', ')
                FROM exam_section es
                JOIN section s2 ON es.section_id = s2.section_id
                WHERE es.exam_id = tal.exam_id
            ) as exam_sections
            FROM teacher_activity_logs tal
            LEFT JOIN exam e ON tal.exam_id = e.exam_id
            LEFT JOIN student s ON tal.student_id = s.student_id
            LEFT JOIN section sec ON tal.section_id = sec.section_id
            {where_str}
            ORDER BY tal.created_at DESC
            LIMIT %s OFFSET %s
        """
        params.extend([limit, (page - 1) * limit])
        cursor.execute(query, tuple(params))
        logs = cursor.fetchall()

        return {
            "logs": logs,
            "total": total,
            "page": page,
            "total_pages": (total + limit - 1) // limit
        }
    finally:
        cursor.close()
        conn.close()

# --- View Attempts ---
@router.get("/teacher/exams/{exam_id}/attempts")
def get_exam_attempts(exam_id: int, user=Depends(get_current_user)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Access denied")

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        # Verify Ownership
        cursor.execute("SELECT exam_id FROM exam WHERE exam_id = %s AND created_by_teacher = %s", (exam_id, user["user_id"]))
        if not cursor.fetchone():
            raise HTTPException(status_code=403, detail="Access denied")

        # Fetch Results
        cursor.execute("""
            SELECT r.result_id, s.student_id, s.name as student_name, s.usn, sec.section_name, r.total_marks, r.result_status, r.generated_time
            FROM result r
            JOIN student s ON r.student_id = s.student_id
            JOIN section sec ON s.section_id = sec.section_id
            WHERE r.exam_id = %s
            ORDER BY r.total_marks DESC
        """, (exam_id,))
        return cursor.fetchall()
    finally:
        cursor.close()
        conn.close()

# --- Publish Exam ---
@router.post("/teacher/exams/{exam_id}/publish")
def publish_exam_teacher(exam_id: int, request: Request, user=Depends(get_current_user)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Access denied")

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        # Verify Ownership
        cursor.execute("SELECT * FROM exam WHERE exam_id = %s AND created_by_teacher = %s", (exam_id, user["user_id"]))
        exam = cursor.fetchone()
        if not exam:
            raise HTTPException(status_code=403, detail="Access denied")

        # Center-based check: Ensure all students have PCs assigned
        if exam['mode'] == 'CENTER':
            cursor.execute("""
                SELECT COUNT(DISTINCT s.student_id) as total_students
                FROM student s
                JOIN exam_section es ON s.section_id = es.section_id
                WHERE es.exam_id = %s
            """, (exam_id,))
            total_students = cursor.fetchone()["total_students"] or 0
            
            cursor.execute("SELECT COUNT(DISTINCT student_id) as assigned_pcs FROM student_pc_assignment WHERE exam_id = %s", (exam_id,))
            assigned_pcs = cursor.fetchone()["assigned_pcs"] or 0
            
            if total_students > 0 and assigned_pcs < total_students:
                raise HTTPException(status_code=400, detail=f"Cannot publish Center-based exam: Only {assigned_pcs} out of {total_students} students have been assigned PCs.")

        # Validate Questions exist and get marks
        cursor.execute("SELECT COUNT(*) as q_count, SUM(marks) as total_q_marks FROM question WHERE exam_id = %s", (exam_id,))
        result = cursor.fetchone()
        q_count = result["q_count"] or 0
        total_q_marks = result["total_q_marks"] or 0

        if q_count == 0:
            raise HTTPException(status_code=400, detail="Cannot publish an exam without any questions.")

        # Validate sufficient options per question
        cursor.execute("""
            SELECT q.question_id
            FROM question q
            LEFT JOIN question_option qo ON q.question_id = qo.question_id
            WHERE q.exam_id = %s
            GROUP BY q.question_id
            HAVING COUNT(qo.option_id) < 2
        """, (exam_id,))
        if cursor.fetchone():
            raise HTTPException(status_code=400, detail="Cannot publish: One or more questions have insufficient options (minimum 2 required).")

        # Validate Marks Mismatch
        if abs(float(total_q_marks) - float(exam["total_marks"])) > 0.01:
            raise HTTPException(
                status_code=400, 
                detail=f"Marks mismatch! Exam Total: {exam['total_marks']}, Questions Total: {total_q_marks}."
            )

        # Update status and set start time to now for instant publishing
        cursor.execute("UPDATE exam SET status = 'active', date = NOW() WHERE exam_id = %s", (exam_id,))

        log_action(user["user_id"], user["role"], exam["department_id"], f"Published Exam ID: {exam_id}", "exam", exam_id, ip_address=request.client.host)
        log_teacher_action(user["user_id"], exam["department_id"], f"Published Exam ID: {exam_id}", exam_id=exam_id, ip_address=request.client.host)
        conn.commit()
        return {"message": "Exam published successfully"}
    finally:
        cursor.close()
        conn.close()

@router.delete("/teacher/exams/{exam_id}")
def delete_exam_teacher(exam_id: int, user=Depends(get_current_user)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Access denied")

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        # Verify Ownership
        cursor.execute("SELECT status FROM exam WHERE exam_id = %s AND created_by_teacher = %s", (exam_id, user["user_id"]))
        exam = cursor.fetchone()
        if not exam:
            raise HTTPException(status_code=404, detail="Exam not found or access denied")
        
        if exam["status"] == "active":
             raise HTTPException(status_code=400, detail="Cannot delete an active exam. Close it first.")

        cursor.execute("UPDATE exam SET is_archived = 1 WHERE exam_id = %s", (exam_id,))
        conn.commit()

        # We don't have department_id here, might need to fetch it before deleting if we want to log this.
        return {"message": "Exam archived successfully"}
    finally:
        cursor.close()
        conn.close()

@router.get("/teacher/exams/{exam_id}")
def get_exam_details_teacher(exam_id: int, user=Depends(get_current_user)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Access denied")
    
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        # Verify Ownership
        cursor.execute("""
            SELECT e.*, 
                   GROUP_CONCAT(es.section_id) as assigned_section_ids
            FROM exam e
            LEFT JOIN exam_section es ON e.exam_id = es.exam_id
            WHERE e.exam_id = %s AND e.created_by_teacher = %s
            GROUP BY e.exam_id
        """, (exam_id, user["user_id"]))
        
        exam = cursor.fetchone()
        if not exam:
            raise HTTPException(status_code=404, detail="Exam not found")
            
        # Convert comma-separated string to list of ints
        if exam["assigned_section_ids"]:
            exam["section_ids"] = [int(x) for x in exam["assigned_section_ids"].split(",")]
        else:
            exam["section_ids"] = []
            
        return exam
    finally:
        cursor.close()
        conn.close()

@router.put("/teacher/exams/{exam_id}")
def update_exam_teacher(
    exam_id: int,
    request: Request,
    exam_name: str = Body(...),
    subject_id: int = Body(...),
    duration: int = Body(...),
    total_marks: int = Body(...),
    exam_date: str = Body(...),
    section_ids: list[int] = Body(...),
    mode: str = Body("ONLINE"),
    lab_id: int = Body(None),
    password: str = Body(None),
    user=Depends(get_current_user),
):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Access denied")

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    try:
        # Verify Ownership and Status
        cursor.execute("SELECT status FROM exam WHERE exam_id = %s AND created_by_teacher = %s", (exam_id, user["user_id"]))
        exam = cursor.fetchone()
        if not exam:
            raise HTTPException(status_code=404, detail="Exam not found or access denied")
        
        if exam["status"] == "active":
             raise HTTPException(status_code=400, detail="Cannot edit an active exam.")

        # Get Department ID
        cursor.execute("SELECT department_id FROM teacher WHERE teacher_id = %s", (user["user_id"],))
        dept_id = cursor.fetchone()["department_id"]

        formatted_date = exam_date.replace("T", " ") if "T" in exam_date else exam_date
        if len(formatted_date) == 16: formatted_date += ":00"

        # Prevent scheduling in the past
        exam_datetime = datetime.strptime(formatted_date, "%Y-%m-%d %H:%M:%S")
        if exam_datetime < datetime.now():
            raise HTTPException(status_code=400, detail="Cannot schedule an exam in the past.")
            
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
            password = None

        # Check for overlapping exams in the selected sections (excluding current exam)
        overlap_format_strings = ','.join(['%s'] * len(section_ids))
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
        overlap_params = tuple(section_ids) + (exam_id, formatted_date, duration, formatted_date)
        cursor.execute(overlap_query, overlap_params)
        overlaps = cursor.fetchall()
        
        if overlaps:
            overlap_details = ", ".join([f"'{o['exam_name']}' (Section {o['section_name']})" for o in overlaps])
            raise HTTPException(
                status_code=400, 
                detail=f"Time conflict! The selected sections already have exams scheduled during this time: {overlap_details}"
            )

        # Update Exam
        cursor.execute("""
            UPDATE exam SET 
                exam_name=%s, subject_id=%s, date=%s, duration=%s, total_marks=%s,
                mode=%s, lab_id=%s, password_hash=%s
            WHERE exam_id=%s
        """, (exam_name, subject_id, formatted_date, duration, total_marks, mode, lab_id, hashed_password, exam_id))

        # Update Sections (Delete old, insert new)
        cursor.execute("DELETE FROM exam_section WHERE exam_id = %s", (exam_id,))
        values = [(exam_id, sec_id, user["user_id"]) for sec_id in section_ids]
        cursor.executemany("INSERT INTO exam_section (exam_id, section_id, assigned_by_teacher) VALUES (%s, %s, %s)", values)

        log_action(user["user_id"], user["role"], dept_id, f"Updated Exam: {exam_name}", "exam", exam_id, ip_address=request.client.host)
        log_teacher_action(user["user_id"], dept_id, f"Updated Exam: {exam_name}", exam_id=exam_id, ip_address=request.client.host)

        conn.commit()
        return {"message": "Exam updated successfully"}
    finally:
        cursor.close()
        conn.close()

# --- Teacher Violations ---
@router.get("/teacher/violations/stats")
def get_teacher_violation_stats(status: str = Query(None), exam_search: str = Query(None), violation_type: str = Query(None), user=Depends(get_current_user)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Access denied")

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        # Base filter: Violations for exams created by this teacher
        base_where = "e.created_by_teacher = %s"
        params = [user["user_id"]]
        
        if status:
            base_where += " AND v.review_status = %s"
            params.append(status)
        if exam_search:
            base_where += " AND e.exam_name LIKE %s"
            params.append(f"%{exam_search}%")
        if violation_type:
            base_where += " AND v.violation_type = %s"
            params.append(violation_type)

        stats = {}
        
        # 1. Summary Cards
        cursor.execute(f"""
            SELECT COUNT(v.violation_id) as c 
            FROM violation v
            JOIN exam e ON v.exam_id = e.exam_id
            WHERE {base_where} AND DATE(v.detected_at) = CURDATE()
        """, tuple(params))
        stats["today"] = cursor.fetchone()["c"]
        
        cursor.execute(f"""
            SELECT COUNT(v.violation_id) as c 
            FROM violation v
            JOIN exam e ON v.exam_id = e.exam_id
            WHERE {base_where} AND YEARWEEK(v.detected_at, 1) = YEARWEEK(CURDATE(), 1)
        """, tuple(params))
        stats["week"] = cursor.fetchone()["c"]
        
        cursor.execute(f"""
            SELECT COUNT(DISTINCT v.student_id) as c 
            FROM violation v
            JOIN exam e ON v.exam_id = e.exam_id
            WHERE {base_where}
        """, tuple(params))
        stats["students_flagged"] = cursor.fetchone()["c"]

        # 2. Recent Violations (respects status filter)
        cursor.execute(f"""
            SELECT v.violation_id, s.name, s.usn, e.exam_name, v.violation_type, v.detected_at as timestamp, v.review_status
            FROM violation v 
            JOIN student s ON v.student_id = s.student_id 
            JOIN exam e ON v.exam_id = e.exam_id 
            WHERE {base_where}
            ORDER BY v.detected_at DESC LIMIT 20
        """, tuple(params))
        stats["recent"] = cursor.fetchall()

        return stats
    finally:
        cursor.close()
        conn.close()

@router.get("/teacher/violations/history")
def get_teacher_violation_history(
    page: int = 1,
    limit: int = 20,
    status: str = Query(None),
    exam_search: str = Query(None),
    search: str = Query(None),
    start_date: str = Query(None),
    end_date: str = Query(None),
    violation_type: str = Query(None),
    user=Depends(get_current_user)
):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Access denied")
    
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        base_query = """
            FROM violation v
            JOIN student s ON v.student_id = s.student_id
            JOIN exam e ON v.exam_id = e.exam_id
            WHERE e.created_by_teacher = %s
        """
        params = [user["user_id"]]

        if status:
            base_query += " AND v.review_status = %s"
            params.append(status)
        if exam_search:
            base_query += " AND e.exam_name LIKE %s"
            params.append(f"%{exam_search}%")
        if start_date:
            base_query += " AND DATE(v.detected_at) >= %s"
            params.append(start_date)
        if end_date:
            base_query += " AND DATE(v.detected_at) <= %s"
            params.append(end_date)
        if violation_type:
            base_query += " AND v.violation_type = %s"
            params.append(violation_type)
        if search:
            base_query += " AND (s.name LIKE %s OR s.usn LIKE %s OR v.violation_type LIKE %s)"
            params.extend([f"%{search}%", f"%{search}%", f"%{search}%"])

        # Count
        cursor.execute(f"SELECT COUNT(*) as total {base_query}", tuple(params))
        total = cursor.fetchone()["total"]

        # Fetch
        query = f"""
            SELECT v.violation_id, s.name as student_name, s.usn, e.exam_name, 
                   v.violation_type, v.detected_at as timestamp, v.review_status, v.remarks
            {base_query}
            ORDER BY v.detected_at DESC
            LIMIT %s OFFSET %s
        """
        params.extend([limit, (page - 1) * limit])
        cursor.execute(query, tuple(params))
        history = cursor.fetchall()

        return {
            "history": history,
            "total": total,
            "page": page,
            "total_pages": (total + limit - 1) // limit
        }
    finally:
        cursor.close()
        conn.close()

@router.get("/teacher/violations/{violation_id}")
def get_violation_details_teacher(violation_id: int, user=Depends(get_current_user)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Access denied")
    
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("""
            SELECT v.*, s.name as student_name, s.usn, e.exam_name, q.question_text
            FROM violation v
            JOIN student s ON v.student_id = s.student_id
            JOIN exam e ON v.exam_id = e.exam_id
            LEFT JOIN question q ON v.question_id = q.question_id
            WHERE v.violation_id = %s AND e.created_by_teacher = %s
        """, (violation_id, user["user_id"]))
        
        violation = cursor.fetchone()
        if not violation:
            raise HTTPException(status_code=404, detail="Violation not found or access denied")
            
        # Fetch Evidence
        cursor.execute("SELECT * FROM evidence WHERE violation_id = %s", (violation_id,))
        violation["evidence"] = cursor.fetchall()

        return violation
    finally:
        cursor.close()
        conn.close()

@router.put("/teacher/violations/{violation_id}/resolve")
def resolve_violation_teacher(
    violation_id: int, 
    request: Request,
    status: str = Body(...), 
    remarks: str = Body(None),
    user=Depends(get_current_user)
):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Access denied")
    
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        # Fetch details first for logging and verification
        cursor.execute("""
            SELECT v.review_status, v.student_id, v.exam_id, v.question_id, e.department_id, s.name as student_name, s.usn
            FROM violation v 
            JOIN exam e ON v.exam_id = e.exam_id 
            JOIN student s ON v.student_id = s.student_id
            WHERE v.violation_id = %s AND e.created_by_teacher = %s
        """, (violation_id, user["user_id"]))
        
        details = cursor.fetchone()
        
        if not details:
             raise HTTPException(status_code=404, detail="Violation not found or access denied")
             
        if details["review_status"] in ["Resolved", "Dismissed"]:
             raise HTTPException(status_code=403, detail="Decision has already been finalized and cannot be changed by a teacher.")

        # Update Violation
        cursor.execute("""
            UPDATE violation 
            SET review_status = %s, remarks = %s, reviewed_by_teacher = %s, reviewed_at = NOW()
            WHERE violation_id = %s
        """, (status, remarks, user["user_id"], violation_id))
        
        # --- MARKS PENALTY LOGIC ---
        if details.get("question_id"):
            q_id = details["question_id"]
            s_id = details["student_id"]
            e_id = details["exam_id"]
            
            if status == 'Resolved':
                cursor.execute("""
                    UPDATE answer SET marks_awarded = 0 
                    WHERE student_id = %s AND exam_id = %s AND question_id = %s
                """, (s_id, e_id, q_id))
            elif status == 'Dismissed':
                # Ensure there are no OTHER active 'Resolved' violations for this same question before restoring marks
                cursor.execute("""
                    SELECT COUNT(*) as c FROM violation 
                    WHERE student_id = %s AND exam_id = %s AND question_id = %s AND review_status = 'Resolved' AND violation_id != %s
                """, (s_id, e_id, q_id, violation_id))
                if cursor.fetchone()["c"] == 0:
                    cursor.execute("""
                        UPDATE answer a
                        JOIN question_option qo ON a.selected_option_id = qo.option_id
                        JOIN question q ON a.question_id = q.question_id
                        SET a.marks_awarded = CASE WHEN qo.is_correct = 1 THEN q.marks ELSE 0 END
                        WHERE a.student_id = %s AND a.exam_id = %s AND a.question_id = %s
                    """, (s_id, e_id, q_id))
            
            # Recalculate and save Total Result Marks
            cursor.execute("""
                UPDATE result r
                SET r.total_marks = (SELECT COALESCE(SUM(marks_awarded), 0) FROM answer WHERE student_id = %s AND exam_id = %s)
                WHERE r.student_id = %s AND r.exam_id = %s
            """, (s_id, e_id, s_id, e_id))

        # Auto-flag High Risk Student
        if status == 'Resolved':
            student_id = details["student_id"]
            cursor.execute("SELECT COUNT(*) as count FROM violation WHERE student_id = %s AND review_status = 'Resolved'", (student_id,))
            count = cursor.fetchone()["count"]
            if count > 3:
                cursor.execute("UPDATE student SET risk_status = 'High Risk' WHERE student_id = %s", (student_id,))

        # Log Action with Student ID
        log_teacher_action(
            user["user_id"], 
            details["department_id"], 
            f"Resolved Violation: {status} for {details['student_name']} ({details['usn']})", 
            exam_id=details["exam_id"], 
            student_id=details["student_id"],
            ip_address=request.client.host
        )

        conn.commit()
        return {"message": f"Violation marked as {status}"}
    finally:
        cursor.close()
        conn.close()

# --- Real-Time Monitoring ---
@router.get("/teacher/exams/{exam_id}/monitor")
def monitor_exam(exam_id: int, user=Depends(get_current_user)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Access denied")
    
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        # Verify ownership
        cursor.execute("SELECT exam_name FROM exam WHERE exam_id = %s AND created_by_teacher = %s", (exam_id, user["user_id"]))
        exam = cursor.fetchone()
        if not exam:
            raise HTTPException(status_code=404, detail="Exam not found")

        # 1. Students Assigned (via sections)
        cursor.execute("SELECT section_id FROM exam_section WHERE exam_id = %s", (exam_id,))
        sections = cursor.fetchall()
        section_ids = [s["section_id"] for s in sections]
        
        all_students = []
        if section_ids:
            format_strings = ','.join(['%s'] * len(section_ids))
            cursor.execute(f"SELECT student_id, name, usn FROM student WHERE section_id IN ({format_strings}) ORDER BY name", tuple(section_ids))
            all_students = cursor.fetchall()
        
        # 2. Attempts
        cursor.execute("SELECT student_id, status FROM attempt WHERE exam_id = %s", (exam_id,))
        attempts = {a["student_id"]: a["status"] for a in cursor.fetchall()}

        # 3. Violations
        cursor.execute("SELECT student_id, COUNT(*) as v_count FROM violation WHERE exam_id = %s GROUP BY student_id", (exam_id,))
        violations = {v["student_id"]: v["v_count"] for v in cursor.fetchall()}

        student_list = []
        stats = {"assigned": len(all_students), "started": 0, "submitted": 0, "writing": 0}

        for s in all_students:
            sid = s["student_id"]
            status = attempts.get(sid, "Not Started")
            v_count = violations.get(sid, 0)
            
            if status == "IN_PROGRESS":
                stats["writing"] += 1
                stats["started"] += 1
            elif status == "COMPLETED":
                stats["submitted"] += 1
                stats["started"] += 1
            
            student_list.append({
                "name": s["name"],
                "usn": s["usn"],
                "status": status,
                "violations": v_count
            })

        return {
            "exam_name": exam["exam_name"],
            "stats": stats,
            "students": student_list
        }
    finally:
        cursor.close()
        conn.close()

# --- Exam Analytics ---
@router.get("/teacher/exams/{exam_id}/analytics")
def get_exam_analytics(exam_id: int, user=Depends(get_current_user)):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Access denied")

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        # Verify ownership
        cursor.execute("SELECT exam_name, total_marks FROM exam WHERE exam_id = %s AND created_by_teacher = %s", (exam_id, user["user_id"]))
        exam = cursor.fetchone()
        if not exam:
            raise HTTPException(status_code=404, detail="Exam not found")

        # 1. Score Distribution & Pass/Fail
        cursor.execute("""
            SELECT total_marks 
            FROM result 
            WHERE exam_id = %s
        """, (exam_id,))
        results = cursor.fetchall()

        scores = [r["total_marks"] for r in results]
        total_attempts = len(scores)
        
        distribution = {
            "90-100%": 0, "80-89%": 0, "70-79%": 0, "60-69%": 0, "<60%": 0
        }
        pass_count = 0
        fail_count = 0

        max_marks = exam["total_marks"]

        for score in scores:
            percentage = (score / max_marks) * 100 if max_marks > 0 else 0
            
            if percentage >= 90: distribution["90-100%"] += 1
            elif percentage >= 80: distribution["80-89%"] += 1
            elif percentage >= 70: distribution["70-79%"] += 1
            elif percentage >= 60: distribution["60-69%"] += 1
            else: distribution["<60%"] += 1

            if percentage >= 40: pass_count += 1
            else: fail_count += 1

        # 2. Question Difficulty
        cursor.execute("""
            SELECT q.question_id, q.question_text, q.marks,
                   COUNT(a.answer_id) as total_answers,
                   SUM(CASE WHEN a.marks_awarded > 0 THEN 1 ELSE 0 END) as correct_answers
            FROM question q
            LEFT JOIN answer a ON q.question_id = a.question_id
            WHERE q.exam_id = %s
            GROUP BY q.question_id
        """, (exam_id,))
        questions = cursor.fetchall()

        question_stats = []
        for q in questions:
            total = q["total_answers"]
            correct = q["correct_answers"] or 0
            percentage = (correct / total * 100) if total > 0 else 0
            question_stats.append({
                "text": q["question_text"],
                "correct_percentage": round(percentage, 1)
            })

        return {
            "exam_name": exam["exam_name"],
            "total_attempts": total_attempts,
            "distribution": distribution,
            "pass_fail": {"pass": pass_count, "fail": fail_count},
            "question_stats": question_stats
        }
    finally:
        cursor.close()
        conn.close()

@router.post("/teacher/exams/{exam_id}/re-exam/class")
def create_reexam_class_teacher(
    exam_id: int,
    request: Request,
    exam_date: str = Body(...),
    duration: int = Body(...),
    user=Depends(get_current_user)
):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Access denied")

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        # Fetch original exam
        cursor.execute("SELECT * FROM exam WHERE exam_id = %s AND created_by_teacher = %s", (exam_id, user["user_id"]))
        original = cursor.fetchone()
        if not original:
            raise HTTPException(status_code=404, detail="Original exam not found or access denied")

        formatted_date = exam_date.replace("T", " ")
        if len(formatted_date) == 16: formatted_date += ":00"

        # Prevent scheduling in the past
        exam_datetime = datetime.strptime(formatted_date, "%Y-%m-%d %H:%M:%S")
        if exam_datetime < datetime.now():
            raise HTTPException(status_code=400, detail="Cannot schedule a re-exam in the past.")
        new_name = f"Retake: {original['exam_name']}"

        # Create new exam instance
        cursor.execute("""
            INSERT INTO exam (
                exam_name, subject_id, date, duration, total_marks, status, 
                created_by_teacher, department_id, exam_scope, batch_year, semester, 
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
        if sections:
            values = [(new_exam_id, s['section_id'], user["user_id"]) for s in sections]
            cursor.executemany("INSERT INTO exam_section (exam_id, section_id, assigned_by_teacher) VALUES (%s, %s, %s)", values)

        # Copy Questions
        cursor.execute("SELECT * FROM question WHERE exam_id = %s", (exam_id,))
        questions = cursor.fetchall()
        for q in questions:
            cursor.execute("INSERT INTO question (exam_id, question_text, marks, question_type) VALUES (%s, %s, %s, %s)", 
                           (new_exam_id, q['question_text'], q['marks'], q['question_type']))
            new_q_id = cursor.lastrowid
            
            cursor.execute("SELECT * FROM question_option WHERE question_id = %s", (q['question_id'],))
            options = cursor.fetchall()
            if options:
                opt_values = [(new_q_id, o['option_text'], o['is_correct']) for o in options]
                cursor.executemany("INSERT INTO question_option (question_id, option_text, is_correct) VALUES (%s, %s, %s)", opt_values)

        log_teacher_action(user["user_id"], original['department_id'], f"Created Class Re-Exam: {new_name}", exam_id=new_exam_id, ip_address=request.client.host)
        conn.commit()
        return {"message": "Class Re-Exam created successfully"}
    finally:
        cursor.close()
        conn.close()

@router.post("/teacher/exams/{exam_id}/re-exam/students")
def create_reexam_students_teacher(
    exam_id: int,
    request: Request,
    student_ids: list[int] = Body(...),
    exam_date: str = Body(...),
    duration: int = Body(...),
    user=Depends(get_current_user)
):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Access denied")

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        formatted_date = exam_date.replace("T", " ")
        if len(formatted_date) == 16: formatted_date += ":00"
        
        # Prevent scheduling in the past
        exam_datetime = datetime.strptime(formatted_date, "%Y-%m-%d %H:%M:%S")
        if exam_datetime < datetime.now():
            raise HTTPException(status_code=400, detail="Cannot schedule a re-exam in the past.")
        
        # Verify exam exists
        cursor.execute("SELECT department_id FROM exam WHERE exam_id = %s AND created_by_teacher = %s", (exam_id, user["user_id"]))
        exam = cursor.fetchone()
        if not exam:
             raise HTTPException(status_code=404, detail="Exam not found or access denied")

        # Insert into exam_retake
        values = [(exam_id, sid, formatted_date, duration, user["user_id"], 'scheduled') for sid in student_ids]
        cursor.executemany("""
            INSERT INTO exam_retake (exam_id, student_id, retake_date, retake_duration, created_by, status)
            VALUES (%s, %s, %s, %s, %s, %s)
        """, values)

        log_teacher_action(user["user_id"], exam['department_id'], f"Scheduled Student Re-Exam for {len(student_ids)} students", exam_id=exam_id, ip_address=request.client.host)
        conn.commit()
        return {"message": "Student Re-Exams scheduled successfully"}
    finally:
        cursor.close()
        conn.close()