from db import get_connection

def verify_schema():
    conn = get_connection()
    if conn is None:
        print("❌ Database connection failed.")
        return

    cursor = conn.cursor(dictionary=True)
    print("\n🔍 Verifying Database Schema...\n")

    # 1. Check 'exam' table for 'total_marks'
    print("Checking 'exam' table:")
    cursor.execute("DESCRIBE exam")
    columns = [col['Field'] for col in cursor.fetchall()]
    if 'total_marks' in columns:
        print("   ✅ 'total_marks' column exists.")
    else:
        print("   ❌ 'total_marks' column is MISSING.")

    # 2. Check 'question' table for 'marks'
    print("\nChecking 'question' table:")
    cursor.execute("DESCRIBE question")
    columns = [col['Field'] for col in cursor.fetchall()]
    if 'marks' in columns:
        print("   ✅ 'marks' column exists.")
    else:
        print("   ❌ 'marks' column is MISSING.")

    # 3. Check 'teaching_assignment' table
    print("\nChecking 'teaching_assignment' table:")
    cursor.execute("SHOW TABLES LIKE 'teaching_assignment'")
    if cursor.fetchone():
        print("   ✅ Table 'teaching_assignment' exists.")
    else:
        print("   ❌ Table 'teaching_assignment' is MISSING.")

    conn.close()

if __name__ == "__main__":
    verify_schema()