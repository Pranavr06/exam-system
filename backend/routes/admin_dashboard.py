from fastapi import APIRouter, Depends, HTTPException, Query, Body
from db import get_connection
from security import get_current_user
from datetime import date

router = APIRouter()

@router.get("/admin/profile")
def get_admin_profile(user=Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("""
            SELECT a.admin_id, a.name, a.email, d.department_name
            FROM admin a
            LEFT JOIN department d ON a.department_id = d.department_id
            WHERE a.admin_id = %s
        """, (user["user_id"],))
        profile = cursor.fetchone()
        if not profile:
            raise HTTPException(status_code=404, detail="Profile not found")
        return profile
    finally:
        cursor.close()
        conn.close()

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

        cursor.execute("SELECT COUNT(*) as c FROM section WHERE department_id = %s", (dept_id,))
        stats["total_sections"] = cursor.fetchone()["c"]

        cursor.execute("SELECT COUNT(*) as c FROM teacher WHERE department_id = %s", (dept_id,))
        stats["total_teachers"] = cursor.fetchone()["c"]

        cursor.execute("SELECT COUNT(*) as c FROM subject WHERE department_id = %s", (dept_id,))
        stats["total_subjects"] = cursor.fetchone()["c"]

        cursor.execute("SELECT COUNT(*) as c FROM exam WHERE department_id = %s AND is_archived = 0", (dept_id,))
        stats["total_exams"] = cursor.fetchone()["c"]

        cursor.execute("SELECT COUNT(*) as c FROM exam WHERE department_id = %s AND status = 'active' AND NOW() >= date AND NOW() <= (date + INTERVAL duration MINUTE) AND is_archived = 0", (dept_id,))
        stats["active_exams"] = cursor.fetchone()["c"]

        cursor.execute("SELECT COUNT(*) as c FROM exam WHERE department_id = %s AND (status = 'completed' OR NOW() > (date + INTERVAL duration MINUTE)) AND is_archived = 0", (dept_id,))
        stats["completed_exams"] = cursor.fetchone()["c"]

        # 2. Recent Activity
        cursor.execute("""
            SELECT e.exam_name, e.date, 
                   CASE
                       WHEN e.status = 'completed' THEN 'completed'
                       WHEN NOW() > (e.date + INTERVAL e.duration MINUTE) THEN 'completed'
                       WHEN e.status = 'active' AND NOW() >= e.date THEN 'active'
                       ELSE 'scheduled'
                   END as status, e.exam_scope, e.batch_year, e.semester,
                   GROUP_CONCAT(CONCAT(s.section_name, ' (', s.batch_year, ', Sem ', s.semester, ')') SEPARATOR ', ') as section_details
            FROM exam e
            LEFT JOIN exam_section es ON e.exam_id = es.exam_id
            LEFT JOIN section s ON es.section_id = s.section_id
            WHERE e.department_id = %s AND e.is_archived = 0
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
            SELECT e.exam_id, e.exam_name 
            FROM exam e 
            LEFT JOIN question q ON e.exam_id = q.exam_id 
            WHERE e.department_id = %s AND q.question_id IS NULL AND e.status != 'completed'
        """, (dept_id,))
        empty_exams = cursor.fetchall()
        for e in empty_exams:
            alerts.append({
                "type": "warning", 
                "message": f"⚠️ Exam '{e['exam_name']}' has no questions.",
                "action": "add_questions",
                "exam_id": e["exam_id"]
            })

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
            WHERE e.department_id = %s AND e.is_archived = 0
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

@router.get("/admin/violations/stats")
def get_admin_violation_stats(status: str = Query(None), exam_id: int = Query(None), violation_type: str = Query(None), user=Depends(get_current_user)):
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

        # Base filter
        base_where = "e.department_id = %s"
        params = [dept_id]
        
        if status:
            base_where += " AND v.review_status = %s"
            params.append(status)
        if exam_id:
            base_where += " AND v.exam_id = %s"
            params.append(exam_id)
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
        
        cursor.execute(f"""
            SELECT COUNT(DISTINCT v.exam_id) as c 
            FROM violation v
            JOIN exam e ON v.exam_id = e.exam_id
            WHERE {base_where}
        """, tuple(params))
        stats["exams_affected"] = cursor.fetchone()["c"]

        # 2. Trend (Last 7 Days)
        cursor.execute(f"""
            SELECT DATE_FORMAT(v.detected_at, '%Y-%m-%d') as date, COUNT(v.violation_id) as count 
            FROM violation v
            JOIN exam e ON v.exam_id = e.exam_id
            WHERE {base_where} AND v.detected_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY) 
            GROUP BY DATE_FORMAT(v.detected_at, '%Y-%m-%d')
            ORDER BY date ASC
        """, tuple(params))
        stats["trend"] = cursor.fetchall()

        # 3. By Type
        cursor.execute(f"""
            SELECT v.violation_type, COUNT(v.violation_id) as count 
            FROM violation v
            JOIN exam e ON v.exam_id = e.exam_id
            WHERE {base_where}
            GROUP BY v.violation_type
        """, tuple(params))
        stats["by_type"] = cursor.fetchall()

        # 4. Recent Violations
        cursor.execute(f"""
            SELECT v.violation_id, s.name, s.usn, d.department_name, e.exam_name, v.violation_type, v.detected_at as timestamp, v.review_status
            FROM violation v 
            JOIN student s ON v.student_id = s.student_id 
            JOIN department d ON s.department_id = d.department_id
            JOIN exam e ON v.exam_id = e.exam_id 
            WHERE {base_where}
            ORDER BY v.detected_at DESC LIMIT 10
        """, tuple(params))
        stats["recent"] = cursor.fetchall()

        # 5. High Risk Students
        # For high risk, we might want to ignore the status filter to show overall risk, 
        # but the request implies filtering. Let's filter.
        cursor.execute(f"""
            SELECT s.name, s.usn, COUNT(v.violation_id) as violation_count 
            FROM violation v 
            JOIN student s ON v.student_id = s.student_id 
            JOIN exam e ON v.exam_id = e.exam_id
            WHERE {base_where}
            GROUP BY s.student_id 
            HAVING violation_count > 1 
            ORDER BY violation_count DESC LIMIT 5
        """, tuple(params))
        stats["high_risk"] = cursor.fetchall()

        # 6. Violations by Exam
        cursor.execute(f"""
            SELECT e.exam_name, COUNT(v.violation_id) as count
            FROM violation v
            JOIN exam e ON v.exam_id = e.exam_id
            WHERE {base_where}
            GROUP BY e.exam_id
            ORDER BY count DESC LIMIT 5
        """, tuple(params))
        stats["by_exam"] = cursor.fetchall()

        # 7. Alerts
        alerts = []
        if stats["today"] > 5:
            alerts.append({"type": "critical", "message": f"High violation activity today: {stats['today']} incidents."})
        
        for exam in stats["by_exam"]:
            if exam["count"] >= 3:
                 alerts.append({"type": "warning", "message": f"Exam '{exam['exam_name']}' has {exam['count']} violations."})
                 
        stats["alerts"] = alerts

        return stats
    finally:
        cursor.close()
        conn.close()

@router.get("/admin/violations/{violation_id}")
def get_violation_details(violation_id: int, user=Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        # Verify department access
        cursor.execute("SELECT department_id FROM admin WHERE admin_id = %s", (user["user_id"],))
        dept_id = cursor.fetchone()["department_id"]
        
        cursor.execute("""
            SELECT v.*, s.name as student_name, s.usn, e.exam_name, q.question_text
            FROM violation v
            JOIN student s ON v.student_id = s.student_id
            JOIN exam e ON v.exam_id = e.exam_id
            LEFT JOIN question q ON v.question_id = q.question_id
            WHERE v.violation_id = %s AND e.department_id = %s
        """, (violation_id, dept_id))
        
        violation = cursor.fetchone()
        if not violation:
            raise HTTPException(status_code=404, detail="Violation not found")
            
        # Fetch Evidence
        cursor.execute("""
            SELECT evidence_id, camera_image_path, screenshot_path, captured_time
            FROM evidence
            WHERE violation_id = %s
        """, (violation_id,))
        violation["evidence"] = cursor.fetchall()

        return violation
    finally:
        cursor.close()
        conn.close()

@router.put("/admin/violations/{violation_id}/resolve")
def resolve_violation(
    violation_id: int, 
    status: str = Body(...), 
    remarks: str = Body(None),
    user=Depends(get_current_user)
):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    conn = get_connection()
    cursor = conn.cursor()
    try:
        # Verify department access (via student)
        cursor.execute("SELECT department_id FROM admin WHERE admin_id = %s", (user["user_id"],))
        dept_id = cursor.fetchone()["department_id"]
        
        # Check existence and access in one go
        cursor.execute("""
            UPDATE violation v JOIN exam e ON v.exam_id = e.exam_id
            SET v.review_status = %s, v.remarks = %s 
            WHERE v.violation_id = %s AND e.department_id = %s
        """, (status, remarks, violation_id, dept_id))
        
        if cursor.rowcount == 0:
             # Either not found or no change, but for security we assume access denied or not found
             # To be precise we could select first, but this is efficient.
             pass 
        
        # Auto-flag High Risk Student
        if status == 'Resolved':
            cursor.execute("""
                SELECT v.student_id FROM violation v 
                JOIN exam e ON v.exam_id = e.exam_id
                WHERE v.violation_id = %s AND e.department_id = %s
            """, (violation_id, dept_id))
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