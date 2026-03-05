from fastapi import APIRouter, Depends, HTTPException, Query
from db import get_connection
from security import get_current_user
from datetime import date

router = APIRouter()

@router.get("/admin/dashboard/stats")
def get_admin_dashboard_stats(user=Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    
    try:
        # Get Admin Dept
        cursor.execute("SELECT department_id FROM admin WHERE admin_id = %s", (user["user_id"],))
        admin_row = cursor.fetchone()
        if not admin_row:
            raise HTTPException(status_code=400, detail="Admin not assigned to department")
        dept_id = admin_row["department_id"]

        stats = {}

        # 1. Counts
        cursor.execute("SELECT COUNT(*) as c FROM student WHERE department_id = %s", (dept_id,))
        stats["total_students"] = cursor.fetchone()["c"]

        cursor.execute("SELECT COUNT(*) as c FROM teacher WHERE department_id = %s", (dept_id,))
        stats["total_teachers"] = cursor.fetchone()["c"]

        cursor.execute("SELECT COUNT(*) as c FROM subject WHERE department_id = %s", (dept_id,))
        stats["total_subjects"] = cursor.fetchone()["c"]

        cursor.execute("SELECT COUNT(*) as c FROM exam WHERE department_id = %s", (dept_id,))
        stats["total_exams"] = cursor.fetchone()["c"]

        cursor.execute("SELECT COUNT(*) as c FROM exam WHERE department_id = %s AND status = 'active'", (dept_id,))
        stats["active_exams"] = cursor.fetchone()["c"]

        cursor.execute("SELECT COUNT(*) as c FROM exam WHERE department_id = %s AND status = 'completed'", (dept_id,))
        stats["completed_exams"] = cursor.fetchone()["c"]

        # 2. Recent Activity
        cursor.execute("""
            SELECT e.exam_name, e.date, e.status, e.exam_scope, e.batch_year, e.semester,
                   GROUP_CONCAT(CONCAT(s.section_name, ' (', s.batch_year, ', Sem ', s.semester, ')') SEPARATOR ', ') as section_details
            FROM exam e
            LEFT JOIN exam_section es ON e.exam_id = es.exam_id
            LEFT JOIN section s ON es.section_id = s.section_id
            WHERE e.department_id = %s 
            GROUP BY e.exam_id
            ORDER BY e.exam_id DESC LIMIT 5
        """, (dept_id,))
        stats["recent_exams"] = cursor.fetchall()

        cursor.execute("SELECT name, email FROM teacher WHERE department_id = %s ORDER BY teacher_id DESC LIMIT 5", (dept_id,))
        stats["recent_teachers"] = cursor.fetchall()

        cursor.execute("SELECT name, usn FROM student WHERE department_id = %s ORDER BY student_id DESC LIMIT 5", (dept_id,))
        stats["recent_students"] = cursor.fetchall()

        # 3. Alerts
        alerts = []
        
        # Exams without questions
        cursor.execute("""
            SELECT e.exam_name 
            FROM exam e 
            LEFT JOIN question q ON e.exam_id = q.exam_id 
            WHERE e.department_id = %s AND q.question_id IS NULL
        """, (dept_id,))
        empty_exams = cursor.fetchall()
        for e in empty_exams:
            alerts.append({"type": "warning", "message": f"⚠️ Exam '{e['exam_name']}' has no questions."})

        # Teachers without subjects
        cursor.execute("""
            SELECT t.name 
            FROM teacher t 
            LEFT JOIN teaching_assignment ta ON t.teacher_id = ta.teacher_id 
            WHERE t.department_id = %s AND ta.assignment_id IS NULL
        """, (dept_id,))
        idle_teachers = cursor.fetchall()
        for t in idle_teachers:
            alerts.append({"type": "info", "message": f"ℹ️ Teacher '{t['name']}' has no assigned subjects."})

        # 4. Performance Analytics
        cursor.execute("""
            SELECT 
                s.subject_name,
                AVG((r.total_marks / e.total_marks) * 100) as avg_percentage
            FROM result r
            JOIN exam e ON r.exam_id = e.exam_id
            JOIN subject s ON e.subject_id = s.subject_id
            WHERE e.department_id = %s
            GROUP BY s.subject_id, s.subject_name
            ORDER BY avg_percentage DESC
            LIMIT 10
        """, (dept_id,))
        stats["performance_by_subject"] = cursor.fetchall()

        stats["alerts"] = alerts

        return stats

    finally:
        cursor.close()
        conn.close()

@router.get("/admin/dashboard/logs")
def get_system_logs(
    page: int = 1,
    limit: int = 20,
    start_date: date = Query(None),
    end_date: date = Query(None),
    action_type: str = Query(None),
    search: str = Query(None),
    user=Depends(get_current_user)
):
    if user["role"] not in ["admin", "super_admin"]:
        raise HTTPException(status_code=403, detail="Access denied")

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    
    try:
        where_conditions = []
        params = []

        # If Admin, restrict to department. If Super Admin, show all.
        if user["role"] == "admin":
            cursor.execute("SELECT department_id FROM admin WHERE admin_id = %s", (user["user_id"],))
            dept_id = cursor.fetchone()["department_id"]
            where_conditions.append("sl.department_id = %s")
            params.append(dept_id)
        
        # Use alias 'sl' for system_logs to avoid ambiguity with joined tables

        if start_date:
            where_conditions.append("sl.created_at >= %s")
            params.append(start_date)
        if end_date:
            where_conditions.append("sl.created_at <= %s")
            params.append(end_date)
        if action_type:
            where_conditions.append("sl.action LIKE %s")
            params.append(f"%{action_type}%")
        if search:
            where_conditions.append("(sl.action LIKE %s OR sl.entity_type LIKE %s)")
            params.extend([f"%{search}%", f"%{search}%"])

        if where_conditions:
            where_clause = "WHERE " + " AND ".join(where_conditions)
        else:
            where_clause = ""

        # Get total count for pagination
        cursor.execute(f"SELECT COUNT(*) as total FROM system_logs sl {where_clause}", tuple(params))
        total = cursor.fetchone()["total"]

        # Get paginated logs with user names
        logs_query = f"""
            SELECT 
                sl.log_id, sl.user_id, sl.role, sl.action, sl.entity_type, sl.entity_id, sl.ip_address, sl.created_at,
                COALESCE(a.name, t.name, s.name, 'Unknown') as user_name,
                d.department_name
            FROM system_logs sl
            LEFT JOIN admin a ON sl.role = 'admin' AND sl.user_id = a.admin_id
            LEFT JOIN teacher t ON sl.role = 'teacher' AND sl.user_id = t.teacher_id
            LEFT JOIN student s ON sl.role = 'student' AND sl.user_id = s.student_id
            LEFT JOIN department d ON sl.department_id = d.department_id
            {where_clause} 
            ORDER BY sl.created_at DESC 
            LIMIT %s OFFSET %s
        """
        params.extend([limit, (page - 1) * limit])
        cursor.execute(logs_query, tuple(params))
        logs = cursor.fetchall()

        return {
            "logs": logs,
            "total": total,
            "page": page,
            "limit": limit,
            "total_pages": (total + limit - 1) // limit
        }
    finally:
        cursor.close()
        conn.close()