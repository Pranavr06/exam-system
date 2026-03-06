from fastapi import APIRouter, Depends, HTTPException, Body, Query, Request
from db import get_connection
from security import get_current_user
from .system_logger import log_action, log_teacher_action
import mysql.connector

router = APIRouter()

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
        # Total Assigned Subjects
        cursor.execute("SELECT COUNT(DISTINCT subject_id) as count FROM teaching_assignment WHERE teacher_id = %s", (user["user_id"],))
        subjects_count = cursor.fetchone()["count"]

        # Total Sections
        cursor.execute("SELECT COUNT(DISTINCT section_id) as count FROM teaching_assignment WHERE teacher_id = %s", (user["user_id"],))
        sections_count = cursor.fetchone()["count"]

        # Active Exams
        cursor.execute("SELECT COUNT(*) as count FROM exam WHERE created_by_teacher = %s AND status = 'active'", (user["user_id"],))
        active_exams = cursor.fetchone()["count"]

        # Upcoming Exams (Scheduled)
        cursor.execute("SELECT COUNT(*) as count FROM exam WHERE created_by_teacher = %s AND status = 'scheduled'", (user["user_id"],))
        upcoming_exams = cursor.fetchone()["count"]

        # Recent Exams (Last 5 created)
        cursor.execute("""
            SELECT e.exam_name, s.subject_name, e.date, 
                   CASE
                       WHEN e.status = 'completed' THEN 'completed'
                       WHEN NOW() > (e.date + INTERVAL e.duration MINUTE) THEN 'completed'
                       ELSE e.status
                   END as status, e.exam_id,
                   GROUP_CONCAT(DISTINCT CONCAT(sec.section_name, ' (', sec.batch_year, ', Sem ', sec.semester, ')') SEPARATOR ', ') as sections
            FROM exam e
            JOIN subject s ON e.subject_id = s.subject_id
            LEFT JOIN exam_section es ON e.exam_id = es.exam_id
            LEFT JOIN section sec ON es.section_id = sec.section_id
            WHERE e.created_by_teacher = %s
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

        return {
            "subjects_count": subjects_count,
            "sections_count": sections_count,
            "active_exams": active_exams,
            "upcoming_exams": upcoming_exams,
            "recent_exams": recent_exams,
            "upcoming_week_exams": upcoming_week_exams,
            "result_summary": result_summary,
            "pass_fail_distribution": pass_fail_distribution
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

        exam_scope = "SECTION" # Default for teachers

        # 4. Insert Exam
        try:
            cursor.execute("""
                INSERT INTO exam (
                    exam_name, subject_id, date, duration, total_marks, status, 
                    created_by_teacher, department_id, exam_scope
                ) VALUES (%s, %s, %s, %s, %s, 'scheduled', %s, %s, %s)
            """, (exam_name, subject_id, formatted_date, duration, total_marks, user["user_id"], dept_id, exam_scope))
            
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
    user=Depends(get_current_user)
):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Access denied")
    
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        query = """
            SELECT e.exam_id, e.exam_name, s.subject_name, e.date, 
                   CASE
                       WHEN e.status = 'completed' THEN 'completed'
                       WHEN NOW() > (e.date + INTERVAL e.duration MINUTE) THEN 'completed'
                       ELSE e.status
                   END as status, e.total_marks, e.duration, e.subject_id,
                   COALESCE(GROUP_CONCAT(DISTINCT CONCAT(sec.section_name, ' (', sec.batch_year, ', Sem ', sec.semester, ')') SEPARATOR ', '), 'N/A') as sections,
                   GROUP_CONCAT(DISTINCT sec.section_id) as section_ids
            FROM exam e
            JOIN subject s ON e.subject_id = s.subject_id
            LEFT JOIN exam_section es ON e.exam_id = es.exam_id
            LEFT JOIN section sec ON es.section_id = sec.section_id
            WHERE e.created_by_teacher = %s
        """
        params = [user["user_id"]]

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
        cursor.execute("SELECT exam_id, date FROM exam WHERE exam_id = %s AND created_by_teacher = %s", (exam_id, user["user_id"]))
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

        # Check if exam has started (simple check against current time, assuming DB time is UTC or consistent)
        # In production, use proper timezone handling.
        cursor.execute("SELECT NOW() as server_time")
        server_time = cursor.fetchone()["server_time"]
        if server_time >= exam["date"]:
             raise HTTPException(status_code=400, detail="Exam already started. Editing not allowed.")

        # Insert Question
        cursor.execute("INSERT INTO question (exam_id, question_text, marks) VALUES (%s, %s, %s)", (exam_id, question_text, marks))
        question_id = cursor.lastrowid

        # Insert Options
        for opt in options:
            cursor.execute("INSERT INTO question_option (question_id, option_text, is_correct) VALUES (%s, %s, %s)", (question_id, opt["text"], opt["is_correct"]))
        
        conn.commit()
        return {"message": "Question added successfully"}
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
            SELECT q.question_id, e.date
            FROM question q
            JOIN exam e ON q.exam_id = e.exam_id
            WHERE q.question_id = %s AND e.created_by_teacher = %s
        """, (question_id, user["user_id"]))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=403, detail="Access denied")

        cursor.execute("SELECT NOW() as server_time")
        if cursor.fetchone()["server_time"] >= row["date"]:
             raise HTTPException(status_code=400, detail="Exam already started. Deletion not allowed.")

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

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        # Verify ownership and get exam date
        cursor.execute("""
            SELECT e.date FROM question q JOIN exam e ON q.exam_id = e.exam_id
            WHERE q.question_id = %s AND e.created_by_teacher = %s
        """, (question_id, user["user_id"]))
        exam = cursor.fetchone()
        if not exam:
            raise HTTPException(status_code=404, detail="Question not found or access denied")

        cursor.execute("SELECT NOW() as server_time")
        if cursor.fetchone()["server_time"] >= exam["date"]:
             raise HTTPException(status_code=400, detail="Exam already started. Editing not allowed.")

        cursor.execute("UPDATE question SET question_text = %s, marks = %s WHERE question_id = %s", (question_text, marks, question_id))
        cursor.execute("DELETE FROM question_option WHERE question_id = %s", (question_id,))
        for opt in options:
            cursor.execute("INSERT INTO question_option (question_id, option_text, is_correct) VALUES (%s, %s, %s)", (question_id, opt["text"], opt["is_correct"]))
        conn.commit()
        return {"message": "Question updated successfully"}
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
            WHERE (
                s.section_id IN (SELECT section_id FROM teaching_assignment WHERE teacher_id = %s)
                OR e.created_by_teacher = %s
            )
        """
        params = [user["user_id"], user["user_id"]]

        if semester:
            query += " AND sec.semester = %s"
            params.append(semester)
        if section_id:
            query += " AND s.section_id = %s"
            params.append(section_id)
        if search:
            query += " AND (s.name LIKE %s OR s.usn LIKE %s)"
            params.extend([f"%{search}%", f"%{search}%"])
            
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
        base_query = "FROM teacher_activity_logs tal WHERE tal.teacher_id = %s"
        params = [user["user_id"]]

        if start_date:
            base_query += " AND tal.created_at >= %s"
            params.append(start_date)
        if end_date:
            base_query += " AND tal.created_at <= %s"
            params.append(end_date)
        if exam_id:
            base_query += " AND tal.exam_id = %s"
            params.append(exam_id)
        if section_id:
            base_query += " AND tal.section_id = %s"
            params.append(section_id)

        # Count total
        cursor.execute(f"SELECT COUNT(*) as total {base_query}", tuple(params))
        total = cursor.fetchone()["total"]

        # Fetch logs with joins for names
        query = f"""
            SELECT tal.*, e.exam_name, s.name as student_name, sec.section_name
            {base_query}
            LEFT JOIN exam e ON tal.exam_id = e.exam_id
            LEFT JOIN student s ON tal.student_id = s.student_id
            LEFT JOIN section sec ON tal.section_id = sec.section_id
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
            SELECT r.result_id, s.name as student_name, s.usn, sec.section_name, r.total_marks, r.result_status, r.generated_time
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

        # Validate Marks
        cursor.execute("SELECT SUM(marks) as total_q_marks FROM question WHERE exam_id = %s", (exam_id,))
        result = cursor.fetchone()
        total_q_marks = result["total_q_marks"] or 0

        if float(total_q_marks) != float(exam["total_marks"]):
            raise HTTPException(
                status_code=400, 
                detail=f"Marks mismatch! Exam Total: {exam['total_marks']}, Questions Total: {total_q_marks}."
            )

        cursor.execute("UPDATE exam SET status = 'active' WHERE exam_id = %s", (exam_id,))

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

        cursor.execute("DELETE FROM exam WHERE exam_id = %s", (exam_id,))
        conn.commit()

        # We don't have department_id here, might need to fetch it before deleting if we want to log this.
        return {"message": "Exam deleted successfully"}
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

        # Update Exam
        cursor.execute("""
            UPDATE exam SET 
                exam_name=%s, subject_id=%s, date=%s, duration=%s, total_marks=%s
            WHERE exam_id=%s
        """, (exam_name, subject_id, formatted_date, duration, total_marks, exam_id))

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
def get_teacher_violation_stats(status: str = Query(None), user=Depends(get_current_user)):
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

        stats = {}
        
        # 1. Summary Cards
        cursor.execute(f"""
            SELECT COUNT(v.violation_id) as c 
            FROM violation v
            JOIN exam e ON v.exam_id = e.exam_id
            WHERE {base_where} AND DATE(v.`timestamp`) = CURDATE()
        """, tuple(params))
        stats["today"] = cursor.fetchone()["c"]
        
        cursor.execute(f"""
            SELECT COUNT(v.violation_id) as c 
            FROM violation v
            JOIN exam e ON v.exam_id = e.exam_id
            WHERE {base_where} AND YEARWEEK(v.`timestamp`, 1) = YEARWEEK(CURDATE(), 1)
        """, tuple(params))
        stats["week"] = cursor.fetchone()["c"]
        
        cursor.execute(f"""
            SELECT COUNT(DISTINCT v.student_id) as c 
            FROM violation v
            JOIN exam e ON v.exam_id = e.exam_id
            WHERE {base_where}
        """, tuple(params))
        stats["students_flagged"] = cursor.fetchone()["c"]

        # 2. Recent Violations
        cursor.execute(f"""
            SELECT v.violation_id, s.name, s.usn, e.exam_name, v.violation_type, v.`timestamp`, v.review_status
            FROM violation v 
            JOIN student s ON v.student_id = s.student_id 
            JOIN exam e ON v.exam_id = e.exam_id 
            WHERE {base_where}
            ORDER BY v.`timestamp` DESC LIMIT 20
        """, tuple(params))
        stats["recent"] = cursor.fetchall()

        return stats
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
    status: str = Body(...), 
    remarks: str = Body(None),
    user=Depends(get_current_user)
):
    if user["role"] != "teacher":
        raise HTTPException(status_code=403, detail="Access denied")
    
    conn = get_connection()
    cursor = conn.cursor()
    try:
        # Verify ownership via exam
        cursor.execute("""
            UPDATE violation v JOIN exam e ON v.exam_id = e.exam_id 
            SET v.review_status = %s, v.admin_remarks = %s 
            WHERE v.violation_id = %s AND e.created_by_teacher = %s
        """, (status, remarks, violation_id, user["user_id"]))
        
        if cursor.rowcount == 0:
             pass # Or raise error
        
        # Auto-flag High Risk Student
        if status == 'Resolved':
            cursor.execute("""
                SELECT v.student_id FROM violation v 
                JOIN exam e ON v.exam_id = e.exam_id 
                WHERE v.violation_id = %s AND e.created_by_teacher = %s
            """, (violation_id, user["user_id"]))
            row = cursor.fetchone()
            if row:
                student_id = row[0]
                cursor.execute("SELECT COUNT(*) FROM violation WHERE student_id = %s AND review_status = 'Resolved'", (student_id,))
                count = cursor.fetchone()[0]
                if count > 3:
                    cursor.execute("UPDATE student SET risk_status = 'High Risk' WHERE student_id = %s", (student_id,))

        conn.commit()
        return {"message": f"Violation marked as {status}"}
    finally:
        cursor.close()
        conn.close()