"""
PharmaPro — routers/trays.py
Broken-strip tray tracker
"""

from fastapi import APIRouter, Header
from typing import Optional

from backend.database import get_db, rows_to_list
from backend.models import TrayIn
from backend.routers.auth import get_current_user

router = APIRouter(prefix="/api/trays", tags=["trays"])


def next_tray_id(conn) -> str:
    n = conn.execute("SELECT COUNT(*) FROM trays").fetchone()[0]
    return f"T-{n+1:03d}"


@router.get("")
def get_trays(open_only: bool = True):
    with get_db() as conn:
        q = "WHERE t.closed=0" if open_only else ""
        rows = conn.execute(f"""
            SELECT t.*, d.name as drug_name, d.brand, d.tablets_per_strip,
                   b.batch_no, b.expiry
            FROM trays t JOIN drugs d ON d.id=t.drug_id JOIN batches b ON b.id=t.batch_id
            {q} ORDER BY b.expiry ASC""").fetchall()
        return rows_to_list(rows)


@router.post("")
def create_tray(t: TrayIn, x_token: Optional[str] = Header(default=None)):
    get_current_user(x_token)
    with get_db() as conn:
        tray_id = next_tray_id(conn)
        conn.execute("""
            INSERT INTO trays(tray_id,drug_id,batch_id,tablets_remaining,box_id)
            VALUES(?,?,?,?,?)""",
            (tray_id, t.drug_id, t.batch_id, t.tablets_remaining, t.box_id))
        return {"tray_id": tray_id}
