"""
PharmaPro — routers/backorders.py
Customer backorder / wishlist + SMS notification via Fast2SMS
"""

from fastapi import APIRouter, Header
from typing import Optional
import urllib.request, urllib.parse, json

from backend.database import get_db, rows_to_list, row_to_dict
from backend.models import BackorderIn
from backend.routers.auth import get_current_user

router = APIRouter(prefix="/api/backorders", tags=["backorders"])


# ── Notification helper ────────────────────────────────────────────────────────

def _get_sms_key(conn) -> str:
    row = conn.execute("SELECT value FROM shop_config WHERE key='fast2sms_key'").fetchone()
    return row["value"] if row else ""


def notify_customer(phone: str, drug_name: str, conn) -> str:
    """
    Send SMS via Fast2SMS (India). Returns 'sms_sent', 'no_key', or 'failed'.
    Falls back gracefully — never crashes the PO receive flow.
    """
    api_key = _get_sms_key(conn)
    if not api_key:
        return "no_key"
    try:
        msg = f"Hi! Your requested medicine '{drug_name}' is now available at our pharmacy. Please visit us soon."
        url = "https://www.fast2sms.com/dev/bulkV2"
        payload = {
            "route": "q",
            "message": msg,
            "language": "english",
            "flash": 0,
            "numbers": phone,
        }
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode(),
            headers={"authorization": api_key, "Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=8) as resp:
            result = json.loads(resp.read())
            return "sms_sent" if result.get("return") else "failed"
    except Exception:
        return "failed"


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post("")
def create_backorder(body: BackorderIn, x_token: Optional[str] = Header(default=None)):
    get_current_user(x_token)
    with get_db() as conn:
        conn.execute("""
            INSERT INTO backorders(drug_id, customer_name, phone, qty_strips, notes)
            VALUES(?,?,?,?,?)""",
            (body.drug_id, body.customer_name, body.phone, body.qty_strips, body.notes))
    return {"ok": True}


@router.get("")
def list_backorders(status: str = "", drug_id: int = 0):
    with get_db() as conn:
        q = """
            SELECT bo.*, d.name as drug_name, d.brand
            FROM backorders bo JOIN drugs d ON d.id=bo.drug_id
            WHERE 1=1
        """
        from typing import Any
        params: list[Any] = []
        if status:
            q += " AND bo.status=?"; params.append(status)
        if drug_id:
            q += " AND bo.drug_id=?"; params.append(drug_id)
        q += " ORDER BY bo.created_at DESC"
        return rows_to_list(conn.execute(q, params).fetchall())


@router.put("/{bo_id}/notify")
def manual_notify(bo_id: int, x_token: Optional[str] = Header(default=None)):
    get_current_user(x_token)
    with get_db() as conn:
        bo = row_to_dict(conn.execute("SELECT * FROM backorders WHERE id=?", (bo_id,)).fetchone())
        if not bo:
            return {"ok": False, "error": "Not found"}
        drug = row_to_dict(conn.execute("SELECT name FROM drugs WHERE id=?", (bo["drug_id"],)).fetchone())
        result = notify_customer(bo["phone"], drug["name"] if drug else "medicine", conn)
        conn.execute("""
            UPDATE backorders SET status='notified', notified_at=datetime('now') WHERE id=?
        """, (bo_id,))
    return {"ok": True, "sms_result": result}


@router.put("/{bo_id}/cancel")
def cancel_backorder(bo_id: int, x_token: Optional[str] = Header(default=None)):
    get_current_user(x_token)
    with get_db() as conn:
        conn.execute("UPDATE backorders SET status='cancelled' WHERE id=?", (bo_id,))
    return {"ok": True}


def notify_backorders_for_drug(drug_id: int, conn):
    """
    Called automatically when stock is received for a drug.
    Finds all pending backorders for that drug and fires SMS + marks as notified.
    Returns count of customers notified.
    """
    pending = rows_to_list(conn.execute("""
        SELECT bo.*, d.name as drug_name FROM backorders bo
        JOIN drugs d ON d.id=bo.drug_id
        WHERE bo.drug_id=? AND bo.status='pending'
    """, (drug_id,)).fetchall())

    notified = 0
    for bo in pending:
        notify_customer(bo["phone"], bo["drug_name"], conn)
        conn.execute("""
            UPDATE backorders SET status='notified', notified_at=datetime('now') WHERE id=?
        """, (bo["id"],))
        notified += 1
    return notified
