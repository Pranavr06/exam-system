from fastapi import APIRouter, Depends, HTTPException, Body
from db import get_connection
from security import get_current_user
from passlib.context import CryptContext
import mysql.connector

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

@router.delete("/admin/teachers/{teacher_id}")
def delete_teacher(teacher_id: int, user=Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    try:
        # Verify ownership via department
        cursor.execute("SELECT department_id FROM admin WHERE admin_id = %s", (user["user_id"],))
        admin_dept = cursor.fetchone()["department_id"]
        
        cursor.execute("DELETE FROM teacher WHERE teacher_id = %s AND department_id = %s", (teacher_id, admin_dept))
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Teacher not found or access denied")
        
        conn.commit()
        return {"message": "Teacher deleted successfully"}
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