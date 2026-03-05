from fastapi import APIRouter, Depends, HTTPException, Body, Query
from db import get_connection
from security import get_current_user
from passlib.context import CryptContext
import mysql.connector

router = APIRouter()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def require_super_admin(user: dict = Depends(get_current_user)):
    if user.get("role") != "super_admin":
        raise HTTPException(status_code=403, detail="Super admin access required")
    return user

@router.post("/superadmin/departments", dependencies=[Depends(require_super_admin)])
def create_department(name: str = Body(..., embed=True)):
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("INSERT INTO department (department_name) VALUES (%s)", (name,))
        conn.commit()
        return {"message": f"Department '{name}' created successfully."}
    except mysql.connector.IntegrityError:
        raise HTTPException(status_code=400, detail="Department with this name already exists.")
    finally:
        cursor.close()
        conn.close()

@router.post("/superadmin/admins", dependencies=[Depends(require_super_admin)])
def create_admin(
    name: str = Body(...),
    email: str = Body(...),
    password: str = Body(...),
    department_id: int = Body(...)
):
    # Domain restriction for new admins
    if not email.endswith("@nitte.edu.in"):
        raise HTTPException(status_code=400, detail="Invalid admin email domain. Must be @nitte.edu.in")

    hashed_password = pwd_context.hash(password)
    conn = get_connection()
    cursor = conn.cursor()

    try:
        # Check if department exists
        cursor.execute("SELECT department_id FROM department WHERE department_id = %s", (department_id,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Department not found.")

        cursor.execute(
            """INSERT INTO admin (name, email, password_hash, department_id, role) 
               VALUES (%s, %s, %s, %s, 'admin')""",
            (name, email, hashed_password, department_id)
        )
        conn.commit()
        return {"message": "Admin created and assigned to department successfully."}
    except mysql.connector.IntegrityError as err:
        if err.errno == 1062: # Duplicate entry
            raise HTTPException(status_code=400, detail="Admin with this email already exists.")
        raise HTTPException(status_code=400, detail=str(err))
    finally:
        cursor.close()
        conn.close()

@router.get("/superadmin/dashboard/stats", dependencies=[Depends(require_super_admin)])
def get_dashboard_stats():
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        stats = {}
        cursor.execute("SELECT COUNT(*) as count FROM department")
        stats["total_departments"] = cursor.fetchone()["count"]
        
        cursor.execute("SELECT COUNT(*) as count FROM admin")
        stats["total_admins"] = cursor.fetchone()["count"]
        
        cursor.execute("SELECT COUNT(*) as count FROM teacher")
        stats["total_teachers"] = cursor.fetchone()["count"]

        cursor.execute("SELECT COUNT(*) as count FROM student")
        stats["total_students"] = cursor.fetchone()["count"]

        cursor.execute("SELECT COUNT(*) as count FROM exam")
        stats["total_exams"] = cursor.fetchone()["count"]

        cursor.execute("SELECT COUNT(*) as count FROM violation")
        stats["total_violations"] = cursor.fetchone()["count"]

        # New: Students currently writing (Active Attempts)
        cursor.execute("SELECT COUNT(DISTINCT student_id) as count FROM attempt WHERE status = 'IN_PROGRESS'")
        stats["students_writing"] = cursor.fetchone()["count"]
        
        # 2. Active Exams (Global)
        cursor.execute("""
            SELECT e.exam_name, d.department_name, e.date, 
                   (SELECT COUNT(*) FROM exam_section es WHERE es.exam_id = e.exam_id) as section_count
            FROM exam e
            JOIN department d ON e.department_id = d.department_id
            WHERE e.status = 'active'
            LIMIT 5
        """)
        stats["active_exams"] = cursor.fetchall()

        # 3. Recent Violations
        cursor.execute("""
            SELECT v.violation_type, s.name as student_name, d.department_name, e.exam_name, v.`timestamp`
            FROM violation v
            JOIN student s ON v.student_id = s.student_id
            JOIN department d ON s.department_id = d.department_id
            JOIN exam e ON v.exam_id = e.exam_id
            ORDER BY v.`timestamp` DESC
            LIMIT 5
        """)
        stats["recent_violations"] = cursor.fetchall()

        # 4. Department Performance & Health
        cursor.execute("""
            SELECT 
                d.department_name,
                (SELECT COALESCE(AVG((r.total_marks / e.total_marks) * 100), 0) 
                 FROM result r JOIN exam e ON r.exam_id = e.exam_id 
                 WHERE e.department_id = d.department_id) as avg_score,
                (SELECT COUNT(*) FROM exam e WHERE e.department_id = d.department_id AND e.status = 'completed') as completed_exams,
                (SELECT COUNT(*)
                 FROM violation v JOIN student s ON v.student_id = s.student_id 
                 WHERE s.department_id = d.department_id) as violation_count
            FROM department d
        """)
        stats["dept_stats"] = cursor.fetchall()

        # 5. Recent System Activity
        cursor.execute("""
            SELECT sl.action, sl.role, sl.created_at, 
                   COALESCE(a.name, t.name, s.name, 'Unknown') as user_name,
                   d.department_name
            FROM system_logs sl
            LEFT JOIN admin a ON sl.role = 'admin' AND sl.user_id = a.admin_id
            LEFT JOIN teacher t ON sl.role = 'teacher' AND sl.user_id = t.teacher_id
            LEFT JOIN student s ON sl.role = 'student' AND sl.user_id = s.student_id
            LEFT JOIN department d ON sl.department_id = d.department_id
            ORDER BY sl.created_at DESC
            LIMIT 8
        """)
        stats["recent_activity"] = cursor.fetchall()

        # 6. Pass/Fail Ratio (Global)
        cursor.execute("""
            SELECT 
                SUM(CASE WHEN (r.total_marks / e.total_marks) * 100 >= 40 THEN 1 ELSE 0 END) as pass_count,
                SUM(CASE WHEN (r.total_marks / e.total_marks) * 100 < 40 THEN 1 ELSE 0 END) as fail_count
            FROM result r
            JOIN exam e ON r.exam_id = e.exam_id
        """)
        stats["pass_fail"] = cursor.fetchone()

        # 7. Violation Distribution
        cursor.execute("SELECT violation_type, COUNT(*) as count FROM violation GROUP BY violation_type")
        stats["violation_distribution"] = cursor.fetchall()
        
        # 8. Teacher Stats (Overview & Activity)
        cursor.execute("SELECT COUNT(DISTINCT user_id) as count FROM system_logs WHERE role='teacher' AND DATE(created_at) = CURDATE()")
        stats["active_teachers_today"] = cursor.fetchone()["count"]

        cursor.execute("""
            SELECT t.name, d.department_name, 
                   COUNT(DISTINCT e.exam_id) as exams_created,
                   COALESCE(GROUP_CONCAT(DISTINCT s.subject_name SEPARATOR ', '), 'None') as subjects
            FROM teacher t
            JOIN department d ON t.department_id = d.department_id
            LEFT JOIN exam e ON t.teacher_id = e.created_by_teacher
            LEFT JOIN teaching_assignment ta ON t.teacher_id = ta.teacher_id
            LEFT JOIN subject s ON ta.subject_id = s.subject_id
            GROUP BY t.teacher_id
            ORDER BY exams_created DESC
            LIMIT 5
        """)
        stats["top_teachers"] = cursor.fetchall()

        # 9. Student Performance Distribution
        cursor.execute("""
            SELECT 
                CASE 
                    WHEN (r.total_marks / e.total_marks) * 100 >= 90 THEN '90-100%'
                    WHEN (r.total_marks / e.total_marks) * 100 >= 80 THEN '80-89%'
                    WHEN (r.total_marks / e.total_marks) * 100 >= 70 THEN '70-79%'
                    WHEN (r.total_marks / e.total_marks) * 100 >= 60 THEN '60-69%'
                    WHEN (r.total_marks / e.total_marks) * 100 >= 40 THEN '40-59%'
                    ELSE '<40% (Fail)'
                END as grade_range,
                COUNT(*) as count
            FROM result r
            JOIN exam e ON r.exam_id = e.exam_id
            GROUP BY grade_range
            ORDER BY MIN((r.total_marks / e.total_marks) * 100) DESC
        """)
        stats["student_performance_dist"] = cursor.fetchall()

        stats["system_status"] = "Online"
        
        return stats
    finally:
        cursor.close()
        conn.close()

@router.get("/superadmin/departments", dependencies=[Depends(require_super_admin)])
def get_departments():
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("""
            SELECT d.department_id, d.department_name, d.created_at, 
                   (SELECT name FROM admin a WHERE a.department_id = d.department_id LIMIT 1) as admin_name
            FROM department d
            ORDER BY d.department_name
        """)
        return cursor.fetchall()
    finally:
        cursor.close()
        conn.close()

@router.put("/superadmin/departments/{dept_id}", dependencies=[Depends(require_super_admin)])
def update_department(dept_id: int, name: str = Body(..., embed=True)):
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("UPDATE department SET department_name = %s WHERE department_id = %s", (name, dept_id))
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Department not found")
        conn.commit()
        return {"message": "Department updated successfully"}
    except mysql.connector.IntegrityError:
        raise HTTPException(status_code=400, detail="Department name already exists")
    finally:
        cursor.close()
        conn.close()

@router.delete("/superadmin/departments/{dept_id}", dependencies=[Depends(require_super_admin)])
def delete_department(dept_id: int):
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT COUNT(*) as count FROM admin WHERE department_id = %s", (dept_id,))
        if cursor.fetchone()[0] > 0:
            raise HTTPException(status_code=400, detail="Cannot delete department with assigned admins.")
            
        cursor.execute("DELETE FROM department WHERE department_id = %s", (dept_id,))
        if cursor.rowcount == 0:
             raise HTTPException(status_code=404, detail="Department not found")
        conn.commit()
        return {"message": "Department deleted successfully"}
    finally:
        cursor.close()
        conn.close()

@router.get("/superadmin/admins", dependencies=[Depends(require_super_admin)])
def get_all_admins():
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("""
            SELECT a.admin_id, a.name, a.email, d.department_name, a.is_active
            FROM admin a
            LEFT JOIN department d ON a.department_id = d.department_id
            ORDER BY d.department_name, a.name
        """)
        return cursor.fetchall()
    finally:
        cursor.close()
        conn.close()

@router.get("/superadmin/admins/{admin_id}", dependencies=[Depends(require_super_admin)])
def get_admin(admin_id: int):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT admin_id, name, email, department_id FROM admin WHERE admin_id = %s", (admin_id,))
        admin = cursor.fetchone()
        if not admin:
            raise HTTPException(status_code=404, detail="Admin not found")
        return admin
    finally:
        cursor.close()
        conn.close()

@router.put("/superadmin/admins/{admin_id}", dependencies=[Depends(require_super_admin)])
def update_admin(
    admin_id: int,
    name: str = Body(...),
    email: str = Body(...),
    department_id: int = Body(...),
    password: str = Body(None)
):
    # Domain restriction
    if not email.endswith("@nitte.edu.in"):
        raise HTTPException(status_code=400, detail="Invalid admin email domain. Must be @nitte.edu.in")

    conn = get_connection()
    cursor = conn.cursor()
    try:
        # Check if department exists
        cursor.execute("SELECT department_id FROM department WHERE department_id = %s", (department_id,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Department not found.")

        if password and password.strip():
            hashed_password = pwd_context.hash(password)
            cursor.execute(
                "UPDATE admin SET name=%s, email=%s, department_id=%s, password_hash=%s WHERE admin_id=%s",
                (name, email, department_id, hashed_password, admin_id)
            )
        else:
            cursor.execute(
                "UPDATE admin SET name=%s, email=%s, department_id=%s WHERE admin_id=%s",
                (name, email, department_id, admin_id)
            )
        
        conn.commit()
        return {"message": "Admin updated successfully"}
    except mysql.connector.IntegrityError as err:
        if err.errno == 1062:
            raise HTTPException(status_code=400, detail="Email already exists")
        raise HTTPException(status_code=400, detail=str(err))
    finally:
        cursor.close()
        conn.close()

@router.put("/superadmin/admins/{admin_id}/status", dependencies=[Depends(require_super_admin)])
def toggle_admin_status(admin_id: int, is_active: bool = Body(..., embed=True)):
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "UPDATE admin SET is_active = %s WHERE admin_id = %s",
            (1 if is_active else 0, admin_id)
        )
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Admin not found")
        conn.commit()
        status_str = "activated" if is_active else "deactivated"
        return {"message": f"Admin {status_str} successfully."}
    finally:
        cursor.close()
        conn.close()

@router.put("/superadmin/admins/{admin_id}/password", dependencies=[Depends(require_super_admin)])
def reset_admin_password(admin_id: int, password: str = Body(..., embed=True)):
    hashed_password = pwd_context.hash(password)
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "UPDATE admin SET password_hash = %s WHERE admin_id = %s",
            (hashed_password, admin_id)
        )
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Admin not found")
        conn.commit()
        return {"message": "Admin password reset successfully."}
    finally:
        cursor.close()
        conn.close()

@router.get("/superadmin/exams", dependencies=[Depends(require_super_admin)])
def get_all_exams(
    department_id: int = Query(None),
    status: str = Query(None),
    search: str = Query(None)
):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        query = """
            SELECT 
                e.exam_id, e.exam_name, e.date, e.status, e.total_marks,
                d.department_name,
                s.subject_name,
                e.batch_year,
                e.semester,
                COALESCE(t.name, adm.name, 'N/A') as created_by
            FROM exam e
            JOIN department d ON e.department_id = d.department_id
            JOIN subject s ON e.subject_id = s.subject_id
            LEFT JOIN teacher t ON e.created_by_teacher = t.teacher_id
            LEFT JOIN admin adm ON e.created_by_admin = adm.admin_id
            WHERE 1=1
        """
        params = []

        if department_id:
            query += " AND e.department_id = %s"
            params.append(department_id)
        if status:
            query += " AND e.status = %s"
            params.append(status)
        if search:
            query += " AND (e.exam_name LIKE %s OR s.subject_name LIKE %s)"
            params.extend([f"%{search}%", f"%{search}%"])

        query += " ORDER BY e.date DESC"
        cursor.execute(query, tuple(params))
        return cursor.fetchall()
    finally:
        cursor.close()
        conn.close()

@router.get("/superadmin/teachers", dependencies=[Depends(require_super_admin)])
def get_all_teachers(
    department_id: int = Query(None),
    search: str = Query(None)
):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        query = """
            SELECT t.teacher_id, t.name, t.email, d.department_name, t.active_status,
                   (SELECT COUNT(*) FROM exam e WHERE e.created_by_teacher = t.teacher_id) as exams_created
            FROM teacher t
            JOIN department d ON t.department_id = d.department_id
            WHERE 1=1
        """
        params = []
        if department_id:
            query += " AND t.department_id = %s"
            params.append(department_id)
        if search:
            query += " AND (t.name LIKE %s OR t.email LIKE %s)"
            params.extend([f"%{search}%", f"%{search}%"])
        
        query += " ORDER BY d.department_name, t.name"
        cursor.execute(query, tuple(params))
        return cursor.fetchall()
    finally:
        cursor.close()
        conn.close()

@router.get("/superadmin/students/stats", dependencies=[Depends(require_super_admin)])
def get_student_stats():
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        stats = {}
        
        # 1. Activity Monitoring
        cursor.execute("SELECT COUNT(DISTINCT student_id) as count FROM attempt WHERE status = 'IN_PROGRESS'")
        stats["students_in_exams"] = cursor.fetchone()["count"]

        cursor.execute("SELECT COUNT(DISTINCT user_id) as count FROM system_logs WHERE role='student' AND DATE(created_at) = CURDATE()")
        stats["students_logged_in"] = cursor.fetchone()["count"]

        cursor.execute("SELECT COUNT(*) as count FROM attempt WHERE DATE(start_time) = CURDATE()")
        stats["attempts_today"] = cursor.fetchone()["count"]

        # 2. Integrity Monitoring
        cursor.execute("SELECT COUNT(DISTINCT student_id) as count FROM violation WHERE DATE(`timestamp`) = CURDATE()")
        stats["flagged_today"] = cursor.fetchone()["count"]

        cursor.execute("SELECT COUNT(*) as count FROM violation WHERE YEARWEEK(`timestamp`, 1) = YEARWEEK(CURDATE(), 1)")
        stats["violations_this_week"] = cursor.fetchone()["count"]

        # 3. Dept Strength & Participation
        cursor.execute("""
            SELECT d.department_name,
                   COUNT(DISTINCT s.student_id) as total_students,
                   COUNT(DISTINCT a.student_id) as participating_students
            FROM department d
            LEFT JOIN student s ON d.department_id = s.department_id
            LEFT JOIN attempt a ON s.student_id = a.student_id
            GROUP BY d.department_id
        """)
        stats["dept_participation"] = cursor.fetchall()

        return stats
    finally:
        cursor.close()
        conn.close()

@router.get("/superadmin/students", dependencies=[Depends(require_super_admin)])
def get_all_students_analytics(department_id: int = Query(None), search: str = Query(None)):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        query = """
            SELECT s.student_id, s.name, s.usn, d.department_name,
                (SELECT COUNT(*) FROM attempt a WHERE a.student_id = s.student_id) as exams_taken,
                (SELECT COALESCE(AVG((r.total_marks / e.total_marks) * 100), 0) 
                 FROM result r JOIN exam e ON r.exam_id = e.exam_id 
                 WHERE r.student_id = s.student_id) as avg_score,
                (SELECT COUNT(*) FROM violation v WHERE v.student_id = s.student_id) as violations
            FROM student s
            JOIN department d ON s.department_id = d.department_id
            WHERE 1=1
        """
        params = []
        if department_id:
            query += " AND s.department_id = %s"
            params.append(department_id)
        if search:
            query += " AND (s.name LIKE %s OR s.usn LIKE %s)"
            params.extend([f"%{search}%", f"%{search}%"])
        
        query += " ORDER BY violations DESC, avg_score DESC LIMIT 100"
        cursor.execute(query, tuple(params))
        return cursor.fetchall()
    finally:
        cursor.close()
        conn.close()

@router.get("/superadmin/violations/stats", dependencies=[Depends(require_super_admin)])
def get_violation_analytics():
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        stats = {}
        
        # 1. Summary Cards
        cursor.execute("SELECT COUNT(*) as c FROM violation WHERE DATE(`timestamp`) = CURDATE()")
        stats["today"] = cursor.fetchone()["c"]
        
        cursor.execute("SELECT COUNT(*) as c FROM violation WHERE YEARWEEK(`timestamp`, 1) = YEARWEEK(CURDATE(), 1)")
        stats["week"] = cursor.fetchone()["c"]
        
        cursor.execute("SELECT COUNT(DISTINCT student_id) as c FROM violation")
        stats["students_flagged"] = cursor.fetchone()["c"]
        
        cursor.execute("SELECT COUNT(DISTINCT exam_id) as c FROM violation")
        stats["exams_affected"] = cursor.fetchone()["c"]

        # 2. Trend (Last 7 Days)
        cursor.execute("""
            SELECT DATE_FORMAT(`timestamp`, '%Y-%m-%d') as date, COUNT(*) as count 
            FROM violation 
            WHERE `timestamp` >= DATE_SUB(CURDATE(), INTERVAL 6 DAY) 
            GROUP BY DATE(`timestamp`) 
            ORDER BY date ASC
        """)
        stats["trend"] = cursor.fetchall()

        # 3. By Department
        cursor.execute("""
            SELECT d.department_name, COUNT(v.violation_id) as count 
            FROM violation v 
            JOIN student s ON v.student_id = s.student_id 
            JOIN department d ON s.department_id = d.department_id 
            GROUP BY d.department_id
        """)
        stats["by_dept"] = cursor.fetchall()

        # 4. By Type
        cursor.execute("SELECT violation_type, COUNT(*) as count FROM violation GROUP BY violation_type")
        stats["by_type"] = cursor.fetchall()

        # 5. Recent Violations
        cursor.execute("""
            SELECT v.violation_id, s.name, s.usn, d.department_name, e.exam_name, v.violation_type, v.`timestamp` 
            FROM violation v 
            JOIN student s ON v.student_id = s.student_id 
            JOIN department d ON s.department_id = d.department_id 
            JOIN exam e ON v.exam_id = e.exam_id 
            ORDER BY v.`timestamp` DESC LIMIT 10
        """)
        stats["recent"] = cursor.fetchall()

        # 6. High Risk Students
        cursor.execute("""
            SELECT s.name, s.usn, d.department_name, COUNT(v.violation_id) as violation_count 
            FROM violation v 
            JOIN student s ON v.student_id = s.student_id 
            JOIN department d ON s.department_id = d.department_id 
            GROUP BY s.student_id 
            HAVING violation_count > 1 
            ORDER BY violation_count DESC LIMIT 5
        """)
        stats["high_risk"] = cursor.fetchall()

        return stats
    finally:
        cursor.close()
        conn.close()