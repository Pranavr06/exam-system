from fastapi import APIRouter, Depends, HTTPException
from datetime import timedelta

# Assuming these are in your security.py file
from security import get_current_user, create_access_token, ACCESS_TOKEN_EXPIRE_MINUTES 

# You should already have a router defined, e.g.:
# router = APIRouter()

# Add this new endpoint to your existing auth.py file
@router.post("/auth/refresh")
def refresh_session(current_user: dict = Depends(get_current_user)):
    """
    Refreshes the JWT token for an active user extending their session.
    This endpoint is called by the frontend Idle Detector.
    """
    # Define the expiration time for the new token
    # Use ACCESS_TOKEN_EXPIRE_MINUTES from your security config
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES) 
    
    # Create a fresh token using the existing user's validated data.
    # IMPORTANT: Ensure these keys ("sub", "role", "user_id") match exactly
    # what your existing `create_access_token` function expects in its payload.
    # If your original payload includes department_id or other fields, add them here.
    new_token = create_access_token(
        data={
            "sub": current_user.get("email"), 
            "role": current_user.get("role"), 
            "user_id": current_user.get("user_id")
        },
        expires_delta=access_token_expires
    )
    
    return {"access_token": new_token, "token_type": "bearer"}

