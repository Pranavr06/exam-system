from datetime import datetime, timedelta
import os

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError


# =========================
# JWT CONFIG
# =========================

SECRET_KEY = os.getenv("JWT_SECRET", "fallback_secret_key_for_development_only")

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60


# =========================
# TOKEN CREATION
# =========================

def create_access_token(data: dict):
    """
    Expected data format:
    {
        "user_id": int,
        "role": str,
        "department_id": int
    }
    """

    to_encode = data.copy()

    expire = datetime.utcnow() + timedelta(
        minutes=ACCESS_TOKEN_EXPIRE_MINUTES
    )

    to_encode.update({"exp": expire})

    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


# =========================
# TOKEN VERIFICATION
# =========================

def verify_token(token: str):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])

        # 🔒 Strict payload validation
        required_fields = ["user_id", "role", "department_id"]

        for field in required_fields:
            if field not in payload:
                return None

        # 🔒 Optional: role validation
        allowed_roles = ["admin", "super_admin", "teacher", "student"]

        if payload["role"] not in allowed_roles:
            return None

        return payload

    except JWTError:
        return None


# =========================
# AUTH DEPENDENCY
# =========================

security = HTTPBearer()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    token = credentials.credentials

    payload = verify_token(token)

    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )

    return payload