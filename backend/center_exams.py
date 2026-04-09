from fastapi import APIRouter, Depends, HTTPException, Body
from pydantic import BaseModel, model_validator, Field
from typing import Optional, List
from db import get_connection
import mysql.connector
from security import get_current_user

router = APIRouter()

# ==========================================
# 1. ROLE-BASED ACCESS DEPENDENCIES
# ==========================================

def require_super_admin(user: dict = Depends(get_current_user)):
    if user.get("role") != "super_admin":
        raise HTTPException(status_code=403, detail="Strictly Super Admin access required.")
    return user

def require_exam_creator(user: dict = Depends(get_current_user)):
    role = user.get("role")
    if role not in ["admin", "teacher"]:
        raise HTTPException(status_code=403, detail="Super Admins and Students cannot create or manage exams.")
    return user

def require_student(user: dict = Depends(get_current_user)):
    if user.get("role") != "student":
        raise HTTPException(status_code=403, detail="Student access required.")
    return user

# ==========================================
# 2. PYDANTIC VALIDATION MODELS
# ==========================================

class ExamCreateRequest(BaseModel):
    exam_name: str
    subject_id: int
    duration: int
    total_marks: int
    exam_date: str
    mode: str  # 'ONLINE' or 'CENTER'
    lab_id: Optional[int] = None
    password: Optional[str] = None

    @model_validator(mode='after')
    def validate_exam_mode(self) -> 'ExamCreateRequest':
        if self.mode == 'CENTER':
            if not self.lab_id or not self.password:
                raise ValueError("CENTER mode strictly requires both 'lab_id' and 'password'.")
        elif self.mode == 'ONLINE':
            if self.lab_id is not None or self.password is not None:
                raise ValueError("ONLINE mode must not include 'lab_id' or 'password'.")
        else:
            raise ValueError("Invalid exam mode. Must be 'ONLINE' or 'CENTER'.")
        return self

class FloorCreateRequest(BaseModel):
    block_id: int
    floor_number: int = Field(..., ge=-1, le=7, description="Floor must be between -1 (Basement) and 7")

class LabCreateRequest(BaseModel):
    floor_id: int
    lab_name: str

class PCCreateRequest(BaseModel):
    lab_id: int
    pc_number: str

class BlockUpdateRequest(BaseModel):
    name: str

class FloorUpdateRequest(BaseModel):
    floor_number: int = Field(..., ge=-1, le=7, description="Floor must be between -1 (Basement) and 7")

class LabUpdateRequest(BaseModel):
    lab_name: str

class PCUpdateRequest(BaseModel):
    pc_number: str
    status: str

class PCAssignmentRequest(BaseModel):
    student_id: int
    pc_id: int

class StartExamRequest(BaseModel):
    password: Optional[str] = None

# ==========================================
# 3. SUPER ADMIN INFRASTRUCTURE APIs
# ==========================================

@router.post("/infrastructure/block", dependencies=[Depends(require_super_admin)])
def create_academic_block(name: str = Body(..., embed=True)):
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("INSERT INTO academic_block (name) VALUES (%s)", (name,))
        conn.commit()
        return {"message": "Academic Block created successfully", "block_id": cursor.lastrowid}
    except mysql.connector.IntegrityError:
        raise HTTPException(status_code=400, detail="An academic block with this name already exists.")
    finally:
        cursor.close()
        conn.close()

@router.post("/infrastructure/floor", dependencies=[Depends(require_super_admin)])
def create_floor(payload: FloorCreateRequest):
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("INSERT INTO floor (block_id, floor_number) VALUES (%s, %s)", (payload.block_id, payload.floor_number))
        conn.commit()
        return {"message": "Floor created successfully", "floor_id": cursor.lastrowid}
    except mysql.connector.IntegrityError:
        raise HTTPException(status_code=400, detail="This floor number already exists in the selected block.")
    finally:
        cursor.close()
        conn.close()

@router.post("/infrastructure/lab", dependencies=[Depends(require_super_admin)])
def create_lab(payload: LabCreateRequest):
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("INSERT INTO lab (floor_id, lab_name) VALUES (%s, %s)", (payload.floor_id, payload.lab_name))
        conn.commit()
        return {"message": "Lab created successfully", "lab_id": cursor.lastrowid}
    except mysql.connector.IntegrityError:
        raise HTTPException(status_code=400, detail="A lab with this name already exists on the selected floor.")
    finally:
        cursor.close()
        conn.close()

@router.post("/infrastructure/pc", dependencies=[Depends(require_super_admin)])
def create_pc(payload: PCCreateRequest):
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("INSERT INTO pc (lab_id, pc_number) VALUES (%s, %s)", (payload.lab_id, payload.pc_number))
        conn.commit()
        return {"message": "PC created successfully", "pc_id": cursor.lastrowid}
    except mysql.connector.IntegrityError:
        raise HTTPException(status_code=400, detail="A PC with this number already exists in the selected lab.")
    finally:
        cursor.close()
        conn.close()

@router.get("/infrastructure/pcs", dependencies=[Depends(require_super_admin)])
def get_all_pcs():
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("""
            SELECT 
                p.pc_id, p.pc_number, p.status, p.ip_address,
                l.lab_name,
                f.floor_number,
                b.name as block_name
            FROM pc p
            JOIN lab l ON p.lab_id = l.lab_id
            JOIN floor f ON l.floor_id = f.floor_id
            JOIN academic_block b ON f.block_id = b.block_id
            ORDER BY b.name, f.floor_number, l.lab_name, p.pc_number
        """)
        return cursor.fetchall()
    finally:
        cursor.close()
        conn.close()

@router.put("/infrastructure/block/{block_id}", dependencies=[Depends(require_super_admin)])
def update_block(block_id: int, payload: BlockUpdateRequest):
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("UPDATE academic_block SET name = %s WHERE block_id = %s", (payload.name, block_id))
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Block not found")
        conn.commit()
        return {"message": "Block updated successfully."}
    except mysql.connector.IntegrityError:
        raise HTTPException(status_code=400, detail="An academic block with this name already exists.")
    finally:
        cursor.close()
        conn.close()

@router.delete("/infrastructure/block/{block_id}", dependencies=[Depends(require_super_admin)])
def delete_block(block_id: int):
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM academic_block WHERE block_id = %s", (block_id,))
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Block not found")
        conn.commit()
        return {"message": "Block and all its floors, labs, and PCs deleted successfully."}
    finally:
        cursor.close()
        conn.close()

@router.put("/infrastructure/floor/{floor_id}", dependencies=[Depends(require_super_admin)])
def update_floor(floor_id: int, payload: FloorUpdateRequest):
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("UPDATE floor SET floor_number = %s WHERE floor_id = %s", (payload.floor_number, floor_id))
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Floor not found")
        conn.commit()
        return {"message": "Floor updated successfully."}
    except mysql.connector.IntegrityError:
        raise HTTPException(status_code=400, detail="This floor number already exists in the selected block.")
    finally:
        cursor.close()
        conn.close()

@router.delete("/infrastructure/floor/{floor_id}", dependencies=[Depends(require_super_admin)])
def delete_floor(floor_id: int):
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM floor WHERE floor_id = %s", (floor_id,))
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Floor not found")
        conn.commit()
        return {"message": "Floor and all its labs and PCs deleted successfully."}
    finally:
        cursor.close()
        conn.close()

@router.get("/infrastructure/labs", dependencies=[Depends(get_current_user)])
def get_lab_hierarchy():
    """Returns the cascading hierarchy for Exam Creators to use in dropdowns."""
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("""
            SELECT b.block_id, b.name as block_name, 
                   f.floor_id, f.floor_number, 
                   l.lab_id, l.lab_name
            FROM academic_block b
            LEFT JOIN floor f ON b.block_id = f.block_id
            LEFT JOIN lab l ON f.floor_id = l.floor_id
            ORDER BY b.name, f.floor_number, l.lab_name
        """)
        return cursor.fetchall()
    finally:
        cursor.close()
        conn.close()

@router.put("/infrastructure/lab/{lab_id}", dependencies=[Depends(require_super_admin)])
def update_lab(lab_id: int, payload: LabUpdateRequest):
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("UPDATE lab SET lab_name = %s WHERE lab_id = %s", (payload.lab_name, lab_id))
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Lab not found")
        conn.commit()
        return {"message": "Lab updated successfully."}
    except mysql.connector.IntegrityError:
        raise HTTPException(status_code=400, detail="A lab with this name already exists on the selected floor.")
    finally:
        cursor.close()
        conn.close()

@router.delete("/infrastructure/lab/{lab_id}", dependencies=[Depends(require_super_admin)])
def delete_lab(lab_id: int):
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM lab WHERE lab_id = %s", (lab_id,))
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Lab not found")
        conn.commit()
        return {"message": "Lab and all its PCs deleted successfully."}
    finally:
        cursor.close()
        conn.close()

@router.put("/infrastructure/pc/{pc_id}", dependencies=[Depends(require_super_admin)])
def update_pc(pc_id: int, payload: PCUpdateRequest):
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("UPDATE pc SET pc_number = %s, status = %s WHERE pc_id = %s", (payload.pc_number, payload.status, pc_id))
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="PC not found")
        conn.commit()
        return {"message": "PC updated successfully."}
    except mysql.connector.IntegrityError:
        raise HTTPException(status_code=400, detail="A PC with this number already exists in the selected lab.")
    finally:
        cursor.close()
        conn.close()

@router.delete("/infrastructure/pc/{pc_id}", dependencies=[Depends(require_super_admin)])
def delete_pc(pc_id: int):
    conn = get_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM pc WHERE pc_id = %s", (pc_id,))
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="PC not found")
        conn.commit()
        return {"message": "PC deleted successfully."}
    finally:
        cursor.close()
        conn.close()

# ==========================================
# 4. EXAM CREATOR APIs (Admin / Teacher)
# ==========================================

@router.post("/exams/create-robust")
def create_robust_exam(payload: ExamCreateRequest, user: dict = Depends(require_exam_creator)):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    
    try:
        # Double-check lab_id exists in DB if CENTER mode
        if payload.mode == 'CENTER':
            cursor.execute("SELECT lab_id FROM lab WHERE lab_id = %s", (payload.lab_id,))
            if not cursor.fetchone():
                raise HTTPException(status_code=404, detail="The specified Lab ID does not exist.")

        # Insert logic based on role context (assuming admin vs teacher ownership mappings logic)
        created_by_admin = user["user_id"] if user["role"] == "admin" else None
        created_by_teacher = user["user_id"] if user["role"] == "teacher" else None
        
        query = """
            INSERT INTO exam (
                exam_name, subject_id, date, duration, total_marks, mode, lab_id, password, created_by_admin, created_by_teacher
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """
        params = (
            payload.exam_name, payload.subject_id, payload.exam_date, payload.duration, 
            payload.total_marks, payload.mode, payload.lab_id, payload.password,
            created_by_admin, created_by_teacher
        )
        
        cursor.execute(query, params)
        conn.commit()
        
        return {"message": f"{payload.mode} Exam created successfully.", "exam_id": cursor.lastrowid}
    finally:
        cursor.close()
        conn.close()

@router.post("/exams/{exam_id}/assign-pc")
def assign_students_to_pcs(exam_id: int, assignments: List[PCAssignmentRequest], user: dict = Depends(require_exam_creator)):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    
    try:
        # Verify Exam is CENTER mode
        cursor.execute("SELECT mode FROM exam WHERE exam_id = %s", (exam_id,))
        exam = cursor.fetchone()
        if not exam or exam['mode'] != 'CENTER':
            raise HTTPException(status_code=400, detail="PC assignment is only valid for CENTER mode exams.")

        # Clear existing assignments first to handle updates smoothly
        cursor.execute("DELETE FROM student_pc_assignment WHERE exam_id = %s", (exam_id,))

        # Insert mappings
        if assignments:
            try:
                values = [(exam_id, a.student_id, a.pc_id) for a in assignments]
                cursor.executemany("""
                    INSERT INTO student_pc_assignment (exam_id, student_id, pc_id, status)
                    VALUES (%s, %s, %s, 'ASSIGNED')
                """, values)
            except Exception as e:
                conn.rollback()
                raise HTTPException(status_code=400, detail=f"Assignment failed. Constraint violation (Double booking detected): {str(e)}")
            
        conn.commit()
        return {"message": f"Successfully assigned {len(assignments)} students to PCs."}
    finally:
        cursor.close()
        conn.close()

@router.get("/exams/{exam_id}/center-details", dependencies=[Depends(require_exam_creator)])
def get_center_exam_details(exam_id: int):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT mode, lab_id FROM exam WHERE exam_id = %s", (exam_id,))
        exam = cursor.fetchone()
        if not exam or exam['mode'] != 'CENTER':
            raise HTTPException(status_code=400, detail="This is an Online Exam. PC Assignment is only for Center-Based Exams.")
        if not exam['lab_id']:
            raise HTTPException(status_code=400, detail="No lab assigned to this exam.")
        
        cursor.execute("""
            SELECT s.student_id, s.name, s.usn, sec.section_name 
            FROM student s
            JOIN exam_section es ON s.section_id = es.section_id
            JOIN section sec ON s.section_id = sec.section_id
            WHERE es.exam_id = %s
            ORDER BY s.usn
        """, (exam_id,))
        students = cursor.fetchall()
        
        cursor.execute("SELECT pc_id, pc_number, status FROM pc WHERE lab_id = %s ORDER BY pc_number", (exam['lab_id'],))
        pcs = cursor.fetchall()
        
        cursor.execute("SELECT student_id, pc_id FROM student_pc_assignment WHERE exam_id = %s", (exam_id,))
        assignments = cursor.fetchall()
        
        return {
            "mode": exam['mode'],
            "lab_id": exam['lab_id'],
            "students": students,
            "pcs": pcs,
            "assignments": {a['student_id']: a['pc_id'] for a in assignments}
        }
    finally:
        cursor.close()
        conn.close()

# ==========================================
# 5. STUDENT EXAM ENTRY FLOW
# ==========================================

@router.post("/exams/{exam_id}/start")
def start_exam(exam_id: int, payload: StartExamRequest, user: dict = Depends(require_student)):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    
    try:
        cursor.execute("SELECT mode, password FROM exam WHERE exam_id = %s", (exam_id,))
        exam = cursor.fetchone()
        
        if not exam:
            raise HTTPException(status_code=404, detail="Exam not found.")
            
        if exam["mode"] == "CENTER":
            # 1. Validate Password
            if payload.password != exam["password"]:
                raise HTTPException(status_code=401, detail="Invalid exam center password.")
                
            # 2. Verify PC Assignment
            cursor.execute("""
                SELECT pc_id, status FROM student_pc_assignment 
                WHERE exam_id = %s AND student_id = %s
            """, (exam_id, user["user_id"]))
            
            assignment = cursor.fetchone()
            if not assignment:
                raise HTTPException(status_code=403, detail="You are not assigned to a PC for this Center-based exam.")
                
            # Update assignment status to Active
            cursor.execute("""
                UPDATE student_pc_assignment 
                SET status = 'ACTIVE' 
                WHERE exam_id = %s AND student_id = %s
            """, (exam_id, user["user_id"]))
            
        # Insert normal attempt tracking logic here ...
        cursor.execute("""
            INSERT INTO attempt (student_id, exam_id, status) 
            VALUES (%s, %s, 'IN_PROGRESS')
        """, (user["user_id"], exam_id))
        
        conn.commit()
        return {"message": "Exam started successfully.", "attempt_id": cursor.lastrowid}
    finally:
        cursor.close()
        conn.close()

@router.get("/student/exams/{exam_id}/venue", dependencies=[Depends(require_student)])
def get_student_venue(exam_id: int, user: dict = Depends(require_student)):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("""
            SELECT e.mode, ab.name as block_name, f.floor_number, l.lab_name, p.pc_number
            FROM exam e
            LEFT JOIN lab l ON e.lab_id = l.lab_id
            LEFT JOIN floor f ON l.floor_id = f.floor_id
            LEFT JOIN academic_block ab ON f.block_id = ab.block_id
            LEFT JOIN student_pc_assignment spa ON e.exam_id = spa.exam_id AND spa.student_id = %s
            LEFT JOIN pc p ON spa.pc_id = p.pc_id
            WHERE e.exam_id = %s
        """, (user["user_id"], exam_id))
        venue = cursor.fetchone()
        if not venue:
            raise HTTPException(status_code=404, detail="Exam not found")
        if venue["mode"] != "CENTER":
            return {"mode": "ONLINE", "message": "This is an online exam. No venue assigned."}
        
        floor_str = "Ground Floor"
        if venue["floor_number"] == -1: floor_str = "Basement"
        elif venue["floor_number"] and venue["floor_number"] > 0: floor_str = f"Floor {venue['floor_number']}"
        
        return {
            "mode": "CENTER",
            "block": venue["block_name"] or "Pending",
            "floor": floor_str,
            "lab": venue["lab_name"] or "Pending",
            "pc_number": venue["pc_number"] or "Not Assigned Yet"
        }
    finally:
        cursor.close()
        conn.close()