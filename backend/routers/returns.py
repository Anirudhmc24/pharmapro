"""
PharmaPro — routers/returns.py
Bill returns & refunds with stock reversal
"""

from datetime import date
from backend.database import get_db, row_to_dict, rows_to_list
from backend.models import BillReturnIn
from backend.routers.auth import get_current_user
from backend.utils.backup import auto_trigger_backup
from fastapi import APIRouter, HTTPException, Header, BackgroundTasks
from typing import Optional

router = APIRouter(prefix="/api/returns", tags=["returns"])


def next_return_no(conn) -> str:
    today = date.today().strftime("%Y%m%d")
    n = conn.execute("SELECT COUNT(*) FROM bill_returns WHERE return_no LIKE ?",
                     (f"CR{today}%",)).fetchone()[0]
    return f"CR{today}{n+1:04d}"


@router.post("")
def create_return(body: BillReturnIn, background_tasks: BackgroundTasks, x_token: Optional[str] = Header(default=None)):
    user = get_current_user(x_token)
    with get_db() as conn:
        bill = row_to_dict(conn.execute("SELECT * FROM bills WHERE id=?", (body.bill_id,)).fetchone())
        if not bill:
            raise HTTPException(404, "Bill not found")

        # Prevent duplicate returns
        already_returned = conn.execute("SELECT 1 FROM bill_returns WHERE bill_id=?", (body.bill_id,)).fetchone()
        if already_returned:
            raise HTTPException(400, "Return already processed for this bill")

        total_refund = 0.0
        return_no = next_return_no(conn)

        cur = conn.execute("""
            INSERT INTO bill_returns(bill_id, return_no, reason, refund_mode, total_refund, created_by)
            VALUES(?,?,?,?,?,?)""",
            (body.bill_id, return_no, body.reason, body.refund_mode, 0, user["id"]))
        return_id = cur.lastrowid

        for item in body.items:
            # Get original bill item for pricing
            bi = row_to_dict(conn.execute(
                "SELECT * FROM bill_items WHERE id=?", (item.bill_item_id,)).fetchone())
            if not bi:
                continue

            amount = round(float(bi.get("mrp_per_tab") or 0.0) * int(item.tablets_qty), 2)
            total_refund += amount

            conn.execute("""
                INSERT INTO bill_return_items(return_id, bill_item_id, drug_id, batch_id, tablets_qty, amount)
                VALUES(?,?,?,?,?,?)""",
                (return_id, item.bill_item_id, item.drug_id, item.batch_id, item.tablets_qty, amount))

            # Restore stock — put tablets back to the original batch as a tray
            drug = row_to_dict(conn.execute(
                "SELECT * FROM drugs WHERE id=?", (item.drug_id,)).fetchone())
            tps = (drug or {}).get("tablets_per_strip", 10) or 10
            # If full strips, restore to batches
            full_strips = item.tablets_qty // tps
            leftover    = item.tablets_qty % tps
            if full_strips > 0 and item.batch_id:
                conn.execute(
                    "UPDATE batches SET full_strips=full_strips+? WHERE id=?",
                    (full_strips, item.batch_id))
            # Partial strip → restore / top-up open tray or create new tray
            if leftover > 0 and item.batch_id:
                existing = row_to_dict(conn.execute("""
                    SELECT * FROM trays WHERE batch_id=? AND closed=0
                    ORDER BY tablets_remaining DESC LIMIT 1""", (item.batch_id,)).fetchone())
                if existing:
                    conn.execute("UPDATE trays SET tablets_remaining=tablets_remaining+? WHERE id=?",
                                 (leftover, existing["id"]))
                else:
                    n = conn.execute("SELECT COUNT(*) FROM trays").fetchone()[0]
                    tid = f"T-{n+1:03d}"
                    conn.execute("""
                        INSERT INTO trays(tray_id, drug_id, batch_id, tablets_remaining, box_id)
                        VALUES(?,?,?,?,?)""",
                        (tid, item.drug_id, item.batch_id, leftover,
                         drug.get("box_id") if drug else None))

            conn.execute(
                "INSERT INTO stock_log(drug_id,batch_id,action,qty_change,note) VALUES(?,?,?,?,?)",
                (item.drug_id, item.batch_id, "return", item.tablets_qty,
                 f"Return {return_no}"))

        # Update return total
        conn.execute("UPDATE bill_returns SET total_refund=? WHERE id=?",
                     (round(float(total_refund), 2), return_id))

        # If customer paid by credit original, reverse the credit ledger entry
        if bill.get("payment_mode") == "Credit" and bill.get("customer_id"):
            conn.execute("""
                INSERT INTO credit_ledger(customer_id, bill_id, type, amount, note)
                VALUES(?,?,?,?,?)""",
                (bill["customer_id"], body.bill_id, "refund",
                 round(float(total_refund), 2), f"Return {return_no}"))
            conn.execute(
                "UPDATE customers SET credit_balance=credit_balance-? WHERE id=?",
                (round(float(total_refund), 2), bill["customer_id"]))

        # Auto-backup
        pass
        
    auto_trigger_backup(background_tasks)

    return {
        "ok": True,
        "return_no": return_no,
        "total_refund": round(float(total_refund), 2),
    }


@router.get("")
def list_returns(limit: int = 50):
    with get_db() as conn:
        rows = conn.execute("""
            SELECT br.*, b.bill_no, u.display_name as cashier
            FROM bill_returns br
            JOIN bills b ON b.id=br.bill_id
            LEFT JOIN users u ON u.id=br.created_by
            ORDER BY br.created_at DESC LIMIT ?""", (limit,)).fetchall()
        return rows_to_list(rows)


@router.get("/{return_id}")
def get_return(return_id: int):
    with get_db() as conn:
        ret = row_to_dict(conn.execute("""
            SELECT br.*, b.bill_no, b.patient_name, b.doctor
            FROM bill_returns br JOIN bills b ON b.id=br.bill_id
            WHERE br.id=?""", (return_id,)).fetchone())
        if not ret:
            raise HTTPException(404, "Return not found")
        ret["items"] = rows_to_list(conn.execute("""
            SELECT bri.*, d.name as drug_name, d.brand
            FROM bill_return_items bri JOIN drugs d ON d.id=bri.drug_id
            WHERE bri.return_id=?""", (return_id,)).fetchall())
        return ret
