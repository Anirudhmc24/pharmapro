"""
PharmaPro - Online Pharmacy POS
FastAPI + SQLite + JWT Auth
Super Admin approves / blocks shop owners
"""

import sqlite3, json, os, base64, re, urllib.request, hashlib, hmac, secrets
from datetime import datetime, date, timedelta
from pathlib import Path
from typing import Optional
from contextlib import contextmanager

from fastapi import FastAPI, HTTPException, Depends, Request, status
from fastapi.responses import FileResponse, JSONResponse, HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel

# ── Config ─────────────────────────────────────────────────────────────────────
# Change these before deploying!
SUPER_ADMIN_EMAIL    = os.environ.get("ADMIN_EMAIL", "admin@pharmapro.com")
SUPER_ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "Admin@1234")
JWT_SECRET           = os.environ.get("JWT_SECRET", secrets.token_hex(32))
GEMINI_API_KEY       = os.environ.get("GEMINI_API_KEY", "")
GEMINI_MODEL         = "gemini-1.5-flash"

BASE_DIR  = Path(__file__).parent.parent
DATA_DIR  = BASE_DIR / "data"
FRONT_DIR = BASE_DIR / "frontend"
DB_PATH   = DATA_DIR / "pharmapro.db"
DATA_DIR.mkdir(exist_ok=True)

app = FastAPI(title="PharmaPro", version="2.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"],
                   allow_methods=["*"], allow_headers=["*"])

security = HTTPBearer(auto_error=False)

# ── JWT (pure stdlib — no PyJWT needed) ───────────────────────────────────────
def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()

def _b64url_decode(s: str) -> bytes:
    pad = 4 - len(s) % 4
    return base64.urlsafe_b64decode(s + "=" * (pad % 4))

def create_token(payload: dict, expires_hours: int = 24) -> str:
    header  = _b64url(json.dumps({"alg":"HS256","typ":"JWT"}).encode())
    payload = dict(payload)
    payload["exp"] = (datetime.utcnow() + timedelta(hours=expires_hours)).isoformat()
    body    = _b64url(json.dumps(payload).encode())
    sig_input = f"{header}.{body}".encode()
    sig = _b64url(hmac.new(JWT_SECRET.encode(), sig_input, hashlib.sha256).digest())
    return f"{header}.{body}.{sig}"

def verify_token(token: str) -> Optional[dict]:
    try:
        header, body, sig = token.split(".")
        sig_input = f"{header}.{body}".encode()
        expected  = _b64url(hmac.new(JWT_SECRET.encode(), sig_input, hashlib.sha256).digest())
        if not hmac.compare_digest(sig, expected):
            return None
        payload = json.loads(_b64url_decode(body))
        if datetime.fromisoformat(payload["exp"]) < datetime.utcnow():
            return None
        return payload
    except Exception:
        return None

def hash_password(pw: str) -> str:
    return hashlib.sha256(pw.encode()).hexdigest()

# ── DB ─────────────────────────────────────────────────────────────────────────
@contextmanager
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    try:
        yield conn; conn.commit()
    except Exception:
        conn.rollback(); raise
    finally:
        conn.close()

def row_to_dict(row): return dict(row) if row else None
def rows_to_list(rows): return [dict(r) for r in rows]

# ── Schema ─────────────────────────────────────────────────────────────────────
SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT UNIQUE NOT NULL,
    name          TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role          TEXT DEFAULT 'owner',        -- 'superadmin' | 'owner'
    status        TEXT DEFAULT 'pending',      -- 'pending' | 'active' | 'suspended'
    shop_name     TEXT DEFAULT '',
    phone         TEXT DEFAULT '',
    access_expiry TEXT,                        -- NULL = no expiry, ISO date = expiry date
    created_at    TEXT DEFAULT (datetime('now')),
    last_login    TEXT,
    approved_at   TEXT,
    approved_by   TEXT,
    notes         TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS login_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER REFERENCES users(id),
    email      TEXT,
    ip         TEXT,
    success    INTEGER,
    reason     TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS shop_config (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    key     TEXT NOT NULL,
    value   TEXT,
    UNIQUE(user_id, key)
);

CREATE TABLE IF NOT EXISTS drugs (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id           INTEGER NOT NULL REFERENCES users(id),
    name              TEXT NOT NULL,
    brand             TEXT DEFAULT '',
    composition       TEXT DEFAULT '',
    category          TEXT DEFAULT '',
    schedule          TEXT DEFAULT 'OTC',
    hsn               TEXT DEFAULT '30049099',
    tablets_per_strip INTEGER DEFAULT 10,
    strips_per_box    INTEGER DEFAULT 10,
    mrp_per_strip     REAL DEFAULT 0,
    mrp_per_tablet    REAL DEFAULT 0,
    reorder_level     INTEGER DEFAULT 20,
    rack              TEXT DEFAULT '',
    shelf             TEXT DEFAULT '',
    zone              TEXT DEFAULT 'B',
    created_at        TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS batches (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id        INTEGER NOT NULL REFERENCES users(id),
    drug_id        INTEGER NOT NULL REFERENCES drugs(id),
    batch_no       TEXT NOT NULL,
    expiry         TEXT NOT NULL,
    full_strips    INTEGER DEFAULT 0,
    cost_per_strip REAL DEFAULT 0,
    received_on    TEXT DEFAULT (date('now')),
    UNIQUE(drug_id, batch_no)
);

CREATE TABLE IF NOT EXISTS trays (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id           INTEGER NOT NULL REFERENCES users(id),
    tray_id           TEXT NOT NULL,
    drug_id           INTEGER NOT NULL REFERENCES drugs(id),
    batch_id          INTEGER NOT NULL REFERENCES batches(id),
    tablets_remaining INTEGER DEFAULT 0,
    rack              TEXT DEFAULT '',
    shelf             TEXT DEFAULT '',
    opened_on         TEXT DEFAULT (date('now')),
    closed            INTEGER DEFAULT 0,
    UNIQUE(user_id, tray_id)
);

CREATE TABLE IF NOT EXISTS customers (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id        INTEGER NOT NULL REFERENCES users(id),
    name           TEXT NOT NULL,
    phone          TEXT DEFAULT '',
    dob            TEXT DEFAULT '',
    loyalty_points INTEGER DEFAULT 0,
    created_at     TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS suppliers (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    name    TEXT NOT NULL,
    contact TEXT DEFAULT '',
    phone   TEXT DEFAULT '',
    email   TEXT DEFAULT '',
    gstin   TEXT DEFAULT '',
    due     REAL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS bills (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL REFERENCES users(id),
    bill_no      TEXT NOT NULL,
    customer_id  INTEGER REFERENCES customers(id),
    patient_name TEXT DEFAULT '',
    doctor       TEXT DEFAULT '',
    rx_no        TEXT DEFAULT '',
    subtotal     REAL DEFAULT 0,
    discount_pct REAL DEFAULT 0,
    discount_amt REAL DEFAULT 0,
    gst_amt      REAL DEFAULT 0,
    total        REAL DEFAULT 0,
    payment_mode TEXT DEFAULT 'Cash',
    created_at   TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, bill_no)
);

CREATE TABLE IF NOT EXISTS bill_items (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    bill_id     INTEGER NOT NULL REFERENCES bills(id),
    drug_id     INTEGER NOT NULL REFERENCES drugs(id),
    batch_id    INTEGER REFERENCES batches(id),
    tray_id     INTEGER REFERENCES trays(id),
    tablets_qty INTEGER NOT NULL,
    mrp_per_tab REAL DEFAULT 0,
    amount      REAL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS racks (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id  INTEGER NOT NULL REFERENCES users(id),
    rack_id  TEXT NOT NULL,
    name     TEXT NOT NULL,
    shelves  INTEGER DEFAULT 6,
    color    TEXT DEFAULT '#00c896',
    label    TEXT DEFAULT '',
    position INTEGER DEFAULT 0,
    UNIQUE(user_id, rack_id)
);
"""

def init_db():
    with get_db() as conn:
        conn.executescript(SCHEMA)
        # Ensure super admin exists
        existing = conn.execute("SELECT id FROM users WHERE role='superadmin'").fetchone()
        if not existing:
            conn.execute("""INSERT OR IGNORE INTO users(email,name,password_hash,role,status)
                VALUES(?,?,?,?,?)""",
                (SUPER_ADMIN_EMAIL, "Super Admin",
                 hash_password(SUPER_ADMIN_PASSWORD), "superadmin", "active"))

init_db()

# ── Auth helpers ───────────────────────────────────────────────────────────────
def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    if not credentials:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    payload = verify_token(credentials.credentials)
    if not payload:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token invalid or expired")
    return payload

def require_admin(user=Depends(get_current_user)):
    if user.get("role") != "superadmin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin only")
    return user

def require_active(user=Depends(get_current_user)):
    """Allow active owners and superadmin"""
    if user.get("role") == "superadmin":
        return user
    if user.get("status") != "active":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Account not active")
    # Check expiry
    expiry = user.get("access_expiry")
    if expiry and date.fromisoformat(expiry) < date.today():
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Subscription expired")
    return user

# ── Pydantic models ────────────────────────────────────────────────────────────
class RegisterIn(BaseModel):
    name: str; email: str; password: str; shop_name: str; phone: str = ""

class LoginIn(BaseModel):
    email: str; password: str

class UserUpdateIn(BaseModel):
    name: str = ""; shop_name: str = ""; phone: str = ""; notes: str = ""
    status: str = ""; access_expiry: str = ""

class PasswordResetIn(BaseModel):
    user_id: int; new_password: str

class ShopConfigIn(BaseModel):
    name:str=""; owner:str=""; phone:str=""; email:str=""; address:str=""
    gstin:str=""; licence:str=""; state:str="KA"; gst_slab:str="12"
    strategy:str="alpha"; fefo:bool=True; top_up_tray:bool=True
    print_tray_label:bool=True; schedule_warning:bool=True
    require_batch_on_sale:bool=True; low_stock_reorder:bool=True
    broken_strip_alert:int=2; expiry_warn_months:int=3
    counter_rack:str="R1"; eye_level_shelf:str="S5"

class DrugIn(BaseModel):
    name:str; brand:str=""; composition:str=""; category:str=""
    schedule:str="OTC"; hsn:str="30049099"
    tablets_per_strip:int=10; strips_per_box:int=10
    mrp_per_strip:float=0; mrp_per_tablet:float=0
    reorder_level:int=20; rack:str=""; shelf:str=""; zone:str="B"

class BatchIn(BaseModel):
    drug_id:int; batch_no:str; expiry:str
    strips:int=1; cost_per_strip:float=0

class BillItemIn(BaseModel):
    drug_id:int; tablets_qty:int

class BillIn(BaseModel):
    customer_id:Optional[int]=None; patient_name:str=""; doctor:str=""
    rx_no:str=""; discount_pct:float=0; payment_mode:str="Cash"
    items:list[BillItemIn]

class CustomerIn(BaseModel):
    name:str; phone:str=""; dob:str=""

class SupplierIn(BaseModel):
    name:str; contact:str=""; phone:str=""; email:str=""; gstin:str=""

class RackIn(BaseModel):
    rack_id:str; name:str; shelves:int=6; color:str="#00c896"; label:str=""

class ScanIn(BaseModel):
    image_b64:str; mime:str="image/jpeg"; mode:str="strip"

# ── AUTH ROUTES ────────────────────────────────────────────────────────────────
@app.post("/api/auth/register")
def register(body: RegisterIn, request: Request):
    if not body.email or not body.password or not body.name or not body.shop_name:
        raise HTTPException(400, "All fields required")
    if len(body.password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")
    with get_db() as conn:
        existing = conn.execute("SELECT id FROM users WHERE email=?", (body.email.lower(),)).fetchone()
        if existing:
            raise HTTPException(400, "Email already registered")
        conn.execute("""INSERT INTO users(email,name,password_hash,role,status,shop_name,phone)
            VALUES(?,?,?,?,?,?,?)""",
            (body.email.lower(), body.name, hash_password(body.password),
             "owner", "pending", body.shop_name, body.phone))
    return {"ok": True, "message": "Registration submitted. Awaiting admin approval."}

@app.post("/api/auth/login")
def login(body: LoginIn, request: Request):
    ip = request.client.host if request.client else "unknown"
    with get_db() as conn:
        user = row_to_dict(conn.execute(
            "SELECT * FROM users WHERE email=?", (body.email.lower(),)).fetchone())

        def log_attempt(success, reason=""):
            conn.execute("INSERT INTO login_log(user_id,email,ip,success,reason) VALUES(?,?,?,?,?)",
                         (user["id"] if user else None, body.email, ip, int(success), reason))

        if not user:
            log_attempt(False, "user not found")
            raise HTTPException(401, "Invalid email or password")

        if user["password_hash"] != hash_password(body.password):
            log_attempt(False, "wrong password")
            raise HTTPException(401, "Invalid email or password")

        if user["role"] != "superadmin":
            if user["status"] == "pending":
                log_attempt(False, "pending approval")
                raise HTTPException(403, "Account pending admin approval")
            if user["status"] == "suspended":
                log_attempt(False, "suspended")
                raise HTTPException(403, "Account suspended. Contact admin.")
            expiry = user.get("access_expiry")
            if expiry and date.fromisoformat(expiry) < date.today():
                log_attempt(False, "subscription expired")
                raise HTTPException(403, "Subscription expired. Contact admin to renew.")

        conn.execute("UPDATE users SET last_login=? WHERE id=?",
                     (datetime.now().isoformat(), user["id"]))
        log_attempt(True)

        token = create_token({
            "user_id": user["id"], "email": user["email"],
            "name": user["name"], "role": user["role"],
            "status": user["status"], "shop_name": user.get("shop_name",""),
            "access_expiry": user.get("access_expiry"),
        }, expires_hours=12)

        return {
            "token": token,
            "user": {
                "id": user["id"], "email": user["email"],
                "name": user["name"], "role": user["role"],
                "shop_name": user.get("shop_name",""),
                "access_expiry": user.get("access_expiry"),
            }
        }

@app.get("/api/auth/me")
def get_me(user=Depends(require_active)):
    with get_db() as conn:
        u = row_to_dict(conn.execute(
            "SELECT id,email,name,role,status,shop_name,phone,access_expiry,last_login FROM users WHERE id=?",
            (user["user_id"],)).fetchone())
        # Check if setup done
        cfg = conn.execute("SELECT key FROM shop_config WHERE user_id=? AND key='setup_done'",
                           (user["user_id"],)).fetchone()
        u["setup_done"] = cfg is not None
        return u

# ── ADMIN ROUTES ───────────────────────────────────────────────────────────────
@app.get("/api/admin/users")
def admin_list_users(admin=Depends(require_admin)):
    with get_db() as conn:
        rows = conn.execute("""
            SELECT u.id,u.email,u.name,u.role,u.status,u.shop_name,u.phone,
                   u.access_expiry,u.created_at,u.last_login,u.approved_at,u.notes,
                   (SELECT COUNT(*) FROM bills b WHERE b.user_id=u.id) as total_bills,
                   (SELECT COUNT(*) FROM drugs d WHERE d.user_id=u.id) as total_drugs
            FROM users u WHERE u.role != 'superadmin'
            ORDER BY u.created_at DESC""").fetchall()
        return rows_to_list(rows)

@app.get("/api/admin/users/{user_id}")
def admin_get_user(user_id: int, admin=Depends(require_admin)):
    with get_db() as conn:
        u = row_to_dict(conn.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone())
        if not u: raise HTTPException(404, "User not found")
        logs = rows_to_list(conn.execute(
            "SELECT * FROM login_log WHERE user_id=? ORDER BY created_at DESC LIMIT 20",
            (user_id,)).fetchall())
        u["login_log"] = logs
        return u

@app.put("/api/admin/users/{user_id}/approve")
def admin_approve(user_id: int, admin=Depends(require_admin)):
    with get_db() as conn:
        conn.execute("""UPDATE users SET status='active', approved_at=?, approved_by=?
            WHERE id=?""", (datetime.now().isoformat(), admin["email"], user_id))
    return {"ok": True, "message": "User approved"}

@app.put("/api/admin/users/{user_id}/suspend")
def admin_suspend(user_id: int, admin=Depends(require_admin)):
    with get_db() as conn:
        conn.execute("UPDATE users SET status='suspended' WHERE id=?", (user_id,))
    return {"ok": True, "message": "User suspended"}

@app.put("/api/admin/users/{user_id}/reactivate")
def admin_reactivate(user_id: int, admin=Depends(require_admin)):
    with get_db() as conn:
        conn.execute("UPDATE users SET status='active' WHERE id=?", (user_id,))
    return {"ok": True, "message": "User reactivated"}

@app.put("/api/admin/users/{user_id}")
def admin_update_user(user_id: int, body: UserUpdateIn, admin=Depends(require_admin)):
    with get_db() as conn:
        fields, vals = [], []
        if body.name:          fields.append("name=?");          vals.append(body.name)
        if body.shop_name:     fields.append("shop_name=?");     vals.append(body.shop_name)
        if body.phone:         fields.append("phone=?");         vals.append(body.phone)
        if body.notes != "":   fields.append("notes=?");         vals.append(body.notes)
        if body.status:        fields.append("status=?");        vals.append(body.status)
        if body.access_expiry: fields.append("access_expiry=?"); vals.append(body.access_expiry)
        if not fields: return {"ok": True}
        vals.append(user_id)
        conn.execute(f"UPDATE users SET {','.join(fields)} WHERE id=?", vals)
    return {"ok": True}

@app.post("/api/admin/reset-password")
def admin_reset_password(body: PasswordResetIn, admin=Depends(require_admin)):
    if len(body.new_password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")
    with get_db() as conn:
        conn.execute("UPDATE users SET password_hash=? WHERE id=?",
                     (hash_password(body.new_password), body.user_id))
    return {"ok": True}

@app.get("/api/admin/stats")
def admin_stats(admin=Depends(require_admin)):
    with get_db() as conn:
        total   = conn.execute("SELECT COUNT(*) FROM users WHERE role!='superadmin'").fetchone()[0]
        active  = conn.execute("SELECT COUNT(*) FROM users WHERE status='active'").fetchone()[0]
        pending = conn.execute("SELECT COUNT(*) FROM users WHERE status='pending'").fetchone()[0]
        susp    = conn.execute("SELECT COUNT(*) FROM users WHERE status='suspended'").fetchone()[0]
        expiring = conn.execute("""SELECT COUNT(*) FROM users WHERE status='active'
            AND access_expiry IS NOT NULL
            AND access_expiry <= date('now','+30 days')
            AND access_expiry >= date('now')""").fetchone()[0]
        expired = conn.execute("""SELECT COUNT(*) FROM users WHERE status='active'
            AND access_expiry IS NOT NULL AND access_expiry < date('now')""").fetchone()[0]
        recent_logins = rows_to_list(conn.execute("""
            SELECT l.*, u.name, u.shop_name FROM login_log l
            LEFT JOIN users u ON u.id=l.user_id
            WHERE l.success=1 ORDER BY l.created_at DESC LIMIT 10""").fetchall())
        return {
            "total":total,"active":active,"pending":pending,
            "suspended":susp,"expiring":expiring,"expired":expired,
            "recent_logins":recent_logins
        }

@app.get("/api/admin/login-log")
def admin_login_log(admin=Depends(require_admin)):
    with get_db() as conn:
        rows = conn.execute("""
            SELECT l.*, u.name, u.shop_name FROM login_log l
            LEFT JOIN users u ON u.id=l.user_id
            ORDER BY l.created_at DESC LIMIT 100""").fetchall()
        return rows_to_list(rows)

# ── SHOP CONFIG (per user) ─────────────────────────────────────────────────────
@app.get("/api/config")
def get_config(user=Depends(require_active)):
    uid = user["user_id"]
    with get_db() as conn:
        rows = conn.execute("SELECT key,value FROM shop_config WHERE user_id=?", (uid,)).fetchall()
        cfg = {r["key"]: r["value"] for r in rows}
        cfg["setup_done"] = "setup_done" in cfg
        cfg["name"] = cfg.get("name", user.get("shop_name",""))
        return cfg

@app.post("/api/config")
def save_config(cfg: ShopConfigIn, user=Depends(require_active)):
    uid = user["user_id"]
    with get_db() as conn:
        for k,v in cfg.dict().items():
            conn.execute("INSERT OR REPLACE INTO shop_config(user_id,key,value) VALUES(?,?,?)",
                         (uid, k, str(v)))
        conn.execute("INSERT OR REPLACE INTO shop_config(user_id,key,value) VALUES(?,?,?)",
                     (uid, "setup_done", "1"))
    return {"ok": True}

# ── RACKS ──────────────────────────────────────────────────────────────────────
@app.get("/api/racks")
def get_racks(user=Depends(require_active)):
    uid = user["user_id"]
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM racks WHERE user_id=? ORDER BY position", (uid,)).fetchall()
        if not rows:
            # Return defaults
            return [{"rack_id":f"R{i+1}","name":f"R{i+1}","shelves":6,
                     "color":c,"label":"","position":i}
                    for i,c in enumerate(["#00c896","#3b82f6","#a855f7","#f59e0b","#ef4444","#10b981"])]
        return rows_to_list(rows)

@app.post("/api/racks")
def save_racks(racks: list[RackIn], user=Depends(require_active)):
    uid = user["user_id"]
    with get_db() as conn:
        conn.execute("DELETE FROM racks WHERE user_id=?", (uid,))
        for i,r in enumerate(racks):
            conn.execute("""INSERT INTO racks(user_id,rack_id,name,shelves,color,label,position)
                VALUES(?,?,?,?,?,?,?)""", (uid,r.rack_id,r.name,r.shelves,r.color,r.label,i))
    return {"ok": True}

# ── DRUGS ──────────────────────────────────────────────────────────────────────
@app.get("/api/drugs")
def get_drugs(q: str="", user=Depends(require_active)):
    uid = user["user_id"]
    with get_db() as conn:
        base = """SELECT d.*,
            COALESCE(SUM(b.full_strips * d.tablets_per_strip),0) +
            COALESCE((SELECT SUM(t.tablets_remaining) FROM trays t
                      WHERE t.drug_id=d.id AND t.user_id=? AND t.closed=0),0) AS stock_tablets
            FROM drugs d LEFT JOIN batches b ON b.drug_id=d.id AND b.user_id=?
            WHERE d.user_id=?"""
        if q:
            like = f"%{q}%"
            rows = conn.execute(base+" AND (d.name LIKE ? OR d.brand LIKE ? OR d.composition LIKE ?) GROUP BY d.id ORDER BY d.name LIMIT 20",
                                (uid,uid,uid,like,like,like)).fetchall()
        else:
            rows = conn.execute(base+" GROUP BY d.id ORDER BY d.name", (uid,uid,uid)).fetchall()
        return rows_to_list(rows)

@app.get("/api/drugs/{drug_id}")
def get_drug(drug_id: int, user=Depends(require_active)):
    uid = user["user_id"]
    with get_db() as conn:
        drug = row_to_dict(conn.execute("SELECT * FROM drugs WHERE id=? AND user_id=?", (drug_id,uid)).fetchone())
        if not drug: raise HTTPException(404)
        drug["batches"] = rows_to_list(conn.execute(
            "SELECT * FROM batches WHERE drug_id=? AND user_id=? ORDER BY expiry", (drug_id,uid)).fetchall())
        drug["trays"] = rows_to_list(conn.execute(
            """SELECT t.*,b.batch_no,b.expiry FROM trays t JOIN batches b ON b.id=t.batch_id
               WHERE t.drug_id=? AND t.user_id=? AND t.closed=0 ORDER BY b.expiry""",
            (drug_id,uid)).fetchall())
        return drug

@app.post("/api/drugs")
def add_drug(drug: DrugIn, user=Depends(require_active)):
    uid = user["user_id"]
    with get_db() as conn:
        cur = conn.execute("""INSERT INTO drugs(user_id,name,brand,composition,category,schedule,hsn,
            tablets_per_strip,strips_per_box,mrp_per_strip,mrp_per_tablet,reorder_level,rack,shelf,zone)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (uid,drug.name,drug.brand,drug.composition,drug.category,drug.schedule,drug.hsn,
             drug.tablets_per_strip,drug.strips_per_box,drug.mrp_per_strip,drug.mrp_per_tablet,
             drug.reorder_level,drug.rack,drug.shelf,drug.zone))
        return {"id": cur.lastrowid}

# ── BATCHES ────────────────────────────────────────────────────────────────────
@app.post("/api/batches")
def add_batch(b: BatchIn, user=Depends(require_active)):
    uid = user["user_id"]
    with get_db() as conn:
        try:
            cur = conn.execute("""INSERT INTO batches(user_id,drug_id,batch_no,expiry,full_strips,cost_per_strip)
                VALUES(?,?,?,?,?,?)""", (uid,b.drug_id,b.batch_no,b.expiry,b.strips,b.cost_per_strip))
            batch_id = cur.lastrowid
        except sqlite3.IntegrityError:
            conn.execute("UPDATE batches SET full_strips=full_strips+? WHERE drug_id=? AND batch_no=? AND user_id=?",
                         (b.strips,b.drug_id,b.batch_no,uid))
            batch_id = conn.execute("SELECT id FROM batches WHERE drug_id=? AND batch_no=? AND user_id=?",
                                    (b.drug_id,b.batch_no,uid)).fetchone()["id"]
        return {"batch_id": batch_id}

@app.get("/api/drugs/{drug_id}/fefo")
def get_fefo(drug_id: int, user=Depends(require_active)):
    uid = user["user_id"]
    with get_db() as conn:
        tray = row_to_dict(conn.execute("""
            SELECT t.*,b.batch_no,b.expiry,d.tablets_per_strip FROM trays t
            JOIN batches b ON b.id=t.batch_id JOIN drugs d ON d.id=t.drug_id
            WHERE t.drug_id=? AND t.user_id=? AND t.closed=0 ORDER BY b.expiry LIMIT 1""",
            (drug_id,uid)).fetchone())
        if tray: return {"type":"tray","source":tray}
        batch = row_to_dict(conn.execute("""
            SELECT b.*,d.tablets_per_strip FROM batches b JOIN drugs d ON d.id=b.drug_id
            WHERE b.drug_id=? AND b.user_id=? AND b.full_strips>0 ORDER BY b.expiry LIMIT 1""",
            (drug_id,uid)).fetchone())
        if batch: return {"type":"batch","source":batch}
        return {"type":"none","source":None}

# ── TRAYS ──────────────────────────────────────────────────────────────────────
@app.get("/api/trays")
def get_trays(open_only: bool=True, user=Depends(require_active)):
    uid = user["user_id"]
    with get_db() as conn:
        q = "AND t.closed=0" if open_only else ""
        rows = conn.execute(f"""
            SELECT t.*,d.name as drug_name,d.brand,d.tablets_per_strip,b.batch_no,b.expiry
            FROM trays t JOIN drugs d ON d.id=t.drug_id JOIN batches b ON b.id=t.batch_id
            WHERE t.user_id=? {q} ORDER BY b.expiry""", (uid,)).fetchall()
        return rows_to_list(rows)

# ── BILLING ────────────────────────────────────────────────────────────────────
@app.post("/api/bills")
def create_bill(bill: BillIn, user=Depends(require_active)):
    uid = user["user_id"]
    with get_db() as conn:
        today_str = date.today().strftime("%Y%m%d")
        n = conn.execute("SELECT COUNT(*) FROM bills WHERE user_id=? AND bill_no LIKE ?",
                         (uid, f"B{today_str}%")).fetchone()[0]
        bill_no = f"B{today_str}{n+1:04d}"

        subtotal = sum(i.tablets_qty * conn.execute(
            "SELECT mrp_per_tablet FROM drugs WHERE id=? AND user_id=?", (i.drug_id,uid)
        ).fetchone()[0] for i in bill.items)
        disc_amt = round(subtotal * bill.discount_pct / 100, 2)
        gst_slab = float(conn.execute("SELECT value FROM shop_config WHERE user_id=? AND key='gst_slab'",
                                       (uid,)).fetchone()["value"] or 12)
        gst_amt  = round((subtotal - disc_amt) * gst_slab / 100, 2)
        total    = round(subtotal - disc_amt + gst_amt, 2)

        cur = conn.execute("""INSERT INTO bills(user_id,bill_no,customer_id,patient_name,doctor,rx_no,
            subtotal,discount_pct,discount_amt,gst_amt,total,payment_mode)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?)""",
            (uid,bill_no,bill.customer_id,bill.patient_name,bill.doctor,bill.rx_no,
             subtotal,bill.discount_pct,disc_amt,gst_amt,total,bill.payment_mode))
        bill_id = cur.lastrowid

        for item in bill.items:
            drug = row_to_dict(conn.execute("SELECT * FROM drugs WHERE id=? AND user_id=?",
                                             (item.drug_id,uid)).fetchone())
            mrp, tps = drug["mrp_per_tablet"], drug["tablets_per_strip"]
            conn.execute("""INSERT INTO bill_items(bill_id,drug_id,tablets_qty,mrp_per_tab,amount)
                VALUES(?,?,?,?,?)""", (bill_id,item.drug_id,item.tablets_qty,mrp,round(mrp*item.tablets_qty,2)))

            remaining = item.tablets_qty
            trays = rows_to_list(conn.execute("""
                SELECT t.*,b.expiry FROM trays t JOIN batches b ON b.id=t.batch_id
                WHERE t.drug_id=? AND t.user_id=? AND t.closed=0 ORDER BY b.expiry""",
                (item.drug_id,uid)).fetchall())
            for tray in trays:
                if remaining <= 0: break
                use = min(remaining, tray["tablets_remaining"])
                new_qty = tray["tablets_remaining"] - use
                if new_qty == 0:
                    conn.execute("UPDATE trays SET tablets_remaining=0,closed=1 WHERE id=? AND user_id=?",
                                 (tray["id"],uid))
                else:
                    conn.execute("UPDATE trays SET tablets_remaining=? WHERE id=? AND user_id=?",
                                 (new_qty,tray["id"],uid))
                remaining -= use

            if remaining > 0:
                batches = rows_to_list(conn.execute("""
                    SELECT * FROM batches WHERE drug_id=? AND user_id=? AND full_strips>0
                    ORDER BY expiry""", (item.drug_id,uid)).fetchall())
                for batch in batches:
                    if remaining <= 0: break
                    strips_use = min((remaining + tps - 1) // tps, batch["full_strips"])
                    tablets_from = strips_use * tps
                    leftover = tablets_from - remaining
                    conn.execute("UPDATE batches SET full_strips=full_strips-? WHERE id=? AND user_id=?",
                                 (strips_use,batch["id"],uid))
                    if leftover > 0:
                        tcount = conn.execute("SELECT COUNT(*) FROM trays WHERE user_id=?", (uid,)).fetchone()[0]
                        tray_id = f"T-{tcount+1:03d}"
                        conn.execute("""INSERT INTO trays(user_id,tray_id,drug_id,batch_id,tablets_remaining,rack,shelf)
                            VALUES(?,?,?,?,?,?,?)""",
                            (uid,tray_id,item.drug_id,batch["id"],leftover,drug["rack"],drug["shelf"]+"T"))
                    remaining = 0

        if bill.customer_id:
            conn.execute("UPDATE customers SET loyalty_points=loyalty_points+? WHERE id=? AND user_id=?",
                         (int(total//100), bill.customer_id, uid))

        return {"bill_no": bill_no, "bill_id": bill_id, "total": total}

@app.get("/api/bills")
def get_bills(limit: int=50, user=Depends(require_active)):
    uid = user["user_id"]
    with get_db() as conn:
        rows = conn.execute("""SELECT b.*,c.name as customer_name FROM bills b
            LEFT JOIN customers c ON c.id=b.customer_id
            WHERE b.user_id=? ORDER BY b.created_at DESC LIMIT ?""", (uid,limit)).fetchall()
        return rows_to_list(rows)

# ── CUSTOMERS ──────────────────────────────────────────────────────────────────
@app.get("/api/customers")
def get_customers(q: str="", user=Depends(require_active)):
    uid = user["user_id"]
    with get_db() as conn:
        if q:
            like = f"%{q}%"
            rows = conn.execute("SELECT * FROM customers WHERE user_id=? AND (name LIKE ? OR phone LIKE ?) LIMIT 10",
                                (uid,like,like)).fetchall()
        else:
            rows = conn.execute("SELECT * FROM customers WHERE user_id=? ORDER BY name", (uid,)).fetchall()
        return rows_to_list(rows)

@app.post("/api/customers")
def add_customer(c: CustomerIn, user=Depends(require_active)):
    uid = user["user_id"]
    with get_db() as conn:
        cur = conn.execute("INSERT INTO customers(user_id,name,phone,dob) VALUES(?,?,?,?)",
                           (uid,c.name,c.phone,c.dob))
        return {"id": cur.lastrowid}

# ── SUPPLIERS ──────────────────────────────────────────────────────────────────
@app.get("/api/suppliers")
def get_suppliers(user=Depends(require_active)):
    uid = user["user_id"]
    with get_db() as conn:
        return rows_to_list(conn.execute("SELECT * FROM suppliers WHERE user_id=? ORDER BY name", (uid,)).fetchall())

@app.post("/api/suppliers")
def add_supplier(s: SupplierIn, user=Depends(require_active)):
    uid = user["user_id"]
    with get_db() as conn:
        cur = conn.execute("INSERT INTO suppliers(user_id,name,contact,phone,email,gstin) VALUES(?,?,?,?,?,?)",
                           (uid,s.name,s.contact,s.phone,s.email,s.gstin))
        return {"id": cur.lastrowid}

# ── DASHBOARD ──────────────────────────────────────────────────────────────────
@app.get("/api/dashboard")
def get_dashboard(user=Depends(require_active)):
    uid = user["user_id"]
    with get_db() as conn:
        today_str = date.today().isoformat()
        warn_mo = date.today().replace(day=1)
        warn_date = (warn_mo.replace(month=warn_mo.month+3) if warn_mo.month<=9
                     else warn_mo.replace(year=warn_mo.year+1, month=(warn_mo.month+3)%12 or 12)).isoformat()[:7]

        today_rev  = conn.execute("SELECT COALESCE(SUM(total),0) FROM bills WHERE user_id=? AND date(created_at)=?",
                                   (uid,today_str)).fetchone()[0]
        today_bills = conn.execute("SELECT COUNT(*) FROM bills WHERE user_id=? AND date(created_at)=?",
                                    (uid,today_str)).fetchone()[0]
        expiring   = conn.execute("SELECT COUNT(*) FROM batches WHERE user_id=? AND expiry<=? AND expiry>=? AND full_strips>0",
                                   (uid,warn_date,today_str)).fetchone()[0]
        expired    = conn.execute("SELECT COUNT(*) FROM batches WHERE user_id=? AND expiry<? AND full_strips>0",
                                   (uid,today_str)).fetchone()[0]
        low_stock  = conn.execute("""SELECT COUNT(*) FROM drugs d WHERE d.user_id=? AND
            (SELECT COALESCE(SUM(b.full_strips*d.tablets_per_strip),0) FROM batches b WHERE b.drug_id=d.id AND b.user_id=?) +
            COALESCE((SELECT SUM(t.tablets_remaining) FROM trays t WHERE t.drug_id=d.id AND t.user_id=? AND t.closed=0),0)
            < d.reorder_level""", (uid,uid,uid)).fetchone()[0]
        week_rev   = rows_to_list(conn.execute("""
            SELECT date(created_at) as day, SUM(total) as revenue, COUNT(*) as bills
            FROM bills WHERE user_id=? AND created_at >= date('now','-7 days')
            GROUP BY date(created_at) ORDER BY day""", (uid,)).fetchall())
        return {"today_revenue":today_rev,"today_bills":today_bills,"expiring":expiring,
                "expired":expired,"low_stock":low_stock,"week_revenue":week_rev,
                "total_drugs":conn.execute("SELECT COUNT(*) FROM drugs WHERE user_id=?",(uid,)).fetchone()[0],
                "customers":conn.execute("SELECT COUNT(*) FROM customers WHERE user_id=?",(uid,)).fetchone()[0]}

# ── INVENTORY ──────────────────────────────────────────────────────────────────
@app.get("/api/inventory")
def get_inventory(user=Depends(require_active)):
    uid = user["user_id"]
    with get_db() as conn:
        rows = conn.execute("""
            SELECT d.*,
              COALESCE(SUM(b.full_strips),0) as full_strips,
              COALESCE(SUM(b.full_strips * d.tablets_per_strip),0) +
              COALESCE((SELECT SUM(t.tablets_remaining) FROM trays t WHERE t.drug_id=d.id AND t.user_id=? AND t.closed=0),0) AS stock_tablets,
              (SELECT MIN(b2.expiry) FROM batches b2 WHERE b2.drug_id=d.id AND b2.user_id=? AND b2.full_strips>0) as nearest_expiry,
              (SELECT COUNT(*) FROM trays t2 WHERE t2.drug_id=d.id AND t2.user_id=? AND t2.closed=0) as open_trays
            FROM drugs d LEFT JOIN batches b ON b.drug_id=d.id AND b.user_id=?
            WHERE d.user_id=? GROUP BY d.id ORDER BY d.name""",
            (uid,uid,uid,uid,uid)).fetchall()
        return rows_to_list(rows)

# ── REPORTS ────────────────────────────────────────────────────────────────────
@app.get("/api/reports/gstr1")
def gstr1(month: str, user=Depends(require_active)):
    uid = user["user_id"]
    with get_db() as conn:
        rows = conn.execute("""SELECT b.bill_no,b.created_at,b.total,b.gst_amt,
            b.total-b.gst_amt as taxable,c.name as customer
            FROM bills b LEFT JOIN customers c ON c.id=b.customer_id
            WHERE b.user_id=? AND strftime('%Y-%m',b.created_at)=? ORDER BY b.created_at""",
            (uid,month)).fetchall()
        return rows_to_list(rows)

@app.get("/api/reports/expiry")
def expiry_report(user=Depends(require_active)):
    uid = user["user_id"]
    with get_db() as conn:
        rows = conn.execute("""SELECT d.name,d.brand,b.batch_no,b.expiry,b.full_strips,
            d.tablets_per_strip,d.rack,d.shelf
            FROM batches b JOIN drugs d ON d.id=b.drug_id
            WHERE b.user_id=? AND b.full_strips>0 ORDER BY b.expiry""", (uid,)).fetchall()
        return rows_to_list(rows)

# ── PUT-AWAY ───────────────────────────────────────────────────────────────────
@app.post("/api/putaway/guide")
def putaway_guide(items: list[dict], user=Depends(require_active)):
    uid = user["user_id"]
    with get_db() as conn:
        result = []
        for item in items:
            drug_id = item.get("drug_id")
            if not drug_id: continue
            drug = row_to_dict(conn.execute("SELECT * FROM drugs WHERE id=? AND user_id=?",
                                             (drug_id,uid)).fetchone())
            if not drug: continue
            open_trays = rows_to_list(conn.execute("""
                SELECT t.*,b.expiry FROM trays t JOIN batches b ON b.id=t.batch_id
                WHERE t.drug_id=? AND t.user_id=? AND t.closed=0 ORDER BY t.tablets_remaining""",
                (drug_id,uid)).fetchall())
            result.append({"drug":drug,"incoming_strips":item.get("strips",1),
                           "batch_no":item.get("batch_no",""),"expiry":item.get("expiry",""),
                           "open_trays":open_trays,"suggested_rack":drug["rack"],"suggested_shelf":drug["shelf"]})
        return result

# ── GEMINI SCAN ────────────────────────────────────────────────────────────────
def call_gemini(prompt, image_b64, mime="image/jpeg"):
    if not GEMINI_API_KEY: raise ValueError("no_key")
    url = (f"https://generativelanguage.googleapis.com/v1beta/models/"
           f"{GEMINI_MODEL}:generateContent?key={GEMINI_API_KEY}")
    payload = json.dumps({"contents":[{"parts":[
        {"text":prompt},{"inline_data":{"mime_type":mime,"data":image_b64}}
    ]}],"generationConfig":{"temperature":0.1,"maxOutputTokens":512}}).encode()
    req = urllib.request.Request(url,data=payload,
          headers={"Content-Type":"application/json"},method="POST")
    with urllib.request.urlopen(req,timeout=20) as r:
        resp = json.loads(r.read())
    return resp["candidates"][0]["content"]["parts"][0]["text"]

@app.post("/api/scan")
def scan_image(body: ScanIn, user=Depends(require_active)):
    if not GEMINI_API_KEY:
        return {"ok":False,"error":"no_key"}
    prompt = ("Extract from this medicine strip: drug_name, batch_no, expiry (YYYY-MM), mrp.\n"
              'JSON only: {"drug_name":"","batch_no":"","expiry":"","mrp":0}') if body.mode=="strip" else \
             ("Extract all medicine line items from this invoice: drug_name, batch_no, expiry (YYYY-MM), strips, mrp.\n"
              'JSON array only: [{"drug_name":"","batch_no":"","expiry":"","strips":1,"mrp":0}]')
    try:
        raw = call_gemini(prompt, body.image_b64, body.mime)
        raw = raw.strip().lstrip("```json").lstrip("```").rstrip("```").strip()
        data = json.loads(raw)
        if body.mode=="challan" and isinstance(data,dict): data=[data]
        return {"ok":True,"mode":body.mode,"result":data}
    except Exception as e:
        return {"ok":False,"error":str(e)}

# ── SERVE FRONTEND ─────────────────────────────────────────────────────────────
@app.get("/")
def serve_index():
    return FileResponse(FRONT_DIR / "index.html")

@app.get("/{path:path}")
def serve_static(path: str):
    f = FRONT_DIR / path
    if f.exists(): return FileResponse(f)
    return FileResponse(FRONT_DIR / "index.html")

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8503))
    print(f"\n{'='*50}\n  PharmaPro v2 — Auth Enabled\n  http://localhost:{port}\n{'='*50}\n")
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="warning")
