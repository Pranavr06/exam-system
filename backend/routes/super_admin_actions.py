from fastapi import APIRouter, Depends, HTTPException, Body
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
        cursor.execute("INSERT INTO department (name) VALUES (%s)", (name,))
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