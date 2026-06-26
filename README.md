# 🎓 Online Exam Management System (OEMS)

![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)
![Python](https://img.shields.io/badge/Python-3.10+-3776AB?style=for-the-badge&logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-009688?style=for-the-badge&logo=fastapi&logoColor=white)
![MySQL](https://img.shields.io/badge/MySQL-8.0-4479A1?style=for-the-badge&logo=mysql&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-Vanilla-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![Supabase](https://img.shields.io/badge/Supabase-Storage-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)
![Authentication](https://img.shields.io/badge/Auth-JWT-orange?style=for-the-badge)
![Proctoring](https://img.shields.io/badge/AI-Proctoring-red?style=for-the-badge)
![Deployment](https://img.shields.io/badge/Deploy-Vercel%20%7C%20Render-black?style=for-the-badge)
![Status](https://img.shields.io/badge/Status-Completed-success?style=for-the-badge)

A modern, robust, and highly scalable Online Exam Management System. This platform provides a seamless, secure, and fully proctored environment for institutions to conduct examinations, manage student academic records, and monitor exam integrity.

---

## 🌟 Key Features

### 🧑‍🎓 Student Portal
- **Real-Time Exam Interface**: Secure, full-screen examination environment.
- **Performance Analytics**: Visual graphs and statistics detailing past performance and subject strengths.
- **Academic Profile**: Instant access to assigned subjects, teachers, and department details.

### 👨‍🏫 Teacher Dashboard
- **Exam Creation**: Dynamically create question papers, assign marks, and schedule exams.
- **Proctoring Suite**: Real-time monitoring of active exams with automated violation flagging.
- **Result Finalization**: Review student submissions, finalize marks, and publish results instantly.

### 👨‍💻 Admin & Super Admin Panel
- **Institutional Management**: Complete CRUD operations for Departments, Sections, and Academic Blocks.
- **User Management**: Bulk-assign students to sections, manage teacher subject allocations.
- **System Overview**: Global visibility into all active examinations and institutional metrics.

### 🛡️ Security & Integrity (Proctoring)
- **Tab Switching Detection**: Automatically logs and flags students if they navigate away from the exam window.
- **Window Blur Detection**: Flags if the exam window loses focus.
- **Evidence Capture**: Integrates with Supabase Storage to capture and store photographic evidence during critical violations.

---

## 🏗️ Architecture & Tech Stack

This project is built using a modern decoupled architecture:

### Frontend
- **Tech**: HTML5, CSS3, Vanilla JavaScript.
- **Hosting**: Deployed on [Vercel](https://vercel.com/) for lightning-fast global CDN delivery.
- **Design**: Fully responsive, custom glassmorphism design system with dynamic micro-animations.

### Backend
- **Tech**: Python 3.10+, FastAPI, Uvicorn, PyJWT for secure stateless authentication.
- **Hosting**: Deployed on [Render](https://render.com/).
- **Automation**: Features GitHub Actions workflows to keep the backend server and databases awake and fully responsive.

### Databases & Storage
- **Primary Database**: MySQL 8 hosted on [Aiven Cloud](https://aiven.io/).
- **Blob Storage**: [Supabase](https://supabase.com/) used for secure image/evidence uploads.

---

## 🚀 Local Development Setup

### Prerequisites
- Python 3.10 or higher
- MySQL Server (Local) or Aiven Cloud Database
- Supabase Project (for storage buckets)

### 1. Clone the Repository
```bash
git clone https://github.com/Pranavr06/exam-system.git
cd exam-system
```

### 2. Backend Setup
```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 3. Environment Variables
Create a `.env` file in the `backend/` directory:
```env
DB_HOST=your_mysql_host
DB_USER=your_mysql_user
DB_PASSWORD=your_mysql_password
DB_NAME=your_database_name
DB_PORT=your_port

SUPABASE_URL=your_supabase_project_url
SUPABASE_KEY=your_supabase_service_role_key
SUPABASE_BUCKET_NAME=your_bucket_name
```

### 4. Database Migration
To initialize the database schema and structure:
```bash
python update_db.py
```

### 5. Run the Server
```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### 6. Frontend Setup
Simply open `frontend/login.html` in your browser. (Optionally, use an extension like VS Code Live Server to serve the files on `localhost:5500`). Ensure `frontend/js/api.js` points to `http://localhost:8000` during local development.

---
## 👥 Team & Contributions

### **Pranav R**

**🛡️ Full-Stack AI Engineer & Project Lead**

* Spearheaded the overall project architecture, development, and integration.
* Designed and developed the full-stack examination management system.
* Implemented the AI-based proctoring engine using **YOLOv8**.
* Developed the secure backend APIs using **FastAPI**.
* Designed the database schema and authentication system.
* Integrated the cloud-based evidence storage pipeline using **AWS S3/Supabase Storage**.
* Coordinated project planning, documentation, and system deployment.

---

### **Pratham (NNM24IS164)**

**🎨 Frontend Developer**

* Developed the secure examination interface and student dashboard modules.
* Implemented responsive frontend components and user workflows.
* Improved user experience and interface consistency.
* Assisted in frontend integration with backend APIs.

---

### **Prathwik**

**⚙️ Backend API Developer**

* Developed backend modules using **FastAPI**.
* Implemented API endpoints and business logic.
* Integrated database operations and secure data handling.
* Assisted in authentication and system integration.

---

## 📡 Automated Maintenance

This repository utilizes **GitHub Actions** (`.github/workflows/keep-system-alive.yml`) to automatically ping the backend endpoints every 14 minutes. This guarantees that the Render web service, Aiven MySQL database, and Supabase project bypass aggressive free-tier sleep cycles, resulting in zero cold-start latency for end users.

---

> 🎓 Developed as an academic project focused on secure, scalable, and AI-assisted online examination management.

## 📜 License

This project is licensed under the MIT License.
