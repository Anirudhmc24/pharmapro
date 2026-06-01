
import sqlite3
from pathlib import Path

DB_PATH = Path("data/pharmapro.db")

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def rows_to_list(rows):
    if not rows: return []
    return [dict(r) for r in rows]

def test_master_all():
    page = 1
    limit = 50
    offset = (page - 1) * limit
    conn = get_db()
    try:
        print(f"Executing query with limit={limit}, offset={offset}")
        rows = conn.execute("""
            SELECT name, manufacturer, composition, mrp, description
            FROM master_drugs
            ORDER BY name
            LIMIT ? OFFSET ?
        """, (limit, offset)).fetchall()
        print(f"Fetched {len(rows)} rows")
        
        total = conn.execute("SELECT COUNT(*) FROM master_drugs").fetchone()[0]
        print(f"Total count: {total}")
        
        items = rows_to_list(rows)
        print(f"Converted {len(items)} items to list")
        
        result = {"items": items, "total": total, "page": page, "limit": limit}
        print("Success")
    except Exception as e:
        print(f"Error: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    test_master_all()
