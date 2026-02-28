from fastapi import APIRouter, HTTPException
from db import get_connection
from passlib.context import CryptContext
from security import create_access_token

router = APIRouter()

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

@router.post("/admin/login")
def admin_login(email: str, password: str):

    # ✅ domain restriction
    if not email.endswith("@nitte.edu.in"):
        raise HTTPException(status_code=403, detail="Invalid admin email domain")

    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    query = "SELECT * FROM admin WHERE email = %s"
    cursor.execute(query, (email,))
    admin = cursor.fetchone()

    if not admin:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not pwd_context.verify(password, admin["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_access_token({
    "user_id": admin["admin_id"],
    "role": "admin",
    "department_id": admin["department_id"]
    })

    return {
    "message": "Admin login successful",
    "access_token": token,
    "token_type": "bearer",
    "admin_id": admin["admin_id"],
    "name": admin["name"],
    "role": admin["role"]
    }