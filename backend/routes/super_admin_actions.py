from fastapi import APIRouter, Depends, HTTPException, Body, Query, Request
from db import get_connection
from security import get_current_user
from .system_logger import log_action
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

        # Enforce One Admin per Department Rule
        cursor.execute("SELECT name FROM admin WHERE department_id = %s", (department_id,))
        existing_admin = cursor.fetchone()
        if existing_admin:
            raise HTTPException(
                status_code=400, 
                detail=f"This department already has an Admin ({existing_admin[0]}). Only one Admin (HOD) is allowed per department."
            )

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
        # Auto-update status for expired exams
        cursor.execute("""
            UPDATE exam 
            SET status = 'completed' 
            WHERE status != 'completed' AND NOW() > DATE_ADD(date, INTERVAL duration MINUTE)
        """)
        conn.commit()

        stats = {}
        cursor.execute("SELECT COUNT(*) as count FROM department")
        stats["total_departments"] = cursor.fetchone()["count"]
        
        cursor.execute("SELECT COUNT(*) as count FROM admin")
        stats["total_admins"] = cursor.fetchone()["count"]
        
        cursor.execute("SELECT COUNT(*) as count FROM teacher")
        stats["total_teachers"] = cursor.fetchone()["count"]

        cursor.execute("SELECT COUNT(*) as count FROM student")
        stats["total_students"] = cursor.fetchone()["count"]

        cursor.execute("SELECT COUNT(*) as count FROM exam WHERE is_archived = 0")
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
            WHERE e.status = 'active' AND NOW() >= e.date AND NOW() <= (e.date + INTERVAL e.duration MINUTE) AND e.is_archived = 0
            LIMIT 5
        """)
        stats["active_exams"] = cursor.fetchall()

        # 3. Recent Violations
        cursor.execute("""
            SELECT v.violation_type, s.name as student_name, d.department_name, e.exam_name, v.detected_at as timestamp
            FROM violation v
            JOIN student s ON v.student_id = s.student_id
            JOIN department d ON s.department_id = d.department_id
            JOIN exam e ON v.exam_id = e.exam_id
            ORDER BY v.detected_at DESC
            LIMIT 5
        """)
        stats["recent_violations"] = cursor.fetchall()

        # 4. Department Performance & Health
        cursor.execute("""
            SELECT 
                d.department_name,
                (SELECT COALESCE(AVG((r.total_marks / e.total_marks) * 100), 0) 
                 FROM result r JOIN exam e ON r.exam_id = e.exam_id
                 WHERE e.department_id = d.department_id AND e.is_archived = 0) as avg_score,
                (SELECT COUNT(*) FROM exam e WHERE e.department_id = d.department_id AND (e.status = 'completed' OR NOW() > (e.date + INTERVAL e.duration MINUTE)) AND e.is_archived = 0) as completed_exams,
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

        # 10. System Alerts
        alerts = []
        # Exams without questions
        cursor.execute("""
            SELECT e.exam_name, d.department_name
            FROM exam e 
            LEFT JOIN question q ON e.exam_id = q.exam_id 
            JOIN department d ON e.department_id = d.department_id
            WHERE e.is_archived = 0 AND q.question_id IS NULL AND e.status != 'completed'
        """)
        empty_exams = cursor.fetchall()
        for e in empty_exams:
            alerts.append({"type": "warning", "message": f"⚠️ Exam '{e['exam_name']}' ({e['department_name']}) has no questions."})
        stats["alerts"] = alerts

        stats["system_status"] = "Online"
        
        return stats
    finally:
        cursor.close()
        conn.close()

@router.get("/superadmin/system/health", dependencies=[Depends(require_super_admin)])
def check_system_health():
    db_status = "Inactive"
    try:
        conn = get_connection()
        if conn and conn.is_connected():
            cursor = conn.cursor()
            cursor.execute("SELECT 1")
            cursor.fetchone()
            cursor.close()
            conn.close()
            db_status = "Active"
    except Exception:
        pass
    
    return {"database": db_status, "server": "Online"}

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

@router.delete("/superadmin/admins/{admin_id}")
def delete_admin(admin_id: int, request: Request, user=Depends(require_super_admin)):
    conn = get_connection()
    cursor = conn.cursor()
    try:
        # Check if admin exists
        cursor.execute("SELECT admin_id, name FROM admin WHERE admin_id = %s", (admin_id,))
        admin = cursor.fetchone()
        if not admin:
            raise HTTPException(status_code=404, detail="Admin not found")

        # Unlink dependencies to preserve data (Department-level ownership remains via department_id)
        cursor.execute("UPDATE exam SET created_by_admin = NULL WHERE created_by_admin = %s", (admin_id,))
        cursor.execute("UPDATE subject SET created_by_admin = NULL WHERE created_by_admin = %s", (admin_id,))
        cursor.execute("UPDATE teacher SET created_by_admin = NULL WHERE created_by_admin = %s", (admin_id,))
        cursor.execute("UPDATE student SET created_by_admin = NULL WHERE created_by_admin = %s", (admin_id,))
        cursor.execute("UPDATE exam_section SET assigned_by_admin = NULL WHERE assigned_by_admin = %s", (admin_id,))
        cursor.execute("UPDATE violation SET reviewed_by_admin = NULL WHERE reviewed_by_admin = %s", (admin_id,))

        # Delete the admin
        cursor.execute("DELETE FROM admin WHERE admin_id = %s", (admin_id,))
        
        # Log the action
        log_action(
            user_id=user["user_id"],
            role="super_admin",
            department_id=None, # Super admin action is global
            action=f"Deleted Admin: {admin[1]}",
            entity_type="admin",
            entity_id=admin_id,
            ip_address=request.client.host
        )
        
        conn.commit()
        return {"message": "Admin deleted successfully. Their records have been preserved in the department."}
    finally:
        cursor.close()
        conn.close()

@router.post("/superadmin/admins/replace")
def replace_admin(
    request: Request,
    current_admin_id: int = Body(...),
    new_name: str = Body(...),
    new_email: str = Body(...),
    new_password: str = Body(...),
    user=Depends(require_super_admin)
):
    # Domain restriction
    if not new_email.endswith("@nitte.edu.in"):
        raise HTTPException(status_code=400, detail="Invalid admin email domain. Must be @nitte.edu.in")

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        # 1. Get Current Admin & Dept
        cursor.execute("SELECT department_id, name FROM admin WHERE admin_id = %s", (current_admin_id,))
        current_admin = cursor.fetchone()
        if not current_admin:
            raise HTTPException(status_code=404, detail="Current admin not found")
        
        dept_id = current_admin["department_id"]
        hashed_password = pwd_context.hash(new_password)

        # 2. Create New Admin (We bypass the 'One Admin' check here because we are in a replacement transaction)
        try:
            cursor.execute(
                "INSERT INTO admin (name, email, password_hash, department_id, role) VALUES (%s, %s, %s, %s, 'admin')",
                (new_name, new_email, hashed_password, dept_id)
            )
            new_admin_id = cursor.lastrowid
        except mysql.connector.IntegrityError:
            raise HTTPException(status_code=400, detail="Email for new admin already exists")

        # 3. Transfer Ownership of ALL assets
        # Note: We use the cursor to execute updates. Since this is one transaction, it's safe.
        cursor.execute("UPDATE exam SET created_by_admin = %s WHERE created_by_admin = %s", (new_admin_id, current_admin_id))
        cursor.execute("UPDATE subject SET created_by_admin = %s WHERE created_by_admin = %s", (new_admin_id, current_admin_id))
        cursor.execute("UPDATE teacher SET created_by_admin = %s WHERE created_by_admin = %s", (new_admin_id, current_admin_id))
        cursor.execute("UPDATE student SET created_by_admin = %s WHERE created_by_admin = %s", (new_admin_id, current_admin_id))
        cursor.execute("UPDATE exam_section SET assigned_by_admin = %s WHERE assigned_by_admin = %s", (new_admin_id, current_admin_id))
        cursor.execute("UPDATE violation SET reviewed_by_admin = %s WHERE reviewed_by_admin = %s", (new_admin_id, current_admin_id))

        # 4. Delete Old Admin
        cursor.execute("DELETE FROM admin WHERE admin_id = %s", (current_admin_id,))

        # 5. Log
        log_action(
            user_id=user["user_id"],
            role="super_admin",
            department_id=None,
            action=f"Replaced Admin {current_admin['name']} with {new_name}",
            entity_type="admin",
            entity_id=new_admin_id,
            ip_address=request.client.host
        )

        conn.commit()
        return {"message": f"Admin replaced successfully. All department data transferred to {new_name}."}
    finally:
        cursor.close()
        conn.close()

@router.get("/superadmin/exams", dependencies=[Depends(require_super_admin)])
def get_all_exams(
    department_id: int = Query(None),
    status: str = Query(None),
    search: str = Query(None),
    archived: bool = Query(False)
):
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
            SELECT 
                e.exam_id, e.exam_name, e.date, 
                CASE
                    WHEN e.status = 'completed' THEN 'completed'
                    WHEN NOW() > (e.date + INTERVAL e.duration MINUTE) THEN 'completed'
                    WHEN e.status = 'active' AND NOW() >= e.date THEN 'active'
                    ELSE 'scheduled'
                END as status, e.total_marks,
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
            WHERE e.is_archived = %s
        """
        params = [1 if archived else 0]

        if department_id:
            query += " AND e.department_id = %s"
            params.append(department_id)
        if search:
            query += " AND (e.exam_name LIKE %s OR s.subject_name LIKE %s)"
            params.extend([f"%{search}%", f"%{search}%"])

        if status:
            query += " HAVING status = %s"
            params.append(status)
        query += " ORDER BY e.date DESC"
        cursor.execute(query, tuple(params))
        return cursor.fetchall()
    finally:
        cursor.close()
        conn.close()

@router.put("/superadmin/exams/{exam_id}/restore", dependencies=[Depends(require_super_admin)])
def restore_exam_superadmin(exam_id: int):
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("UPDATE exam SET is_archived = 0 WHERE exam_id = %s", (exam_id,))
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Exam not found")
        conn.commit()
        return {"message": "Exam restored successfully"}
    finally:
        cursor.close()
        conn.close()

@router.delete("/superadmin/exams/cleanup", dependencies=[Depends(require_super_admin)])
def cleanup_archived_exams(days: int = Query(30, ge=1)):
    conn = get_connection()
    cursor = conn.cursor()
    try:
        # Delete exams that are archived AND scheduled date is older than X days
        cursor.execute("""
            DELETE FROM exam 
            WHERE is_archived = 1 
            AND date < DATE_SUB(NOW(), INTERVAL %s DAY)
        """, (days,))
        deleted_count = cursor.rowcount
        conn.commit()
        return {"message": f"Cleanup complete. {deleted_count} archived exams older than {days} days were permanently deleted."}
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
        cursor.execute("SELECT COUNT(DISTINCT student_id) as count FROM violation WHERE DATE(detected_at) = CURDATE()")
        stats["flagged_today"] = cursor.fetchone()["count"]

        cursor.execute("SELECT COUNT(*) as count FROM violation WHERE YEARWEEK(detected_at, 1) = YEARWEEK(CURDATE(), 1)")
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
            SELECT s.student_id, s.name, s.usn, d.department_name, s.risk_status,
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
def get_violation_analytics(status: str = Query(None), exam_id: int = Query(None), violation_type: str = Query(None)):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        where_clause = "1=1"
        params = []
        if status:
            where_clause += " AND review_status = %s"
            params.append(status)
        if exam_id:
            where_clause += " AND exam_id = %s"
            params.append(exam_id)
        if violation_type:
            where_clause += " AND violation_type = %s"
            params.append(violation_type)

        stats = {}
        
        # 1. Summary Cards
        cursor.execute(f"SELECT COUNT(*) as c FROM violation WHERE {where_clause} AND DATE(detected_at) = CURDATE()", tuple(params))
        stats["today"] = cursor.fetchone()["c"]
        
        cursor.execute(f"SELECT COUNT(*) as c FROM violation WHERE {where_clause} AND YEARWEEK(detected_at, 1) = YEARWEEK(CURDATE(), 1)", tuple(params))
        stats["week"] = cursor.fetchone()["c"]
        
        cursor.execute(f"SELECT COUNT(DISTINCT student_id) as c FROM violation WHERE {where_clause}", tuple(params))
        stats["students_flagged"] = cursor.fetchone()["c"]
        
        cursor.execute(f"SELECT COUNT(DISTINCT exam_id) as c FROM violation WHERE {where_clause}", tuple(params))
        stats["exams_affected"] = cursor.fetchone()["c"]

        # 2. Trend (Last 7 Days)
        cursor.execute(f"""
            SELECT DATE_FORMAT(detected_at, '%Y-%m-%d') as date, COUNT(*) as count 
            FROM violation 
            WHERE {where_clause} AND detected_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY) 
            GROUP BY DATE_FORMAT(detected_at, '%Y-%m-%d')
            ORDER BY date ASC
        """, tuple(params))
        stats["trend"] = cursor.fetchall()

        # 3. By Department
        # Need to join student to filter by violation status if needed, but violation table has review_status
        cursor.execute(f"""
            SELECT d.department_name, COUNT(v.violation_id) as count 
            FROM violation v 
            JOIN student s ON v.student_id = s.student_id 
            JOIN department d ON s.department_id = d.department_id 
            WHERE {where_clause.replace('review_status', 'v.review_status')}
            GROUP BY d.department_id
        """, tuple(params))
        stats["by_dept"] = cursor.fetchall()

        # 4. By Type
        cursor.execute(f"SELECT violation_type, COUNT(*) as count FROM violation WHERE {where_clause} GROUP BY violation_type", tuple(params))
        stats["by_type"] = cursor.fetchall()

        # 5. Recent Violations
        cursor.execute(f"""
            SELECT v.violation_id, s.name, s.usn, d.department_name, e.exam_name, v.violation_type, v.detected_at as timestamp, v.review_status
            FROM violation v 
            JOIN student s ON v.student_id = s.student_id 
            JOIN department d ON s.department_id = d.department_id 
            JOIN exam e ON v.exam_id = e.exam_id 
            WHERE {where_clause.replace('review_status', 'v.review_status')}
            ORDER BY v.detected_at DESC LIMIT 10
        """, tuple(params))
        stats["recent"] = cursor.fetchall()

        # 6. High Risk Students
        cursor.execute(f"""
            SELECT s.name, s.usn, d.department_name, COUNT(v.violation_id) as violation_count 
            FROM violation v 
            JOIN student s ON v.student_id = s.student_id 
            JOIN department d ON s.department_id = d.department_id 
            WHERE {where_clause.replace('review_status', 'v.review_status')}
            GROUP BY s.student_id 
            HAVING violation_count > 1 
            ORDER BY violation_count DESC LIMIT 5
        """, tuple(params))
        stats["high_risk"] = cursor.fetchall()

        return stats
    finally:
        cursor.close()
        conn.close()

@router.get("/superadmin/violations/history", dependencies=[Depends(require_super_admin)])
def get_superadmin_violation_history(
    page: int = 1,
    limit: int = 20,
    status: str = Query(None),
    exam_id: int = Query(None),
    search: str = Query(None),
    start_date: str = Query(None),
    end_date: str = Query(None),
    violation_type: str = Query(None)
):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        base_query = """
            FROM violation v
            JOIN student s ON v.student_id = s.student_id
            JOIN exam e ON v.exam_id = e.exam_id
            JOIN department d ON s.department_id = d.department_id
            WHERE 1=1
        """
        params = []

        if status:
            base_query += " AND v.review_status = %s"
            params.append(status)
        if exam_id:
            base_query += " AND v.exam_id = %s"
            params.append(exam_id)
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
            base_query += " AND (s.name LIKE %s OR s.usn LIKE %s OR d.department_name LIKE %s OR v.violation_type LIKE %s)"
            params.extend([f"%{search}%", f"%{search}%", f"%{search}%", f"%{search}%"])

        cursor.execute(f"SELECT COUNT(*) as total {base_query}", tuple(params))
        total = cursor.fetchone()["total"]

        query = f"""
            SELECT v.violation_id, s.name as student_name, s.usn, d.department_name, e.exam_name, 
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