import os
import mysql.connector
from mysql.connector import Error

def get_connection():
    try:
        # Configuration
        host = os.getenv("MYSQLHOST", os.getenv("DB_HOST", "localhost"))
        user = os.getenv("MYSQLUSER", os.getenv("DB_USER", "root"))
        password = os.getenv("MYSQLPASSWORD", os.getenv("DB_PASSWORD", "Pranavr@(mysql)dbdb!!"))
        database = os.getenv("MYSQLDATABASE", os.getenv("DB_NAME", "OEMS"))
        port = int(os.getenv("MYSQLPORT", os.getenv("DB_PORT", 3306)))

        # SSL Configuration for cloud databases like Aiven
        ssl_ca = os.getenv("DB_SSL_CA", "ca.pem") # Aiven uses ca.pem

        connection_args = {
            "host": host,
            "user": user,
            "password": password,
            "database": database,
            "port": port
        }

        # Check if ca.pem exists in the backend folder
        if os.path.exists(ssl_ca):
            connection_args["ssl_ca"] = ssl_ca
            connection_args["ssl_disabled"] = False
        else:
            # If no CA provided, try without strict SSL (might fail on Aiven)
            connection_args["ssl_disabled"] = True

        connection = mysql.connector.connect(**connection_args)
        return connection
    except Error as e:
        print("Database connection failed:", e)
        return None
