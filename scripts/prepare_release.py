import os
import shutil
import sqlite3
import hashlib
from pathlib import Path

# --- Configuration ---
ROOT_DIR = Path(__file__).parent.parent
DIST_DIR = ROOT_DIR / "dist" / "PharmaPro_v2_Final"
DATA_DIR = DIST_DIR / "data"
CURRENT_DB = ROOT_DIR / "data" / "pharmapro.db"

# Folders to create
FOLDERS = ["data", "uploads", "logs", "docs"]

def clean_dist():
    print("Cleaning old build artifacts...")
    if DIST_DIR.exists():
        shutil.rmtree(DIST_DIR)
    DIST_DIR.mkdir(parents=True)
    for f in FOLDERS:
        (DIST_DIR / f).mkdir(exist_ok=True)

def copy_essentials():
    print("Copying documentation...")
    docs_src = ROOT_DIR / "docs"
    if docs_src.exists():
        shutil.copytree(docs_src, DIST_DIR / "docs", dirs_exist_ok=True)
    
    # Copy the master database (we will clean it in the next step)
    print("Preparing Gold Master Database...")
    if CURRENT_DB.exists():
        shutil.copy2(CURRENT_DB, DATA_DIR / "pharmapro.db")
    else:
        print("Warning: Current DB not found. Initializing empty DB.")

def sanitize_db():
    db_path = DATA_DIR / "pharmapro.db"
    if not db_path.exists():
        return
        
    print("Sanitizing Database (Wiping test data, preserving Master Drugs)...")
    conn = sqlite3.connect(db_path)
    
    # Tables to wipe completely (User data)
    WIPE_TABLES = [
        "bills", "bill_items", "batches", "drugs", "trays", 
        "customers", "suppliers", "stock_log", "backorders", 
        "credit_ledger", "bill_returns", "bill_return_items",
        "loc_fixtures", "loc_compartments", "loc_boxes", "prescriptions"
    ]
    
    for table in WIPE_TABLES:
        try:
            conn.execute(f"DELETE FROM {table}")
        except:
            pass # Table might not exist yet
            
    # Reset Admin password to admin123
    h = "sha256:" + hashlib.sha256("admin123".encode()).hexdigest()
    conn.execute("UPDATE users SET password_hash=? WHERE username='admin'", (h,))
    
    # Ensure default admin exists if not found
    conn.execute("INSERT OR IGNORE INTO users (username, display_name, password_hash, role, active) VALUES (?,?,?,?,1)",
                 ("admin", "Administrator", h, "admin"))
    
    # Reset Shop Config
    conn.execute("UPDATE shop_config SET value='PharmaPro Retail' WHERE key='name'")
    
    # OPTIONAL: Keep the master_drugs table! We DON'T wipe it.
    
    conn.commit()
    conn.close()
    print("Database sanitized successfully.")

if __name__ == "__main__":
    print("=== PharmaPro Master Clean Build ===")
    clean_dist()
    copy_essentials()
    sanitize_db()
    print("SUCCESS: Clean environment prepared at " + str(DIST_DIR))
    print("Next step: Run the EXE build and copy the EXE into this folder.")
