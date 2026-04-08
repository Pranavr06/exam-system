from fastapi import APIRouter, Depends, HTTPException
from db import get_connection
from security import get_current_user

router = APIRouter()

@router.get("/student/dashboard/stats")
def get_student_dashboard_stats(user=Depends(get_current_user)):
    if user["role"] != "student":
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

        student_id = user["user_id"]
        
        # Get Section ID
        cursor.execute("SELECT section_id FROM student WHERE student_id = %s", (student_id,))
        student = cursor.fetchone()
        if not student or not student["section_id"]:
             # Handle case where student has no section (new student)
             return {
                 "upcoming_exams": 0,
                 "completed_exams": 0,
                 "average_score": 0,
                 "violations": 0,
                 "performance": []
             }
        
        section_id = student["section_id"]

        # 1. Upcoming Exams (Scheduled or Active, not yet attempted or in progress)
        cursor.execute("""
            SELECT COUNT(*) as count
            FROM exam e
            JOIN exam_section es ON e.exam_id = es.exam_id
            LEFT JOIN attempt a ON e.exam_id = a.exam_id AND a.student_id = %s
            WHERE es.section_id = %s 
            AND e.status IN ('scheduled', 'active')
            AND NOW() <= (e.date + INTERVAL e.duration MINUTE)
            AND (e.is_archived = 0 OR e.is_archived IS NULL)
            AND (a.attempt_id IS NULL OR a.status = 'IN_PROGRESS')
        """, (student_id, section_id))
        upcoming_count = cursor.fetchone()["count"]

        # Add Retake Exams Count
        cursor.execute("""
            SELECT COUNT(*) as count FROM exam_retake 
            WHERE student_id = %s AND status IN ('scheduled', 'active')
            AND NOW() <= (retake_date + INTERVAL retake_duration MINUTE)
        """, (student_id,))
        upcoming_count += cursor.fetchone()["count"]

        # 2. Completed Exams
        cursor.execute("""
            SELECT COUNT(*) as count
            FROM attempt a
            JOIN exam e ON a.exam_id = e.exam_id
            WHERE a.student_id = %s AND a.status = 'COMPLETED' AND (e.is_archived = 0 OR e.is_archived IS NULL)
        """, (student_id,))
        completed_count = cursor.fetchone()["count"]

        # 3. Average Score
        cursor.execute("""
            SELECT AVG((r.total_marks / e.total_marks) * 100) as avg_score
            FROM result r
            JOIN exam e ON r.exam_id = e.exam_id
            WHERE r.student_id = %s AND (e.is_archived = 0 OR e.is_archived IS NULL)
        """, (student_id,))
        avg_score = cursor.fetchone()["avg_score"] or 0

        # 4. Violations
        cursor.execute("""
            SELECT COUNT(v.violation_id) as count 
            FROM violation v
            JOIN exam e ON v.exam_id = e.exam_id
            WHERE v.student_id = %s AND (e.is_archived = 0 OR e.is_archived IS NULL)
        """, (student_id,))
        violations_count = cursor.fetchone()["count"]

        # 5. Performance Data
        cursor.execute("""
            SELECT s.subject_name, AVG((r.total_marks / e.total_marks) * 100) as score
            FROM result r
            JOIN exam e ON r.exam_id = e.exam_id
            JOIN subject s ON e.subject_id = s.subject_id
            WHERE r.student_id = %s AND (e.is_archived = 0 OR e.is_archived IS NULL)
            GROUP BY s.subject_id
        """, (student_id,))
        performance_data = cursor.fetchall()

        # 6. Recent Results (Limit 5)
        cursor.execute("""
            SELECT e.exam_name, s.subject_name, r.total_marks as obtained_marks, e.total_marks as max_marks, 
                   r.result_status, r.generated_time
            FROM result r
            JOIN exam e ON r.exam_id = e.exam_id
            JOIN subject s ON e.subject_id = s.subject_id
            WHERE r.student_id = %s AND (e.is_archived = 0 OR e.is_archived IS NULL)
            ORDER BY r.generated_time DESC
            LIMIT 5
        """, (student_id,))
        recent_results = cursor.fetchall()

        return {
            "upcoming_exams": upcoming_count,
            "completed_exams": completed_count,
            "average_score": round(avg_score, 1),
            "violations": violations_count,
            "performance": performance_data,
            "recent_results": recent_results
        }
    finally:
        cursor.close()
        conn.close()

@router.get("/student/exams/upcoming")
def get_student_upcoming_exams(user=Depends(get_current_user)):
    if user["role"] != "student":
        raise HTTPException(status_code=403, detail="Access denied")
    
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT section_id FROM student WHERE student_id = %s", (user["user_id"],))
        student = cursor.fetchone()
        if not student or not student["section_id"]:
            return []
        
        section_id = student["section_id"]

        cursor.execute("""
            SELECT e.exam_id, e.exam_name, s.subject_name, e.date, e.duration, e.mode, 
                   CASE
                       WHEN e.status = 'completed' THEN 'completed'
                       WHEN NOW() > (e.date + INTERVAL e.duration MINUTE) THEN 'completed'
                       WHEN e.status = 'active' AND NOW() >= e.date THEN 'active'
                       ELSE 'scheduled'
                   END as status, e.total_marks,
                   a.status as attempt_status
            FROM exam e
            JOIN exam_section es ON e.exam_id = es.exam_id
            JOIN subject s ON e.subject_id = s.subject_id
            LEFT JOIN attempt a ON e.exam_id = a.exam_id AND a.student_id = %s
            WHERE es.section_id = %s 
            AND (e.is_archived = 0 OR e.is_archived IS NULL)
            AND (a.attempt_id IS NULL OR a.status = 'IN_PROGRESS')
            HAVING status IN ('scheduled', 'active')
            ORDER BY e.date ASC
        """, (user["user_id"], section_id))
        exams = cursor.fetchall()

        # Fetch Specific Retakes
        cursor.execute("""
            SELECT er.retake_id, e.exam_id, CONCAT('Retake: ', e.exam_name) as exam_name, s.subject_name,
                   er.retake_date as date, er.retake_duration as duration, e.mode,
                   er.status, e.total_marks, 'PENDING' as attempt_status, 'true' as is_specific_retake
            FROM exam_retake er
            JOIN exam e ON er.exam_id = e.exam_id
            JOIN subject s ON e.subject_id = s.subject_id
            WHERE er.student_id = %s AND er.status IN ('scheduled', 'active')
        """, (user["user_id"],))
        retakes = cursor.fetchall()

        return exams + retakes
    finally:
        cursor.close()
        conn.close()

@router.get("/student/academic-info")
def get_student_academic_info(user=Depends(get_current_user)):
    if user["role"] != "student":
        raise HTTPException(status_code=403, detail="Access denied")
    
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        # Student Details
        cursor.execute("""
            SELECT s.name, s.usn, s.email, sec.batch_year, s.semester, 
                   d.department_name, sec.section_name
            FROM student s
            JOIN department d ON s.department_id = d.department_id
            JOIN section sec ON s.section_id = sec.section_id
            WHERE s.student_id = %s
        """, (user["user_id"],))
        student_info = cursor.fetchone()

        # Subjects & Teachers
        cursor.execute("""
            SELECT sub.subject_name, t.name as teacher_name, t.email as teacher_email
            FROM student s
            JOIN teaching_assignment ta ON s.section_id = ta.section_id
            JOIN subject sub ON ta.subject_id = sub.subject_id
            JOIN teacher t ON ta.teacher_id = t.teacher_id
            WHERE s.student_id = %s
        """, (user["user_id"],))
        subjects = cursor.fetchall()

        return {"info": student_info, "subjects": subjects}
    finally:
        cursor.close()
        conn.close()

@router.get("/student/violations")
def get_student_violations(user=Depends(get_current_user)):
    if user["role"] != "student":
        raise HTTPException(status_code=403, detail="Access denied")
    
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("""
            SELECT v.*, v.detected_at as timestamp, e.exam_name
            FROM violation v
            JOIN exam e ON v.exam_id = e.exam_id
            WHERE v.student_id = %s AND (e.is_archived = 0 OR e.is_archived IS NULL)
            ORDER BY v.detected_at DESC
        """, (user["user_id"],))
        return cursor.fetchall()
    finally:
        cursor.close()
        conn.close()

@router.get("/student/exams/history")
def get_student_exam_history(user=Depends(get_current_user)):
    if user["role"] != "student":
        raise HTTPException(status_code=403, detail="Access denied")
    
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("""
            SELECT e.exam_name, s.subject_name, r.total_marks as obtained_marks, e.total_marks as max_marks, 
                   r.result_status, r.generated_time
            FROM result r
            JOIN exam e ON r.exam_id = e.exam_id
            JOIN subject s ON e.subject_id = s.subject_id
            WHERE r.student_id = %s AND (e.is_archived = 0 OR e.is_archived IS NULL)
            ORDER BY r.generated_time DESC
        """, (user["user_id"],))
        return cursor.fetchall()
    finally:
        cursor.close()
        conn.close()