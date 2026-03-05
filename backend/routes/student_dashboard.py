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
            AND (a.attempt_id IS NULL OR a.status = 'IN_PROGRESS')
        """, (student_id, section_id))
        upcoming_count = cursor.fetchone()["count"]

        # 2. Completed Exams
        cursor.execute("""
            SELECT COUNT(*) as count
            FROM attempt
            WHERE student_id = %s AND status = 'COMPLETED'
        """, (student_id,))
        completed_count = cursor.fetchone()["count"]

        # 3. Average Score
        cursor.execute("""
            SELECT AVG((r.total_marks / e.total_marks) * 100) as avg_score
            FROM result r
            JOIN exam e ON r.exam_id = e.exam_id
            WHERE r.student_id = %s
        """, (student_id,))
        avg_score = cursor.fetchone()["avg_score"] or 0

        # 4. Violations
        cursor.execute("SELECT COUNT(*) as count FROM violation WHERE student_id = %s", (student_id,))
        violations_count = cursor.fetchone()["count"]

        # 5. Performance Data
        cursor.execute("""
            SELECT s.subject_name, AVG((r.total_marks / e.total_marks) * 100) as score
            FROM result r
            JOIN exam e ON r.exam_id = e.exam_id
            JOIN subject s ON e.subject_id = s.subject_id
            WHERE r.student_id = %s
            GROUP BY s.subject_id
        """, (student_id,))
        performance_data = cursor.fetchall()

        return {
            "upcoming_exams": upcoming_count,
            "completed_exams": completed_count,
            "average_score": round(avg_score, 1),
            "violations": violations_count,
            "performance": performance_data
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
            SELECT e.exam_id, e.exam_name, s.subject_name, e.date, e.duration, e.status, e.total_marks,
                   a.status as attempt_status
            FROM exam e
            JOIN exam_section es ON e.exam_id = es.exam_id
            JOIN subject s ON e.subject_id = s.subject_id
            LEFT JOIN attempt a ON e.exam_id = a.exam_id AND a.student_id = %s
            WHERE es.section_id = %s 
            AND e.status IN ('scheduled', 'active')
            AND (a.attempt_id IS NULL OR a.status = 'IN_PROGRESS')
            ORDER BY e.date ASC
        """, (user["user_id"], section_id))
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
            WHERE r.student_id = %s
            ORDER BY r.generated_time DESC
        """, (user["user_id"],))
        return cursor.fetchall()
    finally:
        cursor.close()
        conn.close()