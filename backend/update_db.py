from db import get_connection

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
                  `risk_status` enum('Normal', 'High Risk') DEFAULT 'Normal',
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
    else:
        print("✅ 'student' table exists. Checking columns...")
        if not column_exists('student', 'risk_status'):
             try:
                 cursor.execute("ALTER TABLE student ADD COLUMN risk_status ENUM('Normal', 'High Risk') DEFAULT 'Normal'")
                 print("✅ 'risk_status' added to student.")
             except Exception as e:
                 print(f"❌ Failed to add 'risk_status': {e}")

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

        if not column_exists('exam', 'is_archived'):
             print("⚠️ 'is_archived' missing in 'exam'. Adding it...")
             try:
                 cursor.execute("ALTER TABLE exam ADD COLUMN is_archived TINYINT(1) DEFAULT 0")
                 print("✅ 'is_archived' added successfully.")
             except Exception as e:
                 print(f"❌ Failed to add 'is_archived': {e}")

        if not column_exists('exam', 'exam_type'):
             print("⚠️ 'exam_type' missing in 'exam'. Adding it...")
             try:
                 cursor.execute("ALTER TABLE exam ADD COLUMN exam_type enum('normal','retake') DEFAULT 'normal'")
                 print("✅ 'exam_type' added successfully.")
             except Exception as e:
                 print(f"❌ Failed to add 'exam_type': {e}")

        if not column_exists('exam', 'parent_exam_id'):
             print("⚠️ 'parent_exam_id' missing in 'exam'. Adding it...")
             try:
                 cursor.execute("ALTER TABLE exam ADD COLUMN parent_exam_id INT DEFAULT NULL")
                 cursor.execute("ALTER TABLE exam ADD CONSTRAINT `fk_exam_parent` FOREIGN KEY (`parent_exam_id`) REFERENCES `exam` (`exam_id`) ON DELETE SET NULL")
                 print("✅ 'parent_exam_id' added successfully.")
             except Exception as e:
                 print(f"❌ Failed to add 'parent_exam_id': {e}")

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
        
        # Check for unique constraint on question_text
        cursor.execute("""
            SELECT COUNT(*) as count 
            FROM information_schema.STATISTICS 
            WHERE TABLE_SCHEMA = DATABASE() 
            AND TABLE_NAME = 'question' 
            AND INDEX_NAME = 'unique_question_per_exam'
        """)
        if cursor.fetchone()['count'] == 0:
             print("⚠️ Unique constraint missing on 'question'. Adding it...")
             try:
                 cursor.execute("ALTER TABLE question ADD CONSTRAINT unique_question_per_exam UNIQUE (exam_id, question_text(255))")
                 print("✅ Unique constraint 'unique_question_per_exam' added.")
             except Exception as e:
                 print(f"❌ Failed to add unique constraint (check for existing duplicates): {e}")

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

    # 4. Check 'teaching_assignment' table
    print("Checking 'teaching_assignment' table...")
    cursor.execute("SHOW TABLES LIKE 'teaching_assignment'")
    if not cursor.fetchone():
        print("⚠️ 'teaching_assignment' table missing. Creating it...")
        try:
            cursor.execute("""
                CREATE TABLE teaching_assignment (
                    assignment_id INT PRIMARY KEY AUTO_INCREMENT,
                    teacher_id INT NOT NULL,
                    subject_id INT NOT NULL,
                    section_id INT NOT NULL,
                    department_id INT NOT NULL,
                    role ENUM('primary', 'assistant') DEFAULT 'primary',
                    FOREIGN KEY (teacher_id) REFERENCES teacher(teacher_id) ON DELETE CASCADE,
                    FOREIGN KEY (subject_id) REFERENCES subject(subject_id) ON DELETE CASCADE,
                    FOREIGN KEY (section_id) REFERENCES section(section_id) ON DELETE CASCADE,
                    FOREIGN KEY (department_id) REFERENCES department(department_id) ON DELETE RESTRICT,
                    UNIQUE KEY unique_subject_section (subject_id, section_id)
                )
            """)
            print("✅ 'teaching_assignment' table created successfully.")
        except Exception as e:
            print(f"❌ Failed to create 'teaching_assignment': {e}")
    else:
        print("✅ 'teaching_assignment' table exists. Checking columns and constraints...")
        if not column_exists('teaching_assignment', 'role'):
            print("⚠️ 'role' missing in 'teaching_assignment'. Adding it...")
            try:
                cursor.execute("ALTER TABLE teaching_assignment ADD COLUMN role ENUM('primary', 'assistant') DEFAULT 'primary'")
                print("✅ 'role' added successfully.")
            except Exception as e:
                print(f"❌ Failed to add 'role': {e}")

        # Check for strict unique constraint on (subject_id, section_id)
        cursor.execute("""
            SELECT COUNT(*) as count 
            FROM information_schema.STATISTICS 
            WHERE TABLE_SCHEMA = DATABASE() 
            AND TABLE_NAME = 'teaching_assignment' 
            AND INDEX_NAME = 'unique_subject_section'
        """)
        if cursor.fetchone()['count'] == 0:
            print("⚠️ Unique constraint 'unique_subject_section' missing. Adding it...")
            try:
                # Attempt to drop old leniant constraint if it was auto-named 'teacher_id'
                cursor.execute("ALTER TABLE teaching_assignment DROP INDEX teacher_id")
            except Exception:
                pass
            
            try:
                cursor.execute("ALTER TABLE teaching_assignment ADD CONSTRAINT unique_subject_section UNIQUE (subject_id, section_id)")
                print("✅ Unique constraint 'unique_subject_section' added.")
            except Exception as e:
                print(f"❌ Failed to add unique constraint (make sure no duplicate subject-section mappings exist): {e}")

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
                    assigned_by_admin INT NULL,
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
    
    if not column_exists('exam_section', 'assigned_by_admin'):
         print("⚠️ 'assigned_by_admin' column missing in 'exam_section'. Adding it...")
         try:
            cursor.execute("ALTER TABLE exam_section ADD COLUMN assigned_by_admin INT NULL")
            print("✅ 'assigned_by_admin' added successfully.")
         except Exception as e:
            print(f"❌ Failed to add 'assigned_by_admin': {e}")
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
                  `detected_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
                  `review_status` enum('Pending','Reviewed','Resolved','Dismissed') DEFAULT 'Pending',
                  `remarks` text,
                  `reviewed_by_admin` int DEFAULT NULL,
                  `reviewed_by_teacher` int DEFAULT NULL,
                  `reviewed_at` timestamp NULL DEFAULT NULL,
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
    else:
        print("✅ 'violation' table exists. Checking columns...")
        if not column_exists('violation', 'detected_at'):
             if column_exists('violation', 'timestamp'):
                 try:
                     cursor.execute("ALTER TABLE violation CHANGE COLUMN timestamp detected_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP")
                     print("✅ Renamed 'timestamp' to 'detected_at' in violation.")
                 except Exception as e:
                     print(f"❌ Failed to rename 'timestamp': {e}")
             else:
                 try:
                     cursor.execute("ALTER TABLE violation ADD COLUMN detected_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP")
                     print("✅ 'detected_at' added to violation.")
                 except Exception as e:
                     print(f"❌ Failed to add 'detected_at': {e}")
        
        if not column_exists('violation', 'remarks'):
             if column_exists('violation', 'admin_remarks'):
                 try:
                     cursor.execute("ALTER TABLE violation CHANGE COLUMN admin_remarks remarks TEXT")
                     print("✅ Renamed 'admin_remarks' to 'remarks' in violation.")
                 except Exception as e:
                     print(f"❌ Failed to rename 'admin_remarks': {e}")
             else:
                 try:
                     cursor.execute("ALTER TABLE violation ADD COLUMN remarks TEXT")
                     print("✅ 'remarks' added to violation.")
                 except Exception as e:
                     print(f"❌ Failed to add 'remarks': {e}")

        if not column_exists('violation', 'reviewed_by_admin'):
             try:
                 cursor.execute("ALTER TABLE violation ADD COLUMN reviewed_by_admin INT DEFAULT NULL")
                 print("✅ 'reviewed_by_admin' added to violation.")
             except Exception as e:
                 print(f"❌ Failed to add 'reviewed_by_admin': {e}")

        if not column_exists('violation', 'reviewed_by_teacher'):
             try:
                 cursor.execute("ALTER TABLE violation ADD COLUMN reviewed_by_teacher INT DEFAULT NULL")
                 print("✅ 'reviewed_by_teacher' added to violation.")
             except Exception as e:
                 print(f"❌ Failed to add 'reviewed_by_teacher': {e}")

        if not column_exists('violation', 'reviewed_at'):
             try:
                 cursor.execute("ALTER TABLE violation ADD COLUMN reviewed_at TIMESTAMP NULL DEFAULT NULL")
                 print("✅ 'reviewed_at' added to violation.")
             except Exception as e:
                 print(f"❌ Failed to add 'reviewed_at': {e}")
        
        try:
            cursor.execute("ALTER TABLE violation MODIFY COLUMN review_status ENUM('Pending','Reviewed','Resolved','Dismissed') DEFAULT 'Pending'")
            print("✅ 'review_status' ENUM updated in violation.")
        except Exception as e:
            print(f"❌ Failed to update 'review_status': {e}")

    # Check 'exam_retake' table
    print("Checking 'exam_retake' table...")
    cursor.execute("SHOW TABLES LIKE 'exam_retake'")
    if not cursor.fetchone():
        print("⚠️ 'exam_retake' table missing. Creating it...")
        try:
            cursor.execute("""
                CREATE TABLE `exam_retake` (
                  `retake_id` int NOT NULL AUTO_INCREMENT,
                  `exam_id` int NOT NULL,
                  `student_id` int NOT NULL,
                  `retake_date` datetime NOT NULL,
                  `retake_duration` int NOT NULL,
                  `created_by` int DEFAULT NULL,
                  `status` enum('scheduled','active','completed') DEFAULT 'scheduled',
                  PRIMARY KEY (`retake_id`),
                  KEY `exam_id` (`exam_id`),
                  KEY `student_id` (`student_id`),
                  CONSTRAINT `exam_retake_ibfk_1` FOREIGN KEY (`exam_id`) REFERENCES `exam` (`exam_id`) ON DELETE CASCADE,
                  CONSTRAINT `exam_retake_ibfk_2` FOREIGN KEY (`student_id`) REFERENCES `student` (`student_id`) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
            """)
            print("✅ 'exam_retake' table created successfully.")
        except Exception as e:
            print(f"❌ Failed to create 'exam_retake': {e}")

    # Check 'evidence' table
    print("Checking 'evidence' table...")
    cursor.execute("SHOW TABLES LIKE 'evidence'")
    if not cursor.fetchone():
        print("⚠️ 'evidence' table missing. Creating it...")
        try:
            cursor.execute("""
                CREATE TABLE `evidence` (
                  `evidence_id` int NOT NULL AUTO_INCREMENT,
                  `violation_id` int NOT NULL,
                  `camera_image_path` varchar(255) DEFAULT NULL,
                  `screenshot_path` varchar(255) DEFAULT NULL,
                  `captured_time` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
                  PRIMARY KEY (`evidence_id`),
                  KEY `violation_id` (`violation_id`),
                  CONSTRAINT `evidence_ibfk_1` FOREIGN KEY (`violation_id`) REFERENCES `violation` (`violation_id`) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
            """)
            print("✅ 'evidence' table created successfully.")
        except Exception as e:
            print(f"❌ Failed to create 'evidence': {e}")

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
                   `role` VARCHAR(20) DEFAULT 'super_admin',
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
        if not column_exists('super_admin', 'role'):
             try:
                 cursor.execute("ALTER TABLE super_admin ADD COLUMN role VARCHAR(20) DEFAULT 'super_admin'")
                 print("✅ 'role' added to super_admin.")
             except Exception as e:
                 print(f"❌ Failed to add 'role': {e}")
        
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

    # --- INFRASTRUCTURE TABLES (Center-Based Exams) ---
    print("Checking Infrastructure tables...")
    
    # Academic Block
    cursor.execute("SHOW TABLES LIKE 'academic_block'")
    if not cursor.fetchone():
        try:
            cursor.execute("""
                CREATE TABLE `academic_block` (
                    `block_id` INT NOT NULL AUTO_INCREMENT,
                    `name` VARCHAR(100) NOT NULL UNIQUE,
                    PRIMARY KEY (`block_id`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            """)
            print("✅ 'academic_block' table created.")
        except Exception as e: print(f"❌ Failed to create 'academic_block': {e}")

    # Floor
    cursor.execute("SHOW TABLES LIKE 'floor'")
    if not cursor.fetchone():
        try:
            cursor.execute("""
                CREATE TABLE `floor` (
                    `floor_id` INT NOT NULL AUTO_INCREMENT,
                    `block_id` INT NOT NULL,
                    `floor_number` INT NOT NULL,
                    PRIMARY KEY (`floor_id`),
                    FOREIGN KEY (`block_id`) REFERENCES `academic_block`(`block_id`) ON DELETE CASCADE,
                    UNIQUE KEY `unique_block_floor` (`block_id`, `floor_number`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            """)
            print("✅ 'floor' table created.")
        except Exception as e: print(f"❌ Failed to create 'floor': {e}")

    # Lab
    cursor.execute("SHOW TABLES LIKE 'lab'")
    if not cursor.fetchone():
        try:
            cursor.execute("""
                CREATE TABLE `lab` (
                    `lab_id` INT NOT NULL AUTO_INCREMENT,
                    `floor_id` INT NOT NULL,
                    `lab_name` VARCHAR(100) NOT NULL,
                    PRIMARY KEY (`lab_id`),
                    FOREIGN KEY (`floor_id`) REFERENCES `floor`(`floor_id`) ON DELETE CASCADE,
                    UNIQUE KEY `unique_floor_lab` (`floor_id`, `lab_name`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            """)
            print("✅ 'lab' table created.")
        except Exception as e: print(f"❌ Failed to create 'lab': {e}")

    # PC
    cursor.execute("SHOW TABLES LIKE 'pc'")
    if not cursor.fetchone():
        try:
            cursor.execute("""
                CREATE TABLE `pc` (
                    `pc_id` INT NOT NULL AUTO_INCREMENT,
                    `lab_id` INT NOT NULL,
                    `pc_number` VARCHAR(50) NOT NULL,
                    `status` ENUM('ACTIVE', 'INACTIVE') DEFAULT 'ACTIVE',
                    `ip_address` VARCHAR(45) DEFAULT NULL,
                    PRIMARY KEY (`pc_id`),
                    FOREIGN KEY (`lab_id`) REFERENCES `lab`(`lab_id`) ON DELETE CASCADE,
                    UNIQUE KEY `unique_lab_pc` (`lab_id`, `pc_number`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            """)
            print("✅ 'pc' table created.")
        except Exception as e: print(f"❌ Failed to create 'pc': {e}")

    # Exam Table Modifications
    print("Checking Exam mode configurations...")
    if not column_exists('exam', 'mode'):
        try:
            cursor.execute("ALTER TABLE `exam` ADD COLUMN `mode` ENUM('ONLINE', 'CENTER') DEFAULT 'ONLINE'")
            cursor.execute("ALTER TABLE `exam` ADD COLUMN `password` VARCHAR(255) DEFAULT NULL")
            cursor.execute("ALTER TABLE `exam` ADD COLUMN `lab_id` INT DEFAULT NULL")
            cursor.execute("ALTER TABLE `exam` ADD CONSTRAINT `fk_exam_lab` FOREIGN KEY (`lab_id`) REFERENCES `lab`(`lab_id`) ON DELETE SET NULL")
            print("✅ Added 'mode', 'password', and 'lab_id' to exam table.")
        except Exception as e: print(f"❌ Failed to update exam table for center modes: {e}")

    # Student PC Assignment
    cursor.execute("SHOW TABLES LIKE 'student_pc_assignment'")
    if not cursor.fetchone():
        try:
            cursor.execute("""
                CREATE TABLE `student_pc_assignment` (
                    `id` INT NOT NULL AUTO_INCREMENT,
                    `exam_id` INT NOT NULL,
                    `student_id` INT NOT NULL,
                    `pc_id` INT NOT NULL,
                    `status` ENUM('ASSIGNED', 'ACTIVE', 'COMPLETED') DEFAULT 'ASSIGNED',
                    PRIMARY KEY (`id`),
                    FOREIGN KEY (`exam_id`) REFERENCES `exam`(`exam_id`) ON DELETE CASCADE,
                    FOREIGN KEY (`student_id`) REFERENCES `student`(`student_id`) ON DELETE CASCADE,
                    FOREIGN KEY (`pc_id`) REFERENCES `pc`(`pc_id`) ON DELETE CASCADE,
                    UNIQUE KEY `unique_exam_student` (`exam_id`, `student_id`),
                    UNIQUE KEY `unique_exam_pc` (`exam_id`, `pc_id`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            """)
            print("✅ 'student_pc_assignment' table created.")
        except Exception as e: print(f"❌ Failed to create 'student_pc_assignment': {e}")

    # --- Data Migration / Fixes ---
    print("\n--- Running Data Migrations ---")
    try:
        # Fix exams that should be 'CENTER' but were saved as 'ONLINE'
        cursor.execute("""
            UPDATE exam 
            SET mode = 'CENTER' 
            WHERE mode = 'ONLINE' AND (lab_id IS NOT NULL OR password IS NOT NULL)
        """)
        if cursor.rowcount > 0:
            print(f"✅ Fixed {cursor.rowcount} exams with inconsistent 'CENTER' mode data.")
        else:
            print("✅ No inconsistent exam modes found.")
    except Exception as e:
        print(f"❌ Failed to run data migration for exam modes: {e}")

    # --- Enforce Cascading Deletes ---
    print("--- Enforcing Cascading Deletes ---")
    def enforce_cascade(table, column, ref_table, ref_column):
        # Check existing FK
        cursor.execute("""
            SELECT k.CONSTRAINT_NAME, r.DELETE_RULE
            FROM information_schema.KEY_COLUMN_USAGE k
            JOIN information_schema.REFERENTIAL_CONSTRAINTS r 
              ON k.CONSTRAINT_NAME = r.CONSTRAINT_NAME 
              AND k.CONSTRAINT_SCHEMA = r.CONSTRAINT_SCHEMA
            WHERE k.TABLE_NAME = %s 
            AND k.COLUMN_NAME = %s 
            AND k.REFERENCED_TABLE_NAME = %s 
            AND k.REFERENCED_COLUMN_NAME = %s
            AND k.TABLE_SCHEMA = DATABASE()
        """, (table, column, ref_table, ref_column))
        
        rows = cursor.fetchall()
        
        if not rows:
            print(f"⚠️ FK missing on {table}.{column}. Creating with CASCADE...")
            constraint_name = f"fk_{table}_{column}_{ref_table}"[:64]
            try:
                cursor.execute(f"ALTER TABLE `{table}` ADD CONSTRAINT `{constraint_name}` FOREIGN KEY (`{column}`) REFERENCES `{ref_table}` (`{ref_column}`) ON DELETE CASCADE")
                print(f"✅ Created FK {constraint_name}")
            except Exception as e:
                print(f"❌ Failed to create FK on {table}.{column}: {e}")
            return

        for row in rows:
            if row['DELETE_RULE'] != 'CASCADE':
                constraint_name = row['CONSTRAINT_NAME']
                print(f"⚠️ FK {constraint_name} on {table}.{column} is {row['DELETE_RULE']}. Updating to CASCADE...")
                try:
                    cursor.execute(f"ALTER TABLE `{table}` DROP FOREIGN KEY `{constraint_name}`")
                    cursor.execute(f"ALTER TABLE `{table}` ADD CONSTRAINT `{constraint_name}` FOREIGN KEY (`{column}`) REFERENCES `{ref_table}` (`{ref_column}`) ON DELETE CASCADE")
                    print(f"✅ Updated FK {constraint_name} to CASCADE.")
                except Exception as e:
                    print(f"❌ Failed to update FK {constraint_name}: {e}")

    # Apply enforcement
    enforce_cascade('question', 'exam_id', 'exam', 'exam_id')
    enforce_cascade('question_option', 'question_id', 'question', 'question_id')
    enforce_cascade('exam_section', 'exam_id', 'exam', 'exam_id')
    enforce_cascade('attempt', 'exam_id', 'exam', 'exam_id')
    enforce_cascade('answer', 'exam_id', 'exam', 'exam_id')
    enforce_cascade('answer', 'question_id', 'question', 'question_id')
    enforce_cascade('result', 'exam_id', 'exam', 'exam_id')
    enforce_cascade('violation', 'exam_id', 'exam', 'exam_id')
    enforce_cascade('evidence', 'violation_id', 'violation', 'violation_id')

    conn.commit()
    cursor.close()
    conn.close()
    print("--- Update Complete ---")

if __name__ == "__main__":
    update_database()