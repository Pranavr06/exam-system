from db import get_connection

def log_action(user_id, role, department_id, action, entity_type=None, entity_id=None, ip_address=None):
    """
    Helper function to insert a log into the system_logs table.
    """
    conn = get_connection()
    cursor = conn.cursor()
    try:
        query = """
            INSERT INTO system_logs 
            (user_id, role, department_id, action, entity_type, entity_id, ip_address)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
        """
        cursor.execute(query, (user_id, role, department_id, action, entity_type, entity_id, ip_address))
        conn.commit()
    except Exception as e:
        # In a production environment, you might want to log this error to a file instead of printing.
        print(f"Error logging action: {e}")
    finally:
        cursor.close()
        conn.close()

def log_teacher_action(teacher_id, department_id, action, section_id=None, student_id=None, exam_id=None, ip_address=None):
    """
    Helper function to insert a log into the teacher_activity_logs table.
    """
    conn = get_connection()
    cursor = conn.cursor()
    try:
        query = """
            INSERT INTO teacher_activity_logs 
            (teacher_id, department_id, section_id, student_id, exam_id, action, ip_address)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
        """
        cursor.execute(query, (teacher_id, department_id, section_id, student_id, exam_id, action, ip_address))
        conn.commit()
    except Exception as e:
        print(f"Error logging teacher action: {e}")
    finally:
        cursor.close()
        conn.close()