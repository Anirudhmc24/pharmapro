import sqlite3
import os

db_paths = [
    r"c:\Ideas\pharmapro\dist\data\pharmapro.db",
    r"c:\Ideas\pharmapro\data\pharmapro.db"
]

tables_to_clear = [
    "bills",
    "bill_items",
    "bill_returns",
    "bill_return_items",
    "prescriptions",
    "purchase_orders",
    "po_items",
    "expiry_returns",
    "backorders",
    "credit_ledger",
    "schedule_log",
    "stock_log",
    "trays",
    "customers"  # Clearing test customers as well
]

for db_path in db_paths:
    if not os.path.exists(db_path):
        continue
    
    print(f"Connecting to {db_path}...")
    conn = sqlite3.connect(db_path)
    try:
        # Disable foreign keys temporarily for truncation
        conn.execute("PRAGMA foreign_keys=OFF")
        
        for table in tables_to_clear:
            conn.execute(f"DELETE FROM {table}")
            conn.execute("DELETE FROM sqlite_sequence WHERE name=?", (table,))
            print(f"  - Cleared {table}")
            
        conn.commit()
        print(f"Successfully cleared test data in {db_path}.\n")
    except Exception as e:
        print(f"Error in {db_path}: {e}")
        conn.rollback()
    finally:
        # Re-enable foreign keys
        conn.execute("PRAGMA foreign_keys=ON")
        conn.close()
