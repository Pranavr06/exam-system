from fastapi import APIRouter, Depends, HTTPException, Body, UploadFile, File, Query, Request
from db import get_connection
from security import get_current_user
from .system_logger import log_action
from passlib.context import CryptContext
import mysql.connector
import csv
import io

router = APIRouter()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

@router.get("/admin/profile")
def get_admin_profile(user=Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Access denied")
    
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("""
            SELECT a.name, a.email, d.department_name 
            FROM admin a
            JOIN department d ON a.department_id = d.department_id
            WHERE a.admin_id = %s
        """, (user["user_id"],))
        profile = cursor.fetchone()
        if not profile:
            raise HTTPException(status_code=404, detail="Profile not found")
        return profile
    finally:
        cursor.close()
        conn.close()

@router.get("/admin/violations/history")
def get_admin_violation_history(
    page: int = 1,
    limit: int = 20,
    status: str = Query(None),
    exam_id: int = Query(None),
    search: str = Query(None),
    start_date: str = Query(None),
    end_date: str = Query(None),
    violation_type: str = Query(None),
    user=Depends(get_current_user)
):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Access denied")

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT department_id FROM admin WHERE admin_id = %s", (user["user_id"],))
        dept_id = cursor.fetchone()["department_id"]

        base_query = """
            FROM violation v
            JOIN student s ON v.student_id = s.student_id
            JOIN exam e ON v.exam_id = e.exam_id
            WHERE e.department_id = %s
        """
        params = [dept_id]

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
            base_query += " AND (s.name LIKE %s OR s.usn LIKE %s OR v.violation_type LIKE %s)"
            params.extend([f"%{search}%", f"%{search}%", f"%{search}%"])

        cursor.execute(f"SELECT COUNT(*) as total {base_query}", tuple(params))
        total = cursor.fetchone()["total"]

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

@router.post("/admin/teachers/create")
def create_teacher(
    name: str = Body(...),
    email: str = Body(...),
    password: str = Body(...),
    user=Depends(get_current_user)
):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    hashed_password = pwd_context.hash(password)
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    try:
        # Fetch the admin's department ID
        cursor.execute("SELECT department_id FROM admin WHERE admin_id = %s", (user["user_id"],))
        admin_row = cursor.fetchone()
        if not admin_row or not admin_row["department_id"]:
            raise HTTPException(
                status_code=400,
                detail="Admin is not assigned to a department."
            )
        department_id = admin_row["department_id"]
        admin_id = user["user_id"]

        cursor.execute(
            """INSERT INTO teacher (name, email, password_hash, department_id, active_status, created_by_admin) 
               VALUES (%s, %s, %s, %s, 1, %s)""",
            (name, email, hashed_password, department_id, admin_id)
        )
        conn.commit()
        return {"message": "Teacher created successfully"}
    except mysql.connector.IntegrityError:
        raise HTTPException(status_code=400, detail="Email already exists")
    except mysql.connector.Error as err:
        raise HTTPException(status_code=400, detail=str(err))
    finally:
        cursor.close()
        conn.close()

@router.get("/admin/teachers")
def get_teachers(user=Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    try:
        cursor.execute("SELECT department_id FROM admin WHERE admin_id = %s", (user["user_id"],))
        admin_row = cursor.fetchone()
        if not admin_row or not admin_row["department_id"]:
            raise HTTPException(status_code=400, detail="Admin not assigned to department")
        
        cursor.execute("SELECT teacher_id, name, email FROM teacher WHERE department_id = %s", (admin_row["department_id"],))
        teachers = cursor.fetchall()
        return teachers
    finally:
        cursor.close()
        conn.close()

@router.post("/admin/students/create")
def create_student(
    name: str = Body(...),
    email: str = Body(...),
    password: str = Body(...),
    usn: str = Body(...),
    semester: int = Body(...),
    section_label: str = Body(...),
    section_id: int = Body(...),
    user=Depends(get_current_user)
):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    hashed_password = pwd_context.hash(password)
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    try:
        # Fetch the admin's department ID
        cursor.execute("SELECT department_id FROM admin WHERE admin_id = %s", (user["user_id"],))
        admin_row = cursor.fetchone()
        if not admin_row or not admin_row["department_id"]:
            raise HTTPException(
                status_code=400,
                detail="Admin is not assigned to a department."
            )
        department_id = admin_row["department_id"]
        admin_id = user["user_id"]

        cursor.execute(
            """INSERT INTO student (
                name, email, password_hash, usn, semester, 
                section_label, section_id, department_id, created_by_admin
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)""",
            (name, email, hashed_password, usn, semester, section_label, section_id, department_id, admin_id)
        )
        conn.commit()
        return {"message": "Student created successfully"}
    except mysql.connector.IntegrityError:
        raise HTTPException(status_code=400, detail="Email or USN already exists")
    except mysql.connector.Error as err:
        raise HTTPException(status_code=400, detail=str(err))
    finally:
        cursor.close()
        conn.close()

@router.get("/admin/students")
def get_students(
    semester: int = None,
    section_id: int = None,
    search: str = None,
    user=Depends(get_current_user)
):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    try:
        cursor.execute("SELECT department_id FROM admin WHERE admin_id = %s", (user["user_id"],))
        admin_row = cursor.fetchone()
        if not admin_row or not admin_row["department_id"]:
            raise HTTPException(status_code=400, detail="Admin not assigned to department")
        
        query = """
            SELECT s.student_id, s.name, s.email, s.usn, s.semester, sec.section_name
            FROM student s
            LEFT JOIN section sec ON s.section_id = sec.section_id
            WHERE s.department_id = %s
        """
        params = [admin_row["department_id"]]

        if semester:
            query += " AND s.semester = %s"
            params.append(semester)
        if section_id:
            query += " AND s.section_id = %s"
            params.append(section_id)
        if search:
            query += " AND (s.name LIKE %s OR s.usn LIKE %s)"
            params.extend([f"%{search}%", f"%{search}%"])

        query += " ORDER BY s.semester, sec.section_name, s.name LIMIT 500"
        
        cursor.execute(query, tuple(params))
        return cursor.fetchall()
    finally:
        cursor.close()
        conn.close()

@router.post("/admin/students/import")
async def import_students_csv(
    file: UploadFile = File(...),
    user=Depends(get_current_user)
):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="Invalid file format. Please upload a CSV file.")

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    try:
        # Get Admin Department
        cursor.execute("SELECT department_id FROM admin WHERE admin_id = %s", (user["user_id"],))
        admin_row = cursor.fetchone()
        if not admin_row or not admin_row["department_id"]:
            raise HTTPException(status_code=400, detail="Admin not assigned to department")
        department_id = admin_row["department_id"]
        admin_id = user["user_id"]

        # Read CSV
        content = await file.read()
        decoded_content = content.decode('utf-8')
        csv_reader = csv.DictReader(io.StringIO(decoded_content))

        # Normalize headers (lowercase, strip)
        if csv_reader.fieldnames:
            csv_reader.fieldnames = [name.lower().strip() for name in csv_reader.fieldnames]
        
        required_fields = {'name', 'email', 'usn', 'semester', 'section_id'}
        if not required_fields.issubset(set(csv_reader.fieldnames or [])):
             raise HTTPException(status_code=400, detail=f"CSV missing required columns: {required_fields - set(csv_reader.fieldnames or [])}")

        stats = {"added": 0, "skipped": 0, "errors": []}

        for row_num, row in enumerate(csv_reader, start=1):
            try:
                name = row.get('name')
                email = row.get('email')
                usn = row.get('usn')
                semester = row.get('semester')
                section_id = row.get('section_id')
                section_label = row.get('section_label', '') # Optional
                password = row.get('password', usn) # Default password to USN if missing

                if not all([name, email, usn, semester, section_id]):
                    stats["errors"].append(f"Row {row_num}: Missing required fields")
                    continue

                hashed_password = pwd_context.hash(password)

                cursor.execute(
                    """INSERT INTO student (
                        name, email, password_hash, usn, semester, 
                        section_label, section_id, department_id, created_by_admin
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                    (name, email, hashed_password, usn, semester, section_label, section_id, department_id, admin_id)
                )
                stats["added"] += 1
            
            except mysql.connector.IntegrityError:
                stats["skipped"] += 1
            except Exception as e:
                stats["errors"].append(f"Row {row_num}: {str(e)}")

        conn.commit()
        return {"message": "Import completed", "stats": stats}
    finally:
        cursor.close()
        conn.close()

@router.delete("/admin/teachers/{teacher_id}")
def delete_teacher(teacher_id: int, request: Request, transfer_to: int = Query(None), user=Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    try:
        # Verify ownership via department
        cursor.execute("SELECT department_id FROM admin WHERE admin_id = %s", (user["user_id"],))
        admin_dept = cursor.fetchone()["department_id"]
        
        # Check if teacher exists in this department
        cursor.execute("SELECT teacher_id, name FROM teacher WHERE teacher_id = %s AND department_id = %s", (teacher_id, admin_dept))
        teacher = cursor.fetchone()
        if not teacher:
            raise HTTPException(status_code=404, detail="Teacher not found or access denied")

        if transfer_to:
            # Verify target teacher
            cursor.execute("SELECT teacher_id FROM teacher WHERE teacher_id = %s AND department_id = %s", (transfer_to, admin_dept))
            if not cursor.fetchone():
                raise HTTPException(status_code=400, detail="Target teacher for transfer not found in your department")
            
            # Transfer Data
            cursor.execute("UPDATE exam SET created_by_teacher = %s WHERE created_by_teacher = %s", (transfer_to, teacher_id))
            cursor.execute("UPDATE exam_section SET assigned_by_teacher = %s WHERE assigned_by_teacher = %s", (transfer_to, teacher_id))
            cursor.execute("UPDATE teaching_assignment SET teacher_id = %s WHERE teacher_id = %s", (transfer_to, teacher_id))
            
            action_msg = f"Deleted Teacher: {teacher['name']} (Data transferred to ID {transfer_to})"
        else:
            # Default: Reassign exams to Admin (Course Coordinator concept)
            cursor.execute("""
                UPDATE exam 
                SET created_by_teacher = NULL, created_by_admin = %s 
                WHERE created_by_teacher = %s AND department_id = %s
            """, (user["user_id"], teacher_id, admin_dept))
            
            action_msg = f"Deleted Teacher: {teacher['name']} (Exams reassigned to Admin)"

        cursor.execute("DELETE FROM teacher WHERE teacher_id = %s AND department_id = %s", (teacher_id, admin_dept))
        
        log_action(
            user_id=user["user_id"],
            role="admin",
            department_id=admin_dept,
            action=action_msg,
            entity_type="teacher",
            entity_id=teacher_id,
            ip_address=request.client.host
        )
        
        conn.commit()
        return {"message": "Teacher deleted successfully."}
    finally:
        cursor.close()
        conn.close()

@router.delete("/admin/students/{student_id}")
def delete_student(student_id: int, user=Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    try:
        # Ownership check is implicit via department_id in query if we enforce it, 
        # but let's be safe and rely on the admin's department.
        cursor.execute("SELECT department_id FROM admin WHERE admin_id = %s", (user["user_id"],))
        admin_dept = cursor.fetchone()["department_id"]

        cursor.execute("DELETE FROM student WHERE student_id = %s AND department_id = %s", (student_id, admin_dept))
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Student not found or access denied")
        
        conn.commit()
        return {"message": "Student deleted successfully"}
    finally:
        cursor.close()
        conn.close()

@router.get("/admin/teachers/{teacher_id}")
def get_teacher(teacher_id: int, user=Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT department_id FROM admin WHERE admin_id = %s", (user["user_id"],))
        admin_dept = cursor.fetchone()["department_id"]
        
        cursor.execute("SELECT teacher_id, name, email FROM teacher WHERE teacher_id = %s AND department_id = %s", (teacher_id, admin_dept))
        teacher = cursor.fetchone()
        if not teacher:
            raise HTTPException(status_code=404, detail="Teacher not found")
        return teacher
    finally:
        cursor.close()
        conn.close()

@router.put("/admin/teachers/{teacher_id}")
def update_teacher(
    teacher_id: int,
    name: str = Body(...),
    email: str = Body(...),
    password: str = Body(None),
    user=Depends(get_current_user)
):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT department_id FROM admin WHERE admin_id = %s", (user["user_id"],))
        admin_dept = cursor.fetchone()["department_id"]

        if password and password.strip():
            hashed_password = pwd_context.hash(password)
            cursor.execute("UPDATE teacher SET name=%s, email=%s, password_hash=%s WHERE teacher_id=%s AND department_id=%s", (name, email, hashed_password, teacher_id, admin_dept))
        else:
            cursor.execute("UPDATE teacher SET name=%s, email=%s WHERE teacher_id=%s AND department_id=%s", (name, email, teacher_id, admin_dept))
        
        if cursor.rowcount == 0:
             raise HTTPException(status_code=404, detail="Teacher not found or no changes made")

        conn.commit()
        return {"message": "Teacher updated successfully"}
    except mysql.connector.IntegrityError:
        raise HTTPException(status_code=400, detail="Email already exists")
    finally:
        cursor.close()
        conn.close()

@router.get("/admin/students/{student_id}")
def get_student(student_id: int, user=Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT department_id FROM admin WHERE admin_id = %s", (user["user_id"],))
        admin_dept = cursor.fetchone()["department_id"]
        
        cursor.execute("SELECT * FROM student WHERE student_id = %s AND department_id = %s", (student_id, admin_dept))
        student = cursor.fetchone()
        if not student:
            raise HTTPException(status_code=404, detail="Student not found")
        return student
    finally:
        cursor.close()
        conn.close()

@router.put("/admin/students/{student_id}")
def update_student(
    student_id: int,
    name: str = Body(...),
    email: str = Body(...),
    usn: str = Body(...),
    semester: int = Body(...),
    section_label: str = Body(...),
    section_id: int = Body(...),
    password: str = Body(None),
    user=Depends(get_current_user)
):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT department_id FROM admin WHERE admin_id = %s", (user["user_id"],))
        admin_dept = cursor.fetchone()["department_id"]

        if password and password.strip():
            hashed_password = pwd_context.hash(password)
            cursor.execute("""
                UPDATE student SET name=%s, email=%s, usn=%s, semester=%s, section_label=%s, section_id=%s, password_hash=%s 
                WHERE student_id=%s AND department_id=%s
            """, (name, email, usn, semester, section_label, section_id, hashed_password, student_id, admin_dept))
        else:
            cursor.execute("""
                UPDATE student SET name=%s, email=%s, usn=%s, semester=%s, section_label=%s, section_id=%s 
                WHERE student_id=%s AND department_id=%s
            """, (name, email, usn, semester, section_label, section_id, student_id, admin_dept))
        
        if cursor.rowcount == 0:
             raise HTTPException(status_code=404, detail="Student not found or no changes made")

        conn.commit()
        return {"message": "Student updated successfully"}
    except mysql.connector.IntegrityError:
        raise HTTPException(status_code=400, detail="Email or USN already exists")
    finally:
        cursor.close()
        conn.close()

# --- Teaching Assignments ---

@router.post("/admin/assignments/create")
def create_assignment(
    teacher_id: int = Body(...),
    subject_id: int = Body(...),
    section_id: int = Body(...),
    user=Depends(get_current_user)
):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    try:
        # Get Admin Department
        cursor.execute("SELECT department_id FROM admin WHERE admin_id = %s", (user["user_id"],))
        admin_dept = cursor.fetchone()["department_id"]

        # Validate that Teacher, Subject, and Section belong to this department
        # (This is a simplified check; in production, you might query each table individually for better error messages)
        cursor.execute("SELECT department_id FROM teacher WHERE teacher_id = %s", (teacher_id,))
        t_row = cursor.fetchone()
        cursor.execute("SELECT department_id FROM subject WHERE subject_id = %s", (subject_id,))
        sub_row = cursor.fetchone()
        cursor.execute("SELECT department_id FROM section WHERE section_id = %s", (section_id,))
        sec_row = cursor.fetchone()

        if not (t_row and sub_row and sec_row):
             raise HTTPException(status_code=404, detail="One or more selected entities not found")
        
        if not (t_row["department_id"] == sub_row["department_id"] == sec_row["department_id"] == admin_dept):
             raise HTTPException(status_code=403, detail="All entities must belong to your department")

        # Insert Assignment
        cursor.execute(
            """INSERT INTO teaching_assignment (teacher_id, subject_id, section_id, department_id) 
               VALUES (%s, %s, %s, %s)""",
            (teacher_id, subject_id, section_id, admin_dept)
        )
        conn.commit()
        return {"message": "Class assigned successfully"}

    except mysql.connector.IntegrityError:
        raise HTTPException(status_code=400, detail="This assignment already exists")
    finally:
        cursor.close()
        conn.close()

@router.get("/admin/assignments")
def get_assignments(
    semester: int = None,
    section_id: int = None,
    teacher_id: int = None,
    subject_id: int = None,
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
            SELECT ta.assignment_id, t.name as teacher_name, s.subject_name, sec.section_name, sec.semester
            FROM teaching_assignment ta
            JOIN teacher t ON ta.teacher_id = t.teacher_id
            JOIN subject s ON ta.subject_id = s.subject_id
            JOIN section sec ON ta.section_id = sec.section_id
            WHERE ta.department_id = %s
        """
        params = [admin_dept]

        if semester:
            query += " AND sec.semester = %s"
            params.append(semester)
        if section_id:
            query += " AND ta.section_id = %s"
            params.append(section_id)
        if teacher_id:
            query += " AND ta.teacher_id = %s"
            params.append(teacher_id)
        if subject_id:
            query += " AND ta.subject_id = %s"
            params.append(subject_id)
        if search:
            query += " AND (t.name LIKE %s OR s.subject_name LIKE %s)"
            params.extend([f"%{search}%", f"%{search}%"])

        query += " ORDER BY sec.semester, sec.section_name, t.name"
        
        cursor.execute(query, tuple(params))
        return cursor.fetchall()
    finally:
        cursor.close()
        conn.close()

@router.get("/admin/assignments/{assignment_id}")
def get_assignment(assignment_id: int, user=Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT department_id FROM admin WHERE admin_id = %s", (user["user_id"],))
        admin_dept = cursor.fetchone()["department_id"]
        
        cursor.execute("SELECT * FROM teaching_assignment WHERE assignment_id = %s AND department_id = %s", (assignment_id, admin_dept))
        assignment = cursor.fetchone()
        if not assignment:
            raise HTTPException(status_code=404, detail="Assignment not found")
        return assignment
    finally:
        cursor.close()
        conn.close()

@router.put("/admin/assignments/{assignment_id}")
def update_assignment(
    assignment_id: int,
    teacher_id: int = Body(...),
    subject_id: int = Body(...),
    section_id: int = Body(...),
    user=Depends(get_current_user)
):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    try:
        cursor.execute("SELECT department_id FROM admin WHERE admin_id = %s", (user["user_id"],))
        admin_dept = cursor.fetchone()["department_id"]

        cursor.execute(
            """UPDATE teaching_assignment 
               SET teacher_id=%s, subject_id=%s, section_id=%s 
               WHERE assignment_id=%s AND department_id=%s""",
            (teacher_id, subject_id, section_id, assignment_id, admin_dept)
        )
        
        if cursor.rowcount == 0:
             raise HTTPException(status_code=404, detail="Assignment not found or no changes made")

        conn.commit()
        return {"message": "Assignment updated successfully"}
    except mysql.connector.IntegrityError:
        raise HTTPException(status_code=400, detail="This assignment already exists")
    finally:
        cursor.close()
        conn.close()

@router.delete("/admin/assignments/{assignment_id}")
def delete_assignment(assignment_id: int, user=Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT department_id FROM admin WHERE admin_id = %s", (user["user_id"],))
        admin_dept = cursor.fetchone()["department_id"]

        cursor.execute("DELETE FROM teaching_assignment WHERE assignment_id = %s AND department_id = %s", (assignment_id, admin_dept))
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Assignment not found")
        conn.commit()
        return {"message": "Assignment removed"}
    finally:
        cursor.close()
        conn.close()

@router.get("/admin/violations/stats")
def get_admin_violation_stats(status: str = Query(None), exam_id: int = Query(None), user=Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Access denied")

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT department_id FROM admin WHERE admin_id = %s", (user["user_id"],))
        dept_id = cursor.fetchone()["department_id"]

        # Base filter: Violations for students in this department
        base_where = "s.department_id = %s"
        params = [dept_id]
        
        if status:
            base_where += " AND v.review_status = %s"
            params.append(status)
        if exam_id:
            base_where += " AND v.exam_id = %s"
            params.append(exam_id)

        stats = {}
        
        # 1. Summary Cards
        cursor.execute(f"SELECT COUNT(v.violation_id) as c FROM violation v JOIN student s ON v.student_id = s.student_id WHERE {base_where} AND DATE(v.detected_at) = CURDATE()", tuple(params))
        stats["today"] = cursor.fetchone()["c"]
        
        cursor.execute(f"SELECT COUNT(v.violation_id) as c FROM violation v JOIN student s ON v.student_id = s.student_id WHERE {base_where} AND YEARWEEK(v.detected_at, 1) = YEARWEEK(CURDATE(), 1)", tuple(params))
        stats["week"] = cursor.fetchone()["c"]
        
        cursor.execute(f"SELECT COUNT(DISTINCT v.student_id) as c FROM violation v JOIN student s ON v.student_id = s.student_id WHERE {base_where}", tuple(params))
        stats["students_flagged"] = cursor.fetchone()["c"]
        
        cursor.execute(f"SELECT COUNT(DISTINCT v.exam_id) as c FROM violation v JOIN student s ON v.student_id = s.student_id WHERE {base_where}", tuple(params))
        stats["exams_affected"] = cursor.fetchone()["c"]

        # 2. Trend (Last 7 Days)
        cursor.execute(f"""
            SELECT DATE_FORMAT(v.detected_at, '%Y-%m-%d') as date, COUNT(*) as count 
            FROM violation v
            JOIN student s ON v.student_id = s.student_id
            WHERE {base_where} AND v.detected_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY) 
            GROUP BY DATE_FORMAT(v.detected_at, '%Y-%m-%d')
            ORDER BY date ASC
        """, tuple(params))
        stats["trend"] = cursor.fetchall()

        # 3. By Type
        cursor.execute(f"SELECT v.violation_type, COUNT(*) as count FROM violation v JOIN student s ON v.student_id = s.student_id WHERE {base_where} GROUP BY v.violation_type", tuple(params))
        stats["by_type"] = cursor.fetchall()

        # 4. By Exam
        cursor.execute(f"""
            SELECT e.exam_name, COUNT(v.violation_id) as count
            FROM violation v
            JOIN student s ON v.student_id = s.student_id
            JOIN exam e ON v.exam_id = e.exam_id
            WHERE {base_where}
            GROUP BY v.exam_id
            ORDER BY count DESC
            LIMIT 5
        """, tuple(params))
        stats["by_exam"] = cursor.fetchall()

        # 5. Recent Violations
        cursor.execute(f"""
            SELECT v.violation_id, s.name, s.usn, e.exam_name, v.violation_type, v.detected_at as timestamp, v.review_status
            FROM violation v 
            JOIN student s ON v.student_id = s.student_id 
            JOIN exam e ON v.exam_id = e.exam_id 
            WHERE {base_where}
            ORDER BY v.detected_at DESC LIMIT 10
        """, tuple(params))
        stats["recent"] = cursor.fetchall()

        # 6. High Risk Students
        cursor.execute(f"""
            SELECT s.name, s.usn, COUNT(v.violation_id) as violation_count 
            FROM violation v 
            JOIN student s ON v.student_id = s.student_id 
            WHERE {base_where}
            GROUP BY s.student_id 
            HAVING violation_count > 1 
            ORDER BY violation_count DESC LIMIT 5
        """, tuple(params))
        stats["high_risk"] = cursor.fetchall()

        # 7. Alerts
        alerts = []
        if stats["today"] > 10:
            alerts.append({"type": "critical", "message": f"High violation rate today ({stats['today']})."})
        stats["alerts"] = alerts

        return stats
    finally:
        cursor.close()
        conn.close()

@router.get("/admin/violations/{violation_id}")
def get_violation_details_admin(violation_id: int, user=Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Access denied")
    
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT department_id FROM admin WHERE admin_id = %s", (user["user_id"],))
        dept_id = cursor.fetchone()["department_id"]

        cursor.execute("""
            SELECT v.*, v.detected_at as timestamp, s.name as student_name, s.usn, e.exam_name, q.question_text
            FROM violation v
            JOIN student s ON v.student_id = s.student_id
            JOIN exam e ON v.exam_id = e.exam_id
            LEFT JOIN question q ON v.question_id = q.question_id
            WHERE v.violation_id = %s AND s.department_id = %s
        """, (violation_id, dept_id))
        
        violation = cursor.fetchone()
        if not violation:
            raise HTTPException(status_code=404, detail="Violation not found or access denied")
            
        cursor.execute("SELECT * FROM evidence WHERE violation_id = %s", (violation_id,))
        violation["evidence"] = cursor.fetchall()

        return violation
    finally:
        cursor.close()
        conn.close()

@router.put("/admin/violations/{violation_id}/resolve")
def resolve_violation_admin(violation_id: int, status: str = Body(...), remarks: str = Body(None), user=Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Re-using teacher logic logic or implementing similar update
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT department_id FROM admin WHERE admin_id = %s", (user["user_id"],))
        dept_id = cursor.fetchone()[0]

        cursor.execute("""
            UPDATE violation v JOIN exam e ON v.exam_id = e.exam_id
            SET v.review_status = %s, v.remarks = %s, v.reviewed_by_admin = %s, v.reviewed_at = NOW()
            WHERE v.violation_id = %s AND e.department_id = %s
        """, (status, remarks, user["user_id"], violation_id, dept_id))
        
        if cursor.rowcount == 0:
             raise HTTPException(status_code=404, detail="Violation not found or access denied")

        conn.commit()
        return {"message": f"Violation marked as {status}"}
    finally:
        cursor.close()
        conn.close()