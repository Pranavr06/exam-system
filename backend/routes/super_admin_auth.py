from fastapi import APIRouter, HTTPException
from db import get_connection
from passlib.context import CryptContext
from security import create_access_token

router = APIRouter()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

@router.post("/super_admin/login")
def super_admin_login(email: str, password: str):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    cursor.execute("SELECT * FROM super_admin WHERE email = %s", (email,))
    super_admin = cursor.fetchone()

    cursor.close()
    conn.close()

    if not super_admin or not pwd_context.verify(password, super_admin["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_access_token({
        "user_id": super_admin["super_admin_id"],
        "role": "super_admin",
        "department_id": None
    })

    return {
        "message": "Super Admin login successful",
        "access_token": token,
        "token_type": "bearer",
        "super_admin_id": super_admin["super_admin_id"],
        "name": super_admin["name"],
        "designation": super_admin.get("designation", "Super Admin")
    }