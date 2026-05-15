"""
PharmaPro — routers/purchase_orders.py
Purchase Order create, view, and receive into stock
"""

from datetime import date
from fastapi import APIRouter, HTTPException, Header
from typing import Optional

from backend.database import get_db, row_to_dict, rows_to_list
from backend.models import POIn, POReceiveIn
from backend.routers.auth import get_current_user
from backend.routers.backorders import notify_backorders_for_drug

router = APIRouter(prefix="/api/purchase_orders", tags=["purchase_orders"])


def next_po_no(conn) -> str:
    today = date.today().strftime("%Y%m%d")
    n = conn.execute("SELECT COUNT(*) FROM purchase_orders WHERE po_no LIKE ?",
                     (f"PO{today}%",)).fetchone()[0]
    return f"PO{today}{n+1:04d}"


@router.get("")
def list_pos():
    with get_db() as conn:
        rows = conn.execute("""
            SELECT po.*, s.name as supplier_name,
                   COUNT(pi.id) as item_count,
                   u.display_name as created_by_name
            FROM purchase_orders po
            LEFT JOIN suppliers s ON s.id=po.supplier_id
            LEFT JOIN po_items pi ON pi.po_id=po.id
            LEFT JOIN users u ON u.id=po.created_by
            GROUP BY po.id ORDER BY po.created_at DESC""").fetchall()
        return rows_to_list(rows)


@router.get("/{po_id}")
def get_po(po_id: int):
    with get_db() as conn:
        po = row_to_dict(conn.execute("""
            SELECT po.*, s.name as supplier_name, s.phone as supplier_phone
            FROM purchase_orders po LEFT JOIN suppliers s ON s.id=po.supplier_id
            WHERE po.id=?""", (po_id,)).fetchone())
        if not po:
            raise HTTPException(404, "PO not found")
        po["items"] = rows_to_list(conn.execute("""
            SELECT pi.*, d.name as drug_name, d.brand, d.tablets_per_strip, d.mrp_per_strip
            FROM po_items pi JOIN drugs d ON d.id=pi.drug_id
            WHERE pi.po_id=?""", (po_id,)).fetchall())
        return po


@router.post("")
def create_po(body: POIn, x_token: Optional[str] = Header(default=None)):
    user = get_current_user(x_token)
    with get_db() as conn:
        po_no = next_po_no(conn)
        def line_total(i):
            sub  = i.qty_strips * i.rate_per_strip
            disc = sub * (i.discount_pct / 100)
            gst  = (sub - disc) * (i.gst_pct / 100)
            return sub - disc + gst
        total = sum(line_total(i) for i in body.items)
        cur = conn.execute("""
            INSERT INTO purchase_orders(po_no,supplier_id,status,notes,total_amt,created_by)
            VALUES(?,?,?,?,?,?)""",
            (po_no, body.supplier_id, "draft", body.notes, total, user["id"]))
        po_id = cur.lastrowid
        for item in body.items:
            conn.execute("""
                INSERT INTO po_items(po_id,drug_id,qty_strips,rate_per_strip,discount_pct,gst_pct)
                VALUES(?,?,?,?,?,?)""",
                (po_id, item.drug_id, item.qty_strips, item.rate_per_strip,
                 item.discount_pct, item.gst_pct))
        return {"po_id": po_id, "po_no": po_no}


@router.put("/{po_id}/send")
def send_po(po_id: int, x_token: Optional[str] = Header(default=None)):
    """Mark PO as 'ordered' — sent to supplier."""
    get_current_user(x_token)
    with get_db() as conn:
        conn.execute("UPDATE purchase_orders SET status='ordered', ordered_at=datetime('now') WHERE id=?",
                     (po_id,))
    return {"ok": True}


@router.post("/{po_id}/receive")
def receive_po(po_id: int, body: POReceiveIn, x_token: Optional[str] = Header(default=None)):
    """Receive stock against a PO — creates batches and updates stock."""
    get_current_user(x_token)
    import sqlite3
    with get_db() as conn:
        po = row_to_dict(conn.execute("SELECT * FROM purchase_orders WHERE id=?", (po_id,)).fetchone())
        if not po:
            raise HTTPException(404, "PO not found")
        received_val = 0.0
        for item in body.items:
            pi = row_to_dict(conn.execute("SELECT * FROM po_items WHERE id=?", (item.po_item_id,)).fetchone())
            if not pi:
                continue
            # Create or top-up batch
            try:
                conn.execute("""
                    INSERT INTO batches(drug_id,batch_no,expiry,full_strips,cost_per_strip,supplier_id)
                    VALUES(?,?,?,?,?,?)""",
                    (pi["drug_id"], item.batch_no, item.expiry, item.received_strips,
                     item.cost_per_strip, po["supplier_id"]))
            except sqlite3.IntegrityError:
                conn.execute("""
                    UPDATE batches SET full_strips=full_strips+?, cost_per_strip=?
                    WHERE drug_id=? AND batch_no=?""",
                    (item.received_strips, item.cost_per_strip, pi["drug_id"], item.batch_no))
            # Update PO item received quantity
            conn.execute(
                "UPDATE po_items SET received_strips=?, batch_no=?, expiry=? WHERE id=?",
                (item.received_strips, item.batch_no, item.expiry, item.po_item_id))
            # Auto-notify customers waiting for this drug
            try:
                notify_backorders_for_drug(pi["drug_id"], conn)
            except Exception:
                pass  # Never let notification failure block stock receipt
            received_val += item.received_strips * item.cost_per_strip
            
        conn.execute("""
            UPDATE purchase_orders SET status='received', received_at=datetime('now'), total_amt=?
            WHERE id=?""", (received_val, po_id))
            
        if po["supplier_id"] and received_val > 0:
            conn.execute("UPDATE suppliers SET due = COALESCE(due, 0) + ? WHERE id=?", (received_val, po["supplier_id"]))
            
    return {"ok": True}


@router.delete("/{po_id}")
def delete_po(po_id: int, x_token: Optional[str] = Header(default=None)):
    get_current_user(x_token)
    with get_db() as conn:
        po = row_to_dict(conn.execute("SELECT status FROM purchase_orders WHERE id=?", (po_id,)).fetchone())
        if not po:
            raise HTTPException(404)
        if po["status"] == "received":
            raise HTTPException(400, "Cannot delete a received PO")
        conn.execute("DELETE FROM po_items WHERE po_id=?", (po_id,))
        conn.execute("DELETE FROM purchase_orders WHERE id=?", (po_id,))
    return {"ok": True}


@router.get("/last-rates/{supplier_id}")
def last_rates_for_supplier(supplier_id: int):
    """Return the last purchase rate paid per drug_id for this supplier."""
    with get_db() as conn:
        rows = conn.execute("""
            SELECT pi.drug_id, pi.rate_per_strip, pi.discount_pct, pi.gst_pct,
                   po.created_at
            FROM po_items pi
            JOIN purchase_orders po ON po.id = pi.po_id
            WHERE po.supplier_id = ?
            ORDER BY po.created_at DESC
        """, (supplier_id,)).fetchall()
        # Keep only the most recent rate per drug
        seen = {}
        for r in rows_to_list(rows):
            if r["drug_id"] not in seen:
                seen[r["drug_id"]] = r
        return list(seen.values())


@router.post("/{po_id}/partial-receive")
def partial_receive_po(po_id: int, body: POReceiveIn,
                       x_token: Optional[str] = Header(default=None)):
    """Receive only selected items — PO stays 'ordered' until all received."""
    get_current_user(x_token)
    import sqlite3
    with get_db() as conn:
        po = row_to_dict(conn.execute(
            "SELECT * FROM purchase_orders WHERE id=?", (po_id,)).fetchone())
        if not po:
            raise HTTPException(404, "PO not found")
        for item in body.items:
            pi = row_to_dict(conn.execute(
                "SELECT * FROM po_items WHERE id=?", (item.po_item_id,)).fetchone())
            if not pi:
                continue
            try:
                conn.execute("""
                    INSERT INTO batches(drug_id,batch_no,expiry,full_strips,cost_per_strip,supplier_id)
                    VALUES(?,?,?,?,?,?)""",
                    (pi["drug_id"], item.batch_no, item.expiry,
                     item.received_strips, item.cost_per_strip, po["supplier_id"]))
            except sqlite3.IntegrityError:
                conn.execute("""
                    UPDATE batches SET full_strips=full_strips+?, cost_per_strip=?
                    WHERE drug_id=? AND batch_no=?""",
                    (item.received_strips, item.cost_per_strip,
                     pi["drug_id"], item.batch_no))
            conn.execute(
                "UPDATE po_items SET received_strips=?, batch_no=?, expiry=? WHERE id=?",
                (item.received_strips, item.batch_no, item.expiry, item.po_item_id))
            # Auto-notify customers waiting for this drug
            try:
                notify_backorders_for_drug(pi["drug_id"], conn)
            except Exception:
                pass

        # Check if ALL items are now received
        pending = conn.execute(
            "SELECT COUNT(*) FROM po_items WHERE po_id=? AND (received_strips IS NULL OR received_strips=0)",
            (po_id,)).fetchone()[0]
        if pending == 0:
            conn.execute(
                "UPDATE purchase_orders SET status='received', received_at=datetime('now') WHERE id=?",
                (po_id,))
        # else stays 'ordered' — partial delivery
    return {"ok": True, "still_pending": pending}

