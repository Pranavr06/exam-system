import mysql.connector
import os
from dotenv import load_dotenv

load_dotenv()

local_db = mysql.connector.connect(host="localhost", user="root", password="Pranavr@(mysql)dbdb!!", database="OEMS", port=3306)
local_cursor = local_db.cursor(dictionary=True)

aiven_db = mysql.connector.connect(
    host=os.getenv("DB_HOST"),
    user=os.getenv("DB_USER"),
    password=os.getenv("DB_PASSWORD"),
    database=os.getenv("DB_NAME"),
    port=int(os.getenv("DB_PORT")),
    ssl_ca="ca.pem",
    ssl_disabled=False
)
aiven_cursor = aiven_db.cursor(dictionary=True)

# Get all tables in Aiven to ensure we only migrate matching tables
aiven_cursor.execute("SHOW TABLES")
aiven_tables = [list(table.values())[0] for table in aiven_cursor.fetchall()]

local_cursor.execute("SHOW TABLES")
local_tables = [list(table.values())[0] for table in local_cursor.fetchall()]

aiven_cursor.execute("SET FOREIGN_KEY_CHECKS=0;")

for table in local_tables:
    if table not in aiven_tables:
        continue

    # Get local columns
    local_cursor.execute(f"SHOW COLUMNS FROM {table}")
    local_cols = [col['Field'] for col in local_cursor.fetchall()]
    
    # Get aiven columns
    aiven_cursor.execute(f"SHOW COLUMNS FROM {table}")
    aiven_cols = [col['Field'] for col in aiven_cursor.fetchall()]
    
    # Only migrate columns that exist in BOTH databases
    common_cols = [col for col in local_cols if col in aiven_cols]
    
    if not common_cols:
        continue

    cols_str = ", ".join(common_cols)
    
    local_cursor.execute(f"SELECT {cols_str} FROM {table}")
    rows = local_cursor.fetchall()
    
    if not rows:
        continue
        
    placeholders = ", ".join(["%s"] * len(common_cols))
    
    query = f"REPLACE INTO {table} ({cols_str}) VALUES ({placeholders})"
    values = [tuple(row[col] for col in common_cols) for row in rows]
    
    try:
        a_cursor = aiven_db.cursor()
        a_cursor.executemany(query, values)
        aiven_db.commit()
        print(f"Migrated {len(rows)} rows into {table}")
    except Exception as e:
        print(f"Failed on {table}: {e}")

aiven_cursor.execute("SET FOREIGN_KEY_CHECKS=1;")
print("Migration Complete!")
