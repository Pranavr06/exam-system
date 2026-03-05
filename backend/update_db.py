from db import get_connection
import mysql.connector

def update_database():
    conn = get_connection()
    if conn is None:
        print("❌ Database connection failed. Check credentials in db.py")
        return

    cursor = conn.cursor(dictionary=True)

    cursor.execute("SELECT DATABASE() as db")
    current_db = cursor.fetchone()['db']
    print(f"--- Checking Database Schema for: {current_db} ---")

    def column_exists(table_name, column_name):
        cursor.execute("""
            SELECT COUNT(*) as count 
            FROM information_schema.COLUMNS 
            WHERE TABLE_SCHEMA = DATABASE() 
            AND TABLE_NAME = %s 
            AND COLUMN_NAME = %s
        """, (table_name, column_name))
        return cursor.fetchone()['count'] > 0

    # --- CORE TABLES (Dependencies) ---

    # 1. Check 'department' table
    print("Checking 'department' table...")
    cursor.execute("SHOW TABLES LIKE 'department'")
    if not cursor.fetchone():
        print("⚠️ 'department' table missing. Creating it...")
        try:
            cursor.execute("""
                CREATE TABLE `department` (
                  `department_id` int NOT NULL AUTO_INCREMENT,
                  `department_name` varchar(100) NOT NULL,
                  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
                  PRIMARY KEY (`department_id`),
                  UNIQUE KEY `department_name` (`department_name`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
            """)
            print("✅ 'department' table created successfully.")
        except Exception as e:
            print(f"❌ Failed to create 'department': {e}")

    # 2. Check 'admin' table
    print("Checking 'admin' table...")
    cursor.execute("SHOW TABLES LIKE 'admin'")
    if not cursor.fetchone():
        print("⚠️ 'admin' table missing. Creating it...")
        try:
            cursor.execute("""
                CREATE TABLE `admin` (
                  `admin_id` int NOT NULL AUTO_INCREMENT,
                  `name` varchar(100) NOT NULL,
                  `email` varchar(100) NOT NULL,
                  `password_hash` varchar(255) NOT NULL,
                  `role` varchar(20) DEFAULT 'admin',
                  `department_id` int DEFAULT NULL,
                  `is_active` tinyint(1) DEFAULT '1',
                  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
                  PRIMARY KEY (`admin_id`),
                  UNIQUE KEY `email` (`email`),
                  KEY `department_id` (`department_id`),
                  CONSTRAINT `admin_ibfk_1` FOREIGN KEY (`department_id`) REFERENCES `department` (`department_id`) ON DELETE SET NULL
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
            """)
            print("✅ 'admin' table created successfully.")
        except Exception as e:
            print(f"❌ Failed to create 'admin': {e}")
    else:
        # Check for is_active column in existing admin table
        if not column_exists('admin', 'is_active'):
             try:
                 cursor.execute("ALTER TABLE admin ADD COLUMN is_active TINYINT(1) DEFAULT 1")
                 print("✅ 'is_active' added to admin.")
             except Exception as e:
                 print(f"❌ Failed to add 'is_active': {e}")

    # 3. Check 'teacher' table
    print("Checking 'teacher' table...")
    cursor.execute("SHOW TABLES LIKE 'teacher'")
    if not cursor.fetchone():
        print("⚠️ 'teacher' table missing. Creating it...")
        try:
            cursor.execute("""
                CREATE TABLE `teacher` (
                  `teacher_id` int NOT NULL AUTO_INCREMENT,
                  `name` varchar(100) NOT NULL,
                  `email` varchar(100) NOT NULL,
                  `password_hash` varchar(255) NOT NULL,
                  `department_id` int NOT NULL,
                  `active_status` tinyint(1) DEFAULT '1',
                  `created_by_admin` int DEFAULT NULL,
                  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
                  PRIMARY KEY (`teacher_id`),
                  UNIQUE KEY `email` (`email`),
                  KEY `department_id` (`department_id`),
                  CONSTRAINT `teacher_ibfk_1` FOREIGN KEY (`department_id`) REFERENCES `department` (`department_id`) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
            """)
            print("✅ 'teacher' table created successfully.")
        except Exception as e:
            print(f"❌ Failed to create 'teacher': {e}")

    # 4. Check 'subject' table
    print("Checking 'subject' table...")
    cursor.execute("SHOW TABLES LIKE 'subject'")
    if not cursor.fetchone():
        print("⚠️ 'subject' table missing. Creating it...")
        try:
            cursor.execute("""
                CREATE TABLE `subject` (
                  `subject_id` int NOT NULL AUTO_INCREMENT,
                  `subject_name` varchar(100) NOT NULL,
                  `department_id` int NOT NULL,
                  `created_by_admin` int DEFAULT NULL,
                  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
                  PRIMARY KEY (`subject_id`),
                  UNIQUE KEY `unique_subject_dept` (`subject_name`,`department_id`),
                  KEY `department_id` (`department_id`),
                  CONSTRAINT `subject_ibfk_1` FOREIGN KEY (`department_id`) REFERENCES `department` (`department_id`) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
            """)
            print("✅ 'subject' table created successfully.")
        except Exception as e:
            print(f"❌ Failed to create 'subject': {e}")

    # 0. Check 'section' table (Pre-requisite)
    print("Checking 'section' table...")
    cursor.execute("SHOW TABLES LIKE 'section'")
    if not cursor.fetchone():
        print("⚠️ 'section' table missing. Creating it...")
        try:
            cursor.execute("""
                CREATE TABLE `section` (
                  `section_id` int NOT NULL AUTO_INCREMENT,
                  `department_id` int NOT NULL,
                  `section_name` varchar(50) NOT NULL,
                  `batch_year` int NOT NULL,
                  `semester` int NOT NULL,
                  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
                  PRIMARY KEY (`section_id`),
                  UNIQUE KEY `dept_section_batch_sem` (`department_id`,`section_name`,`batch_year`,`semester`),
                  CONSTRAINT `section_ibfk_1` FOREIGN KEY (`department_id`) REFERENCES `department` (`department_id`) ON DELETE CASCADE ON UPDATE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
            """)
            print("✅ 'section' table created successfully.")
        except Exception as e:
            print(f"❌ Failed to create 'section': {e}")
    else:
        print("✅ 'section' table exists. Checking columns...")
        if not column_exists('section', 'batch_year'):
             print("⚠️ 'batch_year' missing in 'section'. Adding it...")
             try:
                 cursor.execute("ALTER TABLE section ADD COLUMN batch_year INT NOT NULL AFTER section_name")
                 print("✅ 'batch_year' added successfully.")
                 
                 # Update Unique Index
                 print("Updating unique index for section...")
                 try:
                     # Attempt to drop the old index (assuming default name or specific name from previous schema)
                     # If the previous schema had UNIQUE(department_id, section_name, semester), MySQL might name it 'department_id' or 'department_id_2'
                     # We will try to drop 'department_id' as per instructions, but wrap in try-except
                     cursor.execute("ALTER TABLE section DROP INDEX department_id")
                 except Exception:
                     pass # Index might not exist or have a different name

                 cursor.execute("ALTER TABLE section ADD UNIQUE KEY dept_section_batch_sem (department_id, section_name, batch_year, semester)")
                 print("✅ Unique index updated to include batch_year.")
             except Exception as e:
                 print(f"❌ Failed to update 'section' table: {e}")

    # 5. Check 'student' table
    print("Checking 'student' table...")
    cursor.execute("SHOW TABLES LIKE 'student'")
    if not cursor.fetchone():
        print("⚠️ 'student' table missing. Creating it...")
        try:
            cursor.execute("""
                CREATE TABLE `student` (
                  `student_id` int NOT NULL AUTO_INCREMENT,
                  `name` varchar(100) NOT NULL,
                  `email` varchar(100) NOT NULL,
                  `password_hash` varchar(255) NOT NULL,
                  `usn` varchar(20) NOT NULL,
                  `semester` int NOT NULL,
                  `section_label` varchar(10) DEFAULT NULL,
                  `section_id` int DEFAULT NULL,
                  `department_id` int NOT NULL,
                  `created_by_admin` int DEFAULT NULL,
                  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
                  PRIMARY KEY (`student_id`),
                  UNIQUE KEY `email` (`email`),
                  UNIQUE KEY `usn` (`usn`),
                  KEY `department_id` (`department_id`),
                  KEY `section_id` (`section_id`),
                  CONSTRAINT `student_ibfk_1` FOREIGN KEY (`department_id`) REFERENCES `department` (`department_id`) ON DELETE CASCADE,
                  CONSTRAINT `student_ibfk_2` FOREIGN KEY (`section_id`) REFERENCES `section` (`section_id`) ON DELETE SET NULL
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
            """)
            print("✅ 'student' table created successfully.")
        except Exception as e:
            print(f"❌ Failed to create 'student': {e}")

    # 1. Check 'exam' table
    print("Checking 'exam' table...")
    cursor.execute("SHOW TABLES LIKE 'exam'")
    if not cursor.fetchone():
         print("⚠️ 'exam' table missing. Creating it...")
         try:
             cursor.execute("""
                CREATE TABLE `exam` (
                  `exam_id` int NOT NULL AUTO_INCREMENT,
                  `exam_name` varchar(150) NOT NULL,
                  `subject_id` int NOT NULL,
                  `date` datetime NOT NULL,
                  `duration` int DEFAULT NULL,
                  `status` enum('scheduled','active','completed') DEFAULT 'scheduled',
                  `created_by_admin` int DEFAULT NULL,
                  `created_by_teacher` int DEFAULT NULL,
                  `department_id` int DEFAULT NULL,
                  `exam_scope` enum('DEPARTMENT','SECTION','BATCH') DEFAULT 'DEPARTMENT',
                  `total_marks` int NOT NULL,
                  `batch_year` int DEFAULT NULL,
                  `semester` int DEFAULT NULL,
                  PRIMARY KEY (`exam_id`),
                  UNIQUE KEY `uniq_teacher_exam` (`exam_name`,`subject_id`,`created_by_teacher`),
                  UNIQUE KEY `uniq_admin_exam` (`exam_name`,`subject_id`,`created_by_admin`),
                  KEY `subject_id` (`subject_id`),
                  KEY `created_by_admin` (`created_by_admin`),
                  KEY `fk_exam_teacher` (`created_by_teacher`),
                  KEY `fk_exam_department` (`department_id`),
                  CONSTRAINT `exam_ibfk_1` FOREIGN KEY (`subject_id`) REFERENCES `subject` (`subject_id`) ON DELETE CASCADE ON UPDATE CASCADE,
                  CONSTRAINT `exam_ibfk_2` FOREIGN KEY (`created_by_admin`) REFERENCES `admin` (`admin_id`) ON DELETE SET NULL ON UPDATE CASCADE,
                  CONSTRAINT `fk_exam_department` FOREIGN KEY (`department_id`) REFERENCES `department` (`department_id`) ON DELETE CASCADE ON UPDATE CASCADE,
                  CONSTRAINT `fk_exam_teacher` FOREIGN KEY (`created_by_teacher`) REFERENCES `teacher` (`teacher_id`) ON DELETE SET NULL ON UPDATE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
             """)
             print("✅ 'exam' table created successfully.")
         except Exception as e:
             print(f"❌ Failed to create 'exam': {e}")
    else:
        print("✅ 'exam' table exists. Checking columns...")
        if not column_exists('exam', 'total_marks'):
             print("⚠️ 'total_marks' missing in 'exam'. Adding it...")
             try:
                 cursor.execute("ALTER TABLE exam ADD COLUMN total_marks INT DEFAULT 100")
                 print("✅ 'total_marks' added successfully.")
             except Exception as e:
                 print(f"❌ Failed to add 'total_marks': {e}")
        
        if not column_exists('exam', 'exam_scope'):
             print("⚠️ 'exam_scope' missing in 'exam'. Adding it...")
             try:
                 cursor.execute("ALTER TABLE exam ADD COLUMN exam_scope enum('DEPARTMENT','SECTION', 'BATCH') DEFAULT 'DEPARTMENT'")
                 print("✅ 'exam_scope' added successfully.")
             except Exception as e:
                 print(f"❌ Failed to add 'exam_scope': {e}")
        else:
             try:
                 cursor.execute("ALTER TABLE exam MODIFY COLUMN exam_scope enum('DEPARTMENT','SECTION', 'BATCH') DEFAULT 'DEPARTMENT'")
                 print("✅ 'exam_scope' definition updated.")
             except Exception as e:
                 print(f"❌ Failed to update 'exam_scope': {e}")

        if not column_exists('exam', 'created_by_teacher'):
             print("⚠️ 'created_by_teacher' missing in 'exam'. Adding it...")
             try:
                 cursor.execute("ALTER TABLE exam ADD COLUMN created_by_teacher INT DEFAULT NULL")
                 cursor.execute("ALTER TABLE exam ADD CONSTRAINT `fk_exam_teacher` FOREIGN KEY (`created_by_teacher`) REFERENCES `teacher` (`teacher_id`) ON DELETE SET NULL ON UPDATE CASCADE")
                 print("✅ 'created_by_teacher' added successfully.")
             except Exception as e:
                 print(f"❌ Failed to add 'created_by_teacher': {e}")
        
        if not column_exists('exam', 'batch_year'):
             print("⚠️ 'batch_year' missing in 'exam'. Adding it for display scope...")
             try:
                 cursor.execute("ALTER TABLE exam ADD COLUMN batch_year INT NULL")
                 print("✅ 'batch_year' added successfully.")
             except Exception as e:
                 print(f"❌ Failed to add 'batch_year': {e}")

        if not column_exists('exam', 'semester'):
             print("⚠️ 'semester' missing in 'exam'. Adding it for display scope...")
             try:
                 cursor.execute("ALTER TABLE exam ADD COLUMN semester INT NULL")
                 print("✅ 'semester' added successfully.")
             except Exception as e:
                 print(f"❌ Failed to add 'semester': {e}")

    # 2. Check 'question' table
    print("Checking 'question' table...")
    cursor.execute("SHOW TABLES LIKE 'question'")
    if not cursor.fetchone():
         print("⚠️ 'question' table missing. Creating it...")
         try:
             cursor.execute("""
                CREATE TABLE `question` (
                   `question_id` int NOT NULL AUTO_INCREMENT,
                   `exam_id` int NOT NULL,
                   `question_text` text NOT NULL,
                   `correct_answer` varchar(255) DEFAULT NULL,
                   `question_type` enum('MCQ') DEFAULT 'MCQ',
                   `marks` float DEFAULT '1',
                   PRIMARY KEY (`question_id`),
                   KEY `exam_id` (`exam_id`),
                   CONSTRAINT `question_ibfk_1` FOREIGN KEY (`exam_id`) REFERENCES `exam` (`exam_id`) ON DELETE CASCADE ON UPDATE CASCADE
                 ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
             """)
             print("✅ 'question' table created successfully.")
         except Exception as e:
             print(f"❌ Failed to create 'question': {e}")
    else:
        print("✅ 'question' table exists. Checking columns...")
        if not column_exists('question', 'marks'):
             print("⚠️ 'marks' missing in 'question'. Adding it...")
             try:
                 cursor.execute("ALTER TABLE question ADD COLUMN marks FLOAT DEFAULT 1")
                 print("✅ 'marks' added successfully.")
             except Exception as e:
                 print(f"❌ Failed to add 'marks': {e}")

    # 3. Check 'question_option' table
    print("Checking 'question_option' table...")
    cursor.execute("SHOW TABLES LIKE 'question_option'")
    if not cursor.fetchone():
         print("⚠️ 'question_option' table missing. Creating it...")
         try:
             cursor.execute("""
                CREATE TABLE `question_option` (
                   `option_id` int NOT NULL AUTO_INCREMENT,
                   `question_id` int NOT NULL,
                   `option_text` varchar(255) NOT NULL,
                   `is_correct` tinyint(1) DEFAULT '0',
                   PRIMARY KEY (`option_id`),
                   UNIQUE KEY `unique_option_per_question` (`question_id`,`option_text`),
                   CONSTRAINT `question_option_ibfk_1` FOREIGN KEY (`question_id`) REFERENCES `question` (`question_id`) ON DELETE CASCADE
                 ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
             """)
             print("✅ 'question_option' table created successfully.")
         except Exception as e:
             print(f"❌ Failed to create 'question_option': {e}")

    # 4. Create 'teaching_assignment' table (if missing)
    try:
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS teaching_assignment (
                assignment_id INT PRIMARY KEY AUTO_INCREMENT,
                teacher_id INT NOT NULL,
                subject_id INT NOT NULL,
                section_id INT NOT NULL,
                department_id INT NOT NULL,
                FOREIGN KEY (teacher_id) REFERENCES teacher(teacher_id) ON DELETE CASCADE,
                FOREIGN KEY (subject_id) REFERENCES subject(subject_id) ON DELETE CASCADE,
                FOREIGN KEY (section_id) REFERENCES section(section_id) ON DELETE CASCADE,
                FOREIGN KEY (department_id) REFERENCES department(department_id) ON DELETE RESTRICT,
                UNIQUE (teacher_id, subject_id, section_id)
            )
        """)
        print("✅ 'teaching_assignment' table checked/created.")
    except Exception as e:
        print(f"❌ Failed to create 'teaching_assignment': {e}")

    # 5. Check 'exam_section' table and 'assigned_by_teacher' column
    print("Checking 'exam_section' table...")
    cursor.execute("SHOW TABLES LIKE 'exam_section'")
    if not cursor.fetchone():
         print("⚠️ 'exam_section' table missing. Creating it...")
         try:
             cursor.execute("""
                CREATE TABLE exam_section (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    exam_id INT NOT NULL,
                    section_id INT NOT NULL,
                    assigned_by_teacher INT NULL,
                    FOREIGN KEY (exam_id) REFERENCES exam(exam_id) ON DELETE CASCADE,
                    FOREIGN KEY (section_id) REFERENCES section(section_id) ON DELETE CASCADE
                )
             """)
             print("✅ 'exam_section' created successfully.")
         except Exception as e:
             print(f"❌ Failed to create 'exam_section': {e}")
    elif not column_exists('exam_section', 'assigned_by_teacher'):
         print("⚠️ 'assigned_by_teacher' column missing in 'exam_section'. Adding it...")
         try:
            cursor.execute("ALTER TABLE exam_section ADD COLUMN assigned_by_teacher INT NULL")
            print("✅ 'assigned_by_teacher' added successfully.")
         except Exception as e:
            print(f"❌ Failed to add 'assigned_by_teacher': {e}")
    else:
         print("✅ 'exam_section' table is up to date.")

    # --- EXAM EXECUTION TABLES ---

    # Check 'attempt' table
    print("Checking 'attempt' table...")
    cursor.execute("SHOW TABLES LIKE 'attempt'")
    if not cursor.fetchone():
        print("⚠️ 'attempt' table missing. Creating it...")
        try:
            cursor.execute("""
                CREATE TABLE `attempt` (
                  `attempt_id` int NOT NULL AUTO_INCREMENT,
                  `student_id` int NOT NULL,
                  `exam_id` int NOT NULL,
                  `start_time` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
                  `end_time` timestamp NULL DEFAULT NULL,
                  `status` enum('IN_PROGRESS','COMPLETED') DEFAULT 'IN_PROGRESS',
                  `risk_score` float DEFAULT '0',
                  PRIMARY KEY (`attempt_id`),
                  KEY `student_id` (`student_id`),
                  KEY `exam_id` (`exam_id`),
                  CONSTRAINT `attempt_ibfk_1` FOREIGN KEY (`student_id`) REFERENCES `student` (`student_id`) ON DELETE CASCADE,
                  CONSTRAINT `attempt_ibfk_2` FOREIGN KEY (`exam_id`) REFERENCES `exam` (`exam_id`) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
            """)
            print("✅ 'attempt' table created successfully.")
        except Exception as e:
            print(f"❌ Failed to create 'attempt': {e}")

    # Check 'answer' table
    print("Checking 'answer' table...")
    cursor.execute("SHOW TABLES LIKE 'answer'")
    if not cursor.fetchone():
        print("⚠️ 'answer' table missing. Creating it...")
        try:
            cursor.execute("""
                CREATE TABLE `answer` (
                  `answer_id` int NOT NULL AUTO_INCREMENT,
                  `student_id` int NOT NULL,
                  `exam_id` int NOT NULL,
                  `question_id` int NOT NULL,
                  `selected_option_id` int DEFAULT NULL,
                  `evaluation_status` enum('PENDING','NORMAL','APPROVED','REJECTED') DEFAULT 'NORMAL',
                  `marks_awarded` float DEFAULT '0',
                  PRIMARY KEY (`answer_id`),
                  UNIQUE KEY `unique_answer` (`student_id`,`exam_id`,`question_id`),
                  KEY `question_id` (`question_id`),
                  CONSTRAINT `answer_ibfk_1` FOREIGN KEY (`student_id`) REFERENCES `student` (`student_id`) ON DELETE CASCADE,
                  CONSTRAINT `answer_ibfk_2` FOREIGN KEY (`exam_id`) REFERENCES `exam` (`exam_id`) ON DELETE CASCADE,
                  CONSTRAINT `answer_ibfk_3` FOREIGN KEY (`question_id`) REFERENCES `question` (`question_id`) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
            """)
            print("✅ 'answer' table created successfully.")
        except Exception as e:
            print(f"❌ Failed to create 'answer': {e}")

    # Check 'result' table
    print("Checking 'result' table...")
    cursor.execute("SHOW TABLES LIKE 'result'")
    if not cursor.fetchone():
        print("⚠️ 'result' table missing. Creating it...")
        try:
            cursor.execute("""
                CREATE TABLE `result` (
                  `result_id` int NOT NULL AUTO_INCREMENT,
                  `student_id` int NOT NULL,
                  `exam_id` int NOT NULL,
                  `total_marks` float NOT NULL,
                  `result_status` varchar(50) DEFAULT 'Finalized',
                  `generated_time` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
                  PRIMARY KEY (`result_id`),
                  UNIQUE KEY `unique_result` (`student_id`,`exam_id`),
                  KEY `exam_id` (`exam_id`),
                  CONSTRAINT `result_ibfk_1` FOREIGN KEY (`student_id`) REFERENCES `student` (`student_id`) ON DELETE CASCADE,
                  CONSTRAINT `result_ibfk_2` FOREIGN KEY (`exam_id`) REFERENCES `exam` (`exam_id`) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
            """)
            print("✅ 'result' table created successfully.")
        except Exception as e:
            print(f"❌ Failed to create 'result': {e}")

    # Check 'violation' table
    print("Checking 'violation' table...")
    cursor.execute("SHOW TABLES LIKE 'violation'")
    if not cursor.fetchone():
        print("⚠️ 'violation' table missing. Creating it...")
        try:
            cursor.execute("""
                CREATE TABLE `violation` (
                  `violation_id` int NOT NULL AUTO_INCREMENT,
                  `student_id` int NOT NULL,
                  `exam_id` int NOT NULL,
                  `question_id` int DEFAULT NULL,
                  `violation_type` varchar(50) NOT NULL,
                  `confidence_score` float DEFAULT '1',
                  `timestamp` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
                  `review_status` enum('Pending','Reviewed') DEFAULT 'Pending',
                  PRIMARY KEY (`violation_id`),
                  KEY `student_id` (`student_id`),
                  KEY `exam_id` (`exam_id`),
                  CONSTRAINT `violation_ibfk_1` FOREIGN KEY (`student_id`) REFERENCES `student` (`student_id`) ON DELETE CASCADE,
                  CONSTRAINT `violation_ibfk_2` FOREIGN KEY (`exam_id`) REFERENCES `exam` (`exam_id`) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
            """)
            print("✅ 'violation' table created successfully.")
        except Exception as e:
            print(f"❌ Failed to create 'violation': {e}")

    # 6. Create 'system_logs' table
    print("Checking 'system_logs' table...")
    cursor.execute("SHOW TABLES LIKE 'system_logs'")
    if not cursor.fetchone():
        print("⚠️ 'system_logs' table missing. Creating it...")
        try:
            cursor.execute("""
                CREATE TABLE system_logs (
                    log_id INT AUTO_INCREMENT PRIMARY KEY,
                    user_id INT,
                    role ENUM('admin','teacher','student', 'super_admin'),
                    department_id INT,
                    action VARCHAR(255) NOT NULL,
                    entity_type VARCHAR(100), 
                    entity_id INT,
                    ip_address VARCHAR(45),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_dept_time (department_id, created_at)
                )
            """)
            print("✅ 'system_logs' table created successfully.")
        except Exception as e:
            print(f"❌ Failed to create 'system_logs': {e}")
    else:
        print("✅ 'system_logs' table is up to date.")

    # 7. Create 'teacher_activity_logs' table
    print("Checking 'teacher_activity_logs' table...")
    cursor.execute("SHOW TABLES LIKE 'teacher_activity_logs'")
    if not cursor.fetchone():
        print("⚠️ 'teacher_activity_logs' table missing. Creating it...")
        try:
            cursor.execute("""
                CREATE TABLE teacher_activity_logs (
                    log_id INT AUTO_INCREMENT PRIMARY KEY,
                    teacher_id INT NOT NULL,
                    department_id INT NOT NULL,
                    section_id INT,
                    student_id INT,
                    exam_id INT,
                    action VARCHAR(255) NOT NULL,
                    ip_address VARCHAR(45),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_teacher_time (teacher_id, created_at)
                )
            """)
            print("✅ 'teacher_activity_logs' table created successfully.")
        except Exception as e:
            print(f"❌ Failed to create 'teacher_activity_logs': {e}")
    else:
        print("✅ 'teacher_activity_logs' table is up to date.")

    # 8. Create 'super_admin' table
    print("Checking 'super_admin' table...")
    cursor.execute("SHOW TABLES LIKE 'super_admin'")
    if not cursor.fetchone():
        print("⚠️ 'super_admin' table missing. Creating it...")
        try:
            cursor.execute("""
                CREATE TABLE `super_admin` (
                   `super_admin_id` INT NOT NULL AUTO_INCREMENT,
                   `name` VARCHAR(100) NOT NULL,
                   `email` VARCHAR(100) NOT NULL,
                   `password_hash` VARCHAR(255) NOT NULL,
                   `phone` VARCHAR(20) DEFAULT NULL,
                   `designation` VARCHAR(100) DEFAULT 'System Administrator',
                   `status` ENUM('ACTIVE','INACTIVE') DEFAULT 'ACTIVE',
                   `failed_login_attempts` INT DEFAULT 0,
                   `last_login` TIMESTAMP NULL DEFAULT NULL,
                   `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
                   PRIMARY KEY (`super_admin_id`),
                   UNIQUE KEY `email` (`email`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
            """)
            print("✅ 'super_admin' table created successfully.")
        except Exception as e:
            print(f"❌ Failed to create 'super_admin': {e}")
    else:
        print("✅ 'super_admin' table exists. Checking columns...")
        if not column_exists('super_admin', 'phone'):
             try:
                 cursor.execute("ALTER TABLE super_admin ADD COLUMN phone VARCHAR(20) DEFAULT NULL")
                 print("✅ 'phone' added to super_admin.")
             except Exception as e:
                 print(f"❌ Failed to add 'phone': {e}")
        
        if not column_exists('super_admin', 'designation'):
             try:
                 cursor.execute("ALTER TABLE super_admin ADD COLUMN designation VARCHAR(100) DEFAULT 'System Administrator'")
                 print("✅ 'designation' added to super_admin.")
             except Exception as e:
                 print(f"❌ Failed to add 'designation': {e}")
        
        if not column_exists('super_admin', 'status'):
             try:
                 cursor.execute("ALTER TABLE super_admin ADD COLUMN status ENUM('ACTIVE','INACTIVE') DEFAULT 'ACTIVE'")
                 print("✅ 'status' added to super_admin.")
             except Exception as e:
                 print(f"❌ Failed to add 'status': {e}")

        if not column_exists('super_admin', 'failed_login_attempts'):
             try:
                 cursor.execute("ALTER TABLE super_admin ADD COLUMN failed_login_attempts INT DEFAULT 0")
                 print("✅ 'failed_login_attempts' added to super_admin.")
             except Exception as e:
                 print(f"❌ Failed to add 'failed_login_attempts': {e}")

        if not column_exists('super_admin', 'last_login'):
             try:
                 cursor.execute("ALTER TABLE super_admin ADD COLUMN last_login TIMESTAMP NULL DEFAULT NULL")
                 print("✅ 'last_login' added to super_admin.")
             except Exception as e:
                 print(f"❌ Failed to add 'last_login': {e}")

    conn.commit()
    cursor.close()
    conn.close()
    print("--- Update Complete ---")

if __name__ == "__main__":
    update_database()