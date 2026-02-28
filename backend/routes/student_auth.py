from fastapi import APIRouter, HTTPException
from db import get_connection
from passlib.context import CryptContext
from security import create_access_token

# ✅ router must be created FIRST
router = APIRouter()

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

@router.post("/student/login")
def student_login(email: str, password: str):

    # domain check
    if not email.endswith("@nmamit.in"):
        raise HTTPException(status_code=403, detail="Invalid student email domain")

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    query = "SELECT * FROM student WHERE email = %s"
    cursor.execute(query, (email,))
    student = cursor.fetchone()

    if not student:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not pwd_context.verify(password, student["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_access_token({
    "user_id": student["student_id"],
    "role": "student",
    "department_id": student["department_id"]
    })

    return {
    "message": "Login successful",
    "access_token": token,
    "token_type": "bearer",
    "student_id": student["student_id"],
    "name": student["name"]
    }