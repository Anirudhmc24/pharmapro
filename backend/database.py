"""
PharmaPro — database.py
DB connection helper + schema definition + init_db()
"""

import sys
import os
import sqlite3
from pathlib import Path
from contextlib import contextmanager

# Handle paths for PyInstaller (Frozen vs Source)
if getattr(sys, 'frozen', False):
    # Running as a bundled EXE
    PERSISTENT_ROOT = Path(os.path.dirname(sys.executable))
else:
    # Running from source
    PERSISTENT_ROOT = Path(__file__).parent.parent

DATA_DIR = PERSISTENT_ROOT / "data"
DB_PATH  = DATA_DIR / "pharmapro.db"
DATA_DIR.mkdir(exist_ok=True)

def get_android_backup_paths():
    paths = []
    paths.append(Path("/storage/emulated/0/Download/pharmapro_backup.db"))
    paths.append(Path("/storage/emulated/0/Documents/pharmapro_backup.db"))
    paths.append(Path("/sdcard/Download/pharmapro_backup.db"))
    paths.append(Path("/sdcard/Documents/pharmapro_backup.db"))
    try:
        from jnius import autoclass
        Environment = autoclass('android.os.Environment')
        download_dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
        if download_dir:
            paths.append(Path(download_dir.getAbsolutePath()) / "pharmapro_backup.db")
        doc_dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOCUMENTS)
        if doc_dir:
            paths.append(Path(doc_dir.getAbsolutePath()) / "pharmapro_backup.db")
    except Exception:
        pass
    seen = set()
    result = []
    for p in paths:
        if p not in seen:
            seen.add(p)
            result.append(p)
    return result

def checkpoint_db():
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        conn.close()
    except Exception:
        pass

def check_and_perform_android_backup():
    if "ANDROID_ARGUMENT" not in os.environ:
        return
    try:
        import shutil
        checkpoint_db()
        if not DB_PATH.exists() or DB_PATH.stat().st_size == 0:
            return
        backup_paths = get_android_backup_paths()
        for bp in backup_paths:
            try:
                bp.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(DB_PATH, bp)
            except Exception:
                pass
    except Exception:
        pass

@contextmanager
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    try:
        yield conn
        conn.commit()
        check_and_perform_android_backup()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

def row_to_dict(row):
    return dict(row) if row else None

def rows_to_list(rows):
    if not rows: return []
    try:
        return [dict(r) for r in rows]
    except Exception:
        # If dict() fails, it's likely tuples. Return as is or handle manually.
        return rows

SCHEMA = """
CREATE TABLE IF NOT EXISTS shop_config (
    key   TEXT PRIMARY KEY,
    value TEXT
);

CREATE TABLE IF NOT EXISTS users (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    username     TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role         TEXT DEFAULT 'pharmacist',
    active       INTEGER DEFAULT 1,
    created_at   TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS drugs (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    name              TEXT NOT NULL,
    brand             TEXT,
    composition       TEXT,
    category          TEXT,
    schedule          TEXT DEFAULT 'OTC',
    hsn               TEXT DEFAULT '30049099',
    tablets_per_strip INTEGER DEFAULT 10,
    strips_per_box    INTEGER DEFAULT 10,
    mrp_per_strip     REAL DEFAULT 0,
    mrp_per_tablet    REAL DEFAULT 0,
    reorder_level     INTEGER DEFAULT 20,
    box_id            INTEGER REFERENCES loc_boxes(id),
    offer_type        TEXT DEFAULT '',
    pack_type         TEXT DEFAULT 'Strip',
    indications       TEXT,
    side_effects      TEXT,
    administration    TEXT,
    age_suitability   TEXT,
    ai_enriched       INTEGER DEFAULT 0,
    created_at        TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS batches (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    drug_id         INTEGER NOT NULL REFERENCES drugs(id),
    batch_no        TEXT NOT NULL,
    expiry          TEXT NOT NULL,
    full_strips     INTEGER DEFAULT 0,
    cost_per_strip  REAL DEFAULT 0,
    supplier_id     INTEGER,
    free_strips     INTEGER DEFAULT 0,
    mrp_per_strip   REAL,
    gst_pct         REAL DEFAULT 0,
    box_id          INTEGER REFERENCES loc_boxes(id),
    received_on     TEXT DEFAULT (date('now')),
    UNIQUE(drug_id, batch_no)
);

CREATE TABLE IF NOT EXISTS trays (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    tray_id           TEXT UNIQUE NOT NULL,
    drug_id           INTEGER NOT NULL REFERENCES drugs(id),
    batch_id          INTEGER NOT NULL REFERENCES batches(id),
    tablets_remaining INTEGER DEFAULT 0,
    box_id            INTEGER REFERENCES loc_boxes(id),
    opened_on         TEXT DEFAULT (date('now')),
    closed            INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS customers (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    name                TEXT NOT NULL,
    phone               TEXT UNIQUE,
    dob                 TEXT,
    loyalty_points      INTEGER DEFAULT 0,
    credit_balance      REAL DEFAULT 0,
    custom_id           TEXT,
    agreed_discount     REAL DEFAULT 0.0,
    purchased_medicines TEXT DEFAULT '',
    last_purchase_date  TEXT DEFAULT '',
    created_at          TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS suppliers (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    name    TEXT NOT NULL,
    contact TEXT,
    phone   TEXT,
    email   TEXT,
    gstin   TEXT,
    due     REAL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS bills (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    bill_no      TEXT UNIQUE NOT NULL,
    customer_id  INTEGER REFERENCES customers(id),
    patient_name TEXT,
    doctor       TEXT,
    rx_no        TEXT,
    subtotal     REAL,
    discount_pct REAL DEFAULT 0,
    discount_amt REAL DEFAULT 0,
    gst_amt      REAL DEFAULT 0,
    total        REAL,
    payment_mode TEXT DEFAULT 'Cash',
    created_by   INTEGER REFERENCES users(id),
    created_at   TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bill_items (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    bill_id     INTEGER NOT NULL REFERENCES bills(id),
    drug_id     INTEGER NOT NULL REFERENCES drugs(id),
    batch_id    INTEGER REFERENCES batches(id),
    tray_id     INTEGER REFERENCES trays(id),
    tablets_qty INTEGER NOT NULL,
    mrp_per_tab REAL,
    amount      REAL
);

CREATE TABLE IF NOT EXISTS stock_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    drug_id    INTEGER REFERENCES drugs(id),
    batch_id   INTEGER REFERENCES batches(id),
    action     TEXT,
    qty_change INTEGER,
    note       TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS loc_fixtures (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    name     TEXT NOT NULL,
    type     TEXT DEFAULT 'rack',
    x_pos    INTEGER DEFAULT 0,
    y_pos    INTEGER DEFAULT 0,
    width    INTEGER DEFAULT 100,
    height   INTEGER DEFAULT 100,
    color    TEXT DEFAULT '#3b82f6'
);

CREATE TABLE IF NOT EXISTS loc_compartments (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    fixture_id INTEGER NOT NULL REFERENCES loc_fixtures(id),
    name       TEXT NOT NULL,
    type       TEXT DEFAULT 'shelf',
    position   INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS loc_boxes (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    compartment_id INTEGER NOT NULL REFERENCES loc_compartments(id),
    name           TEXT NOT NULL,
    capacity       INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS prescriptions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    rx_no       TEXT UNIQUE NOT NULL,
    patient     TEXT,
    doctor      TEXT,
    rx_date     TEXT,
    status      TEXT DEFAULT 'pending',
    bill_id     INTEGER REFERENCES bills(id),
    created_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS purchase_orders (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    po_no       TEXT UNIQUE NOT NULL,
    supplier_id INTEGER REFERENCES suppliers(id),
    status      TEXT DEFAULT 'draft',
    notes       TEXT DEFAULT '',
    total_amt   REAL DEFAULT 0,
    created_by  INTEGER REFERENCES users(id),
    ordered_at  TEXT,
    received_at TEXT,
    created_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS po_items (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    po_id        INTEGER NOT NULL REFERENCES purchase_orders(id),
    drug_id      INTEGER NOT NULL REFERENCES drugs(id),
    qty_strips   INTEGER DEFAULT 0,
    rate_per_strip REAL DEFAULT 0,
    discount_pct REAL DEFAULT 0,
    gst_pct      REAL DEFAULT 0,
    received_strips INTEGER DEFAULT 0,
    batch_no     TEXT DEFAULT '',
    expiry       TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS expiry_returns (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    drug_id     INTEGER REFERENCES drugs(id),
    batch_id    INTEGER REFERENCES batches(id),
    supplier_id INTEGER REFERENCES suppliers(id),
    strips_returned INTEGER DEFAULT 0,
    reason      TEXT DEFAULT 'expiry',
    created_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS backorders (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    drug_id       INTEGER NOT NULL REFERENCES drugs(id),
    customer_name TEXT NOT NULL,
    phone         TEXT NOT NULL,
    qty_strips    INTEGER DEFAULT 1,
    notes         TEXT DEFAULT '',
    status        TEXT DEFAULT 'pending',
    notified_at   TEXT,
    created_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bill_returns (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    bill_id      INTEGER NOT NULL REFERENCES bills(id),
    return_no    TEXT UNIQUE NOT NULL,
    reason       TEXT DEFAULT '',
    refund_mode  TEXT DEFAULT 'Cash',
    total_refund REAL DEFAULT 0,
    created_by   INTEGER REFERENCES users(id),
    created_at   TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bill_return_items (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    return_id    INTEGER NOT NULL REFERENCES bill_returns(id),
    bill_item_id INTEGER NOT NULL REFERENCES bill_items(id),
    drug_id      INTEGER NOT NULL REFERENCES drugs(id),
    batch_id     INTEGER REFERENCES batches(id),
    tablets_qty  INTEGER NOT NULL,
    amount       REAL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS credit_ledger (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    bill_id     INTEGER REFERENCES bills(id),
    type        TEXT NOT NULL,
    amount      REAL DEFAULT 0,
    note        TEXT DEFAULT '',
    created_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS schedule_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    drug_id    INTEGER REFERENCES drugs(id),
    bill_id    INTEGER REFERENCES bills(id),
    patient    TEXT DEFAULT '',
    doctor     TEXT DEFAULT '',
    rx_no      TEXT DEFAULT '',
    qty_tabs   INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS master_drugs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    manufacturer TEXT,
    composition TEXT,
    mrp REAL,
    hsn TEXT,
    description TEXT,
    indications TEXT,
    side_effects TEXT,
    administration TEXT,
    age_suitability TEXT,
    ai_enriched INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_master_name ON master_drugs(name);
"""


def init_db():
    import random
    import sqlite3

    # Auto-Restore from Android external backup if local DB is missing/empty
    if "ANDROID_ARGUMENT" in os.environ:
        if not DB_PATH.exists() or DB_PATH.stat().st_size == 0:
            backup_paths = get_android_backup_paths()
            for bp in backup_paths:
                if bp.exists() and bp.stat().st_size > 0:
                    try:
                        import shutil
                        DB_PATH.parent.mkdir(parents=True, exist_ok=True)
                        shutil.copy2(bp, DB_PATH)
                        break
                    except Exception:
                        pass

    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        conn.executescript(SCHEMA)

        # Auto-seed master drugs from master_template.db if empty
        template_db = Path(__file__).parent / "master_template.db"
        if template_db.exists():
            try:
                count = conn.execute("SELECT COUNT(*) FROM master_drugs").fetchone()[0]
                if count == 0:
                    conn.execute("ATTACH DATABASE ? AS template", (str(template_db),))
                    conn.execute("INSERT OR IGNORE INTO master_drugs(id, name, manufacturer, composition, mrp, description, hsn) SELECT id, name, manufacturer, composition, mrp, description, hsn FROM template.master_drugs")
                    conn.execute("DETACH DATABASE template")
            except Exception:
                try: conn.execute("DETACH DATABASE template")
                except Exception: pass
        
        # Safe migrations for new columns
        try: conn.execute("ALTER TABLE drugs ADD COLUMN barcode TEXT UNIQUE")
        except sqlite3.OperationalError: pass
        
        try: conn.execute("ALTER TABLE drugs ADD COLUMN offer_type TEXT DEFAULT ''")
        except sqlite3.OperationalError: pass
        
        try: conn.execute("ALTER TABLE master_drugs ADD COLUMN hsn TEXT")
        except sqlite3.OperationalError: pass

        try: conn.execute("ALTER TABLE master_drugs ADD COLUMN indications TEXT")
        except sqlite3.OperationalError: pass

        try: conn.execute("ALTER TABLE master_drugs ADD COLUMN side_effects TEXT")
        except sqlite3.OperationalError: pass

        try: conn.execute("ALTER TABLE master_drugs ADD COLUMN administration TEXT")
        except sqlite3.OperationalError: pass

        try: conn.execute("ALTER TABLE master_drugs ADD COLUMN age_suitability TEXT")
        except sqlite3.OperationalError: pass

        try: conn.execute("ALTER TABLE prescriptions ADD COLUMN image_path TEXT")
        except sqlite3.OperationalError: pass

        try: conn.execute("ALTER TABLE po_items ADD COLUMN discount_pct REAL DEFAULT 0")
        except sqlite3.OperationalError: pass
        
        try: conn.execute("ALTER TABLE po_items ADD COLUMN gst_pct REAL DEFAULT 0")
        except sqlite3.OperationalError: pass
        
        try: conn.execute("ALTER TABLE drugs ADD COLUMN pack_type TEXT DEFAULT 'Strip'")
        except sqlite3.OperationalError: pass

        try: conn.execute("ALTER TABLE drugs ADD COLUMN indications TEXT")
        except sqlite3.OperationalError: pass
        
        try: conn.execute("ALTER TABLE drugs ADD COLUMN side_effects TEXT")
        except sqlite3.OperationalError: pass
        
        try: conn.execute("ALTER TABLE drugs ADD COLUMN administration TEXT")
        except sqlite3.OperationalError: pass

        try: conn.execute("ALTER TABLE drugs ADD COLUMN age_suitability TEXT")
        except sqlite3.OperationalError: pass

        try: conn.execute("ALTER TABLE customers ADD COLUMN credit_balance REAL DEFAULT 0")
        except sqlite3.OperationalError: pass

        try: conn.execute("ALTER TABLE customers ADD COLUMN custom_id TEXT")
        except sqlite3.OperationalError: pass

        try: conn.execute("ALTER TABLE customers ADD COLUMN agreed_discount REAL DEFAULT 0.0")
        except sqlite3.OperationalError: pass

        try: conn.execute("ALTER TABLE customers ADD COLUMN purchased_medicines TEXT DEFAULT ''")
        except sqlite3.OperationalError: pass

        try: conn.execute("ALTER TABLE customers ADD COLUMN last_purchase_date TEXT DEFAULT ''")
        except sqlite3.OperationalError: pass

        try: conn.execute("ALTER TABLE drugs ADD COLUMN ai_enriched INTEGER DEFAULT 0")
        except sqlite3.OperationalError: pass

        try: conn.execute("ALTER TABLE master_drugs ADD COLUMN ai_enriched INTEGER DEFAULT 0")
        except sqlite3.OperationalError: pass

        # Seed default admin user
        admin = conn.execute("SELECT id FROM users WHERE username='admin'").fetchone()
        if not admin:
            try:
                from passlib.context import CryptContext
                pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
                hashed = pwd_ctx.hash("admin123")
            except Exception:
                import hashlib
                hashed = "sha256:" + hashlib.sha256("admin123".encode()).hexdigest()
            conn.execute(
                "INSERT OR IGNORE INTO users(username,display_name,password_hash,role) VALUES(?,?,?,?)",
                ("admin", "Administrator", hashed, "admin")
            )

        # REMOVED: Auto-seeding of demo data for clean production builds.
        pass
