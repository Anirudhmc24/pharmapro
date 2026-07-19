"""
PharmaPro — routers/auth.py
Login, session management, staff CRUD
"""

import secrets
from fastapi import APIRouter, HTTPException, Header
from typing import Optional

from backend.database import get_db, rows_to_list, row_to_dict
from backend.models import LoginIn, UserIn

router = APIRouter(prefix="/api/auth", tags=["auth"])

# In-memory session store: token -> user dict
_sessions: dict[str, dict] = {}


def _hash_password(pwd: str) -> str:
    try:
        from passlib.context import CryptContext
        ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
        return ctx.hash(pwd)
    except Exception:
        import hashlib
        return "sha256:" + hashlib.sha256(pwd.encode()).hexdigest()


def _verify_password(plain: str, hashed: str) -> bool:
    try:
        if hashed.startswith("sha256:"):
            import hashlib
            return hashed == "sha256:" + hashlib.sha256(plain.encode()).hexdigest()
        from passlib.context import CryptContext
        ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
        return ctx.verify(plain, hashed)
    except Exception:
        return False


def get_current_user(x_token: Optional[str] = Header(default=None)):
    if not x_token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    if x_token in _sessions:
        return _sessions[x_token]
    with get_db() as conn:
        row = conn.execute("""
            SELECT u.id, u.username, u.display_name, u.role
            FROM sessions s
            JOIN users u ON s.user_id = u.id
            WHERE s.token = ? AND u.active = 1
        """, (x_token,)).fetchone()
        if not row:
            raise HTTPException(status_code=401, detail="Not authenticated")
        user_dict = {
            "id": row["id"],
            "username": row["username"],
            "display_name": row["display_name"],
            "role": row["role"],
            "token": x_token,
        }
        _sessions[x_token] = user_dict
        return user_dict






def require_admin(x_token: Optional[str] = Header(default=None)):
    user = get_current_user(x_token)
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    return user


@router.post("/login")
def login(body: LoginIn):
    with get_db() as conn:
        user = row_to_dict(conn.execute(
            "SELECT * FROM users WHERE username=? AND active=1", (body.username,)
        ).fetchone())
    if not user or not _verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = secrets.token_hex(32)
    _sessions[token] = {
        "id": user["id"],
        "username": user["username"],
        "display_name": user["display_name"],
        "role": user["role"],
        "token": token,
    }
    with get_db() as conn:
        conn.execute("INSERT OR REPLACE INTO sessions(token, user_id) VALUES(?,?)", (token, user["id"]))
    return {"token": token, "user": {k: _sessions[token][k] for k in ("id","username","display_name","role")}}


@router.post("/logout")
def logout(x_token: Optional[str] = Header(default=None)):
    if x_token:
        if x_token in _sessions:
            del _sessions[x_token]
        with get_db() as conn:
            conn.execute("DELETE FROM sessions WHERE token = ?", (x_token,))
    return {"ok": True}


@router.get("/me")
def me(x_token: Optional[str] = Header(default=None)):
    return get_current_user(x_token)


# ── Staff management (admin only) ──────────────────────────────────────────────
users_router = APIRouter(prefix="/api/users", tags=["users"])


@users_router.get("")
def list_users(x_token: Optional[str] = Header(default=None)):
    get_current_user(x_token)
    with get_db() as conn:
        rows = conn.execute(
            "SELECT id,username,display_name,role,active,created_at FROM users ORDER BY display_name"
        ).fetchall()
        return rows_to_list(rows)


@users_router.post("")
def create_user(body: UserIn, x_token: Optional[str] = Header(default=None)):
    require_admin(x_token)
    hashed = _hash_password(body.password)
    with get_db() as conn:
        try:
            cur = conn.execute(
                "INSERT INTO users(username,display_name,password_hash,role) VALUES(?,?,?,?)",
                (body.username, body.display_name, hashed, body.role)
            )
            return {"id": cur.lastrowid}
        except Exception:
            raise HTTPException(400, "Username already exists")


@users_router.put("/{user_id}/toggle")
def toggle_user(user_id: int, x_token: Optional[str] = Header(default=None)):
    require_admin(x_token)
    with get_db() as conn:
        conn.execute("UPDATE users SET active = 1 - active WHERE id=?", (user_id,))
    return {"ok": True}


@users_router.put("/{user_id}/password")
def change_password(user_id: int, body: dict, x_token: Optional[str] = Header(default=None)):
    require_admin(x_token)
    new_pwd = body.get("password", "")
    if len(new_pwd) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")
    hashed = _hash_password(new_pwd)
    with get_db() as conn:
        conn.execute("UPDATE users SET password_hash=? WHERE id=?", (hashed, user_id))
    return {"ok": True}
