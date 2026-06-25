from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from db import get_connection
from routes.student_auth import router as student_router
from routes.admin_auth import router as admin_router
from routes.teacher_auth import router as teacher_router
from routes.super_admin_auth import router as super_admin_auth_router
from routes.super_admin_actions import router as super_admin_actions_router
from routes.admin_users import router as admin_users_router
from routes.admin_subjects import router as admin_subject_router
from routes.admin_exam import router as admin_exam_router
from routes.exam_assignment import router as exam_assignment_router
from routes.student_exam import router as student_exam_router
from routes.student_attempt import router as student_attempt_router
from routes.review import router as review_router
from routes.violation import router as violation_router
from routes.teacher_routes import router as teacher_dashboard_router
from routes.admin_dashboard import router as admin_dashboard_router
from routes.student_dashboard import router as student_dashboard_router
from center_exams import router as center_exams_router
from routes.proctoring import router as proctoring_router

app = FastAPI(title="OEMS API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # for development only
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(student_router)
app.include_router(admin_router)
app.include_router(teacher_router)
app.include_router(super_admin_auth_router)
app.include_router(super_admin_actions_router)
app.include_router(admin_users_router)
app.include_router(admin_subject_router)
app.include_router(admin_exam_router)
app.include_router(exam_assignment_router)
app.include_router(student_exam_router)
app.include_router(student_attempt_router)
app.include_router(review_router)
app.include_router(violation_router)
app.include_router(teacher_dashboard_router)
app.include_router(admin_dashboard_router)
app.include_router(student_dashboard_router)
app.include_router(center_exams_router)
app.include_router(proctoring_router)


@app.get("/")
def root():
    return {"message": "OEMS Backend Running"}


import httpx
import os

@app.get("/ping")
async def keep_alive_ping():
    # 1. Ping Aiven Database
    conn = get_connection()
    if conn:
        conn.close()
    
    # 2. Ping Supabase Storage to keep it awake
    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_KEY")
    
    supabase_status = "Skipped"
    if supabase_url and supabase_key:
        async with httpx.AsyncClient() as client:
            try:
                resp = await client.get(
                    f"{supabase_url}/storage/v1/bucket",
                    headers={"apikey": supabase_key, "Authorization": f"Bearer {supabase_key}"},
                    timeout=5.0
                )
                supabase_status = "Awake" if resp.status_code == 200 else f"Error {resp.status_code}"
            except Exception:
                supabase_status = "Failed"

    return {
        "status": "All systems awake!",
        "render": "Awake",
        "aiven_db": "Awake" if conn else "Failed",
        "supabase": supabase_status
    }
@app.get("/db-test")
def db_test():
    conn = get_connection()
    if conn:
        conn.close()
        return {"status": "Database connected"}
    return {"status": "Database connection failed"}

