import mysql.connector
import os
from dotenv import load_dotenv
load_dotenv()
aiven_db = mysql.connector.connect(
    host=os.getenv("DB_HOST"),
    user=os.getenv("DB_USER"),
    password=os.getenv("DB_PASSWORD"),
    database=os.getenv("DB_NAME"),
    port=int(os.getenv("DB_PORT")),
    ssl_ca="ca.pem",
    ssl_disabled=False
)
aiven_cursor = aiven_db.cursor()
aiven_cursor.execute("SHOW TABLES")
print(aiven_cursor.fetchall())
