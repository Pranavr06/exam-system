from fastapi import APIRouter, Depends, HTTPException, Body
from db import get_connection
from security import get_current_user
import mysql.connector

router = APIRouter()


@router.post("/admin/subjects/create")
def create_subject(
    subject_name: str = Body(..., embed=True),
    user=Depends(get_current_user)
):
    # ✅ role guard (CRITICAL)
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    try:
        # 🔒 Auto-detect Admin's Department
        cursor.execute("SELECT department_id FROM admin WHERE admin_id = %s", (user["user_id"],))
        admin_row = cursor.fetchone()
        if not admin_row or not admin_row["department_id"]:
            raise HTTPException(status_code=400, detail="Admin not assigned to department")
        department_id = admin_row["department_id"]

        cursor.execute(
            "INSERT INTO subject (subject_name, department_id, created_by_admin) VALUES (%s, %s, %s)",
            (subject_name, department_id, user["user_id"])
        )
        conn.commit()
        return {"message": "Subject created successfully"}
    except mysql.connector.IntegrityError as err:
        if err.errno == 1062:
            raise HTTPException(status_code=400, detail="Subject with this name already exists in your department")
        raise HTTPException(status_code=400, detail=str(err))
    except mysql.connector.Error as err:
        raise HTTPException(status_code=400, detail=str(err))
    finally:
        cursor.close()
        conn.close()


@router.post("/admin/sections/create")
def create_section(
    name: str = Body(...),
    semester: int = Body(...),
    user=Depends(get_current_user)
):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        # 🔒 Auto-detect Admin's Department
        cursor.execute("SELECT department_id FROM admin WHERE admin_id = %s", (user["user_id"],))
        admin_row = cursor.fetchone()
        if not admin_row or not admin_row["department_id"]:
            raise HTTPException(status_code=400, detail="Admin not assigned to department")
        department_id = admin_row["department_id"]

        cursor.execute(
            "INSERT INTO section (section_name, semester, department_id) VALUES (%s, %s, %s)",
            (name, semester, department_id)
        )
        conn.commit()
        return {"message": "Section created successfully"}
    except mysql.connector.IntegrityError as err:
        if err.errno == 1062:
            raise HTTPException(status_code=400, detail="Section with this name and semester already exists in your department")
        raise HTTPException(status_code=400, detail=str(err))
    except mysql.connector.Error as err:
        raise HTTPException(status_code=400, detail=str(err))
    finally:
        cursor.close()
        conn.close()

@router.get("/admin/sections")
def get_sections(user=Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    try:
        cursor.execute("SELECT department_id FROM admin WHERE admin_id = %s", (user["user_id"],))
        admin_row = cursor.fetchone()
        if not admin_row or not admin_row["department_id"]:
            raise HTTPException(status_code=400, detail="Admin not assigned to department")
        
        cursor.execute("SELECT section_id, section_name, semester FROM section WHERE department_id = %s", (admin_row["department_id"],))
        sections = cursor.fetchall()
        return sections
    finally:
        cursor.close()
        conn.close()

@router.get("/admin/subjects")
def get_subjects(user=Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    try:
        cursor.execute("SELECT department_id FROM admin WHERE admin_id = %s", (user["user_id"],))
        admin_row = cursor.fetchone()
        if not admin_row or not admin_row["department_id"]:
            raise HTTPException(status_code=400, detail="Admin not assigned to department")
        
        cursor.execute("SELECT subject_id, subject_name FROM subject WHERE department_id = %s", (admin_row["department_id"],))
        subjects = cursor.fetchall()
        return subjects
    finally:
        cursor.close()
        conn.close()

@router.delete("/admin/subjects/{subject_id}")
def delete_subject(subject_id: int, user=Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    try:
        cursor.execute("SELECT department_id FROM admin WHERE admin_id = %s", (user["user_id"],))
        admin_dept = cursor.fetchone()["department_id"]

        cursor.execute("DELETE FROM subject WHERE subject_id = %s AND department_id = %s", (subject_id, admin_dept))
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Subject not found or access denied")
        
        conn.commit()
        return {"message": "Subject deleted successfully"}
    finally:
        cursor.close()
        conn.close()

@router.delete("/admin/sections/{section_id}")
def delete_section(section_id: int, user=Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    try:
        cursor.execute("SELECT department_id FROM admin WHERE admin_id = %s", (user["user_id"],))
        admin_dept = cursor.fetchone()["department_id"]

        cursor.execute("DELETE FROM section WHERE section_id = %s AND department_id = %s", (section_id, admin_dept))
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Section not found or access denied")
        
        conn.commit()
        return {"message": "Section deleted successfully"}
    finally:
        cursor.close()
        conn.close()

@router.get("/admin/subjects/{subject_id}")
def get_subject(subject_id: int, user=Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT department_id FROM admin WHERE admin_id = %s", (user["user_id"],))
        admin_dept = cursor.fetchone()["department_id"]
        cursor.execute("SELECT * FROM subject WHERE subject_id = %s AND department_id = %s", (subject_id, admin_dept))
        subject = cursor.fetchone()
        if not subject: raise HTTPException(status_code=404, detail="Subject not found")
        return subject
    finally:
        cursor.close()
        conn.close()

@router.put("/admin/subjects/{subject_id}")
def update_subject(subject_id: int, subject_name: str = Body(..., embed=True), user=Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT department_id FROM admin WHERE admin_id = %s", (user["user_id"],))
        admin_dept = cursor.fetchone()["department_id"]
        cursor.execute("UPDATE subject SET subject_name=%s WHERE subject_id=%s AND department_id=%s", (subject_name, subject_id, admin_dept))
        conn.commit()
        return {"message": "Subject updated successfully"}
    except mysql.connector.IntegrityError:
        raise HTTPException(status_code=400, detail="Subject name already exists")
    finally:
        cursor.close()
        conn.close()

@router.get("/admin/sections/{section_id}")
def get_section(section_id: int, user=Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT department_id FROM admin WHERE admin_id = %s", (user["user_id"],))
        admin_dept = cursor.fetchone()["department_id"]
        cursor.execute("SELECT * FROM section WHERE section_id = %s AND department_id = %s", (section_id, admin_dept))
        section = cursor.fetchone()
        if not section: raise HTTPException(status_code=404, detail="Section not found")
        return section
    finally:
        cursor.close()
        conn.close()

@router.put("/admin/sections/{section_id}")
def update_section(
    section_id: int,
    name: str = Body(...),
    semester: int = Body(...),
    user=Depends(get_current_user)
):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT department_id FROM admin WHERE admin_id = %s", (user["user_id"],))
        admin_dept = cursor.fetchone()["department_id"]
        cursor.execute("UPDATE section SET section_name=%s, semester=%s WHERE section_id=%s AND department_id=%s", (name, semester, section_id, admin_dept))
        conn.commit()
        return {"message": "Section updated successfully"}
    except mysql.connector.IntegrityError:
        raise HTTPException(status_code=400, detail="Section already exists")
    finally:
        cursor.close()
        conn.close()