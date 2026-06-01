
import sqlite3
from pathlib import Path
import sys

# Add root to sys.path
sys.path.insert(0, str(Path(__file__).parent.parent))

from backend.database import init_db, DB_PATH

def verify():
    print(f"Initializing database at {DB_PATH}...")
    init_db()
    
    conn = sqlite3.connect(DB_PATH)
    cur = conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='master_drugs'")
    row = cur.fetchone()
    if row:
        print("Success: master_drugs table exists.")
    else:
        print("Failure: master_drugs table still missing.")
    conn.close()

if __name__ == "__main__":
    verify()
