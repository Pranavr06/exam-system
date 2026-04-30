import os
import mysql.connector
from mysql.connector import Error

def get_connection():
    try:
        connection = mysql.connector.connect(
            # Prioritize Railway's native variables, fallback to DB_ vars, then localhost
            host=os.getenv("MYSQLHOST", os.getenv("DB_HOST", "localhost")),
            user=os.getenv("MYSQLUSER", os.getenv("DB_USER", "root")),
            password=os.getenv("MYSQLPASSWORD", os.getenv("DB_PASSWORD", "Pranavr@(mysql)dbdb!!")),
            database=os.getenv("MYSQLDATABASE", os.getenv("DB_NAME", "OEMS")),
            port=int(os.getenv("MYSQLPORT", os.getenv("DB_PORT", 3306)))
        )
        return connection
    except Error as e:
        print("Database connection failed:", e)
        return None