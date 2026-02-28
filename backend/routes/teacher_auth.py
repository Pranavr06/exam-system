from fastapi import APIRouter, HTTPException
from db import get_connection
from passlib.context import CryptContext
from security import create_access_token

router = APIRouter()

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

@router.post("/teacher/login")
def teacher_login(email: str, password: str):

    # ✅ domain check
    if not email.endswith("@nitte.edu.in"):
        raise HTTPException(status_code=403, detail="Invalid teacher email domain")

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    query = "SELECT * FROM teacher WHERE email = %s"
    cursor.execute(query, (email,))
    teacher = cursor.fetchone()

    if not teacher:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    # ✅ VERY IMPORTANT — active check
    if teacher["active_status"] != 1:
        raise HTTPException(status_code=403, detail="Teacher account inactive")

    if not pwd_context.verify(password, teacher["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_access_token({
    "user_id": teacher["teacher_id"],
    "role": "teacher",
    "department_id": teacher["department_id"]
    })

    return {
    "message": "Teacher login successful",
    "access_token": token,
    "token_type": "bearer",
    "teacher_id": teacher["teacher_id"],
    "name": teacher["name"],
    "role": teacher["role"]
    }