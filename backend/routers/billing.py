"""
PharmaPro — routers/billing.py
Bill creation with FEFO stock deduction + loyalty points
"""

from datetime import date
from fastapi import APIRouter, HTTPException, Header, BackgroundTasks
from typing import Optional

from backend.database import get_db, row_to_dict, rows_to_list
from backend.models import BillIn
from backend.routers.auth import get_current_user
from backend.utils.backup import auto_trigger_backup

router = APIRouter(prefix="/api/bills", tags=["bills"])


def next_bill_no(conn) -> str:
    today = date.today().strftime("%Y%m%d")
    n = conn.execute("SELECT COUNT(*) FROM bills WHERE bill_no LIKE ?",
                     (f"B{today}%",)).fetchone()[0]
    return f"B{today}{n+1:04d}"


def next_tray_id(conn) -> str:
    n = conn.execute("SELECT COUNT(*) FROM trays").fetchone()[0]
    return f"T-{n+1:03d}"


@router.post("")
def create_bill(bill: BillIn, background_tasks: BackgroundTasks, x_token: Optional[str] = Header(default=None)):
    user = get_current_user(x_token)
    with get_db() as conn:
        bill_no  = next_bill_no(conn)
        subtotal = sum(
            i.tablets_qty * conn.execute(
                "SELECT mrp_per_tablet FROM drugs WHERE id=?", (i.drug_id,)
            ).fetchone()[0]
            for i in bill.items
        )
        pct_disc_amt = round(float(subtotal * bill.discount_pct) / 100.0, 2)
        points_disc_amt = float(bill.points_redeemed) if bill.points_redeemed else 0.0
        disc_amt = pct_disc_amt + points_disc_amt
        
        # Determine GST slab
        cfg_row  = conn.execute("SELECT value FROM shop_config WHERE key='gst_slab'").fetchone()
        gst_slab = float(cfg_row["value"] if cfg_row else 12)
        # If GST inclusive prices are provided, back-calculate base subtotal
        if bill.gst_inclusive:
            # Convert inclusive subtotal to exclusive base amount
            base_subtotal = round(subtotal / (1 + gst_slab / 100), 2)
            # Recalculate discount on base amount
            pct_disc_amt = round(float(base_subtotal * bill.discount_pct) / 100.0, 2)
            disc_amt = pct_disc_amt + points_disc_amt
            taxable = base_subtotal - disc_amt
            gst_amt = round(taxable * gst_slab / 100, 2)
            total = round(base_subtotal - disc_amt + gst_amt, 2)
        else:
            pct_disc_amt = round(float(subtotal * bill.discount_pct) / 100.0, 2)
            disc_amt = pct_disc_amt + points_disc_amt
            gst_amt = round(float((subtotal - disc_amt) * gst_slab) / 100.0, 2)
            total = round(float(subtotal - disc_amt + gst_amt), 2)

        cur = conn.execute("""
            INSERT INTO bills(bill_no,customer_id,patient_name,doctor,rx_no,
            subtotal,discount_pct,discount_amt,gst_amt,total,payment_mode,created_by)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?)""",
            (bill_no, bill.customer_id, bill.patient_name, bill.doctor, bill.rx_no,
             subtotal, bill.discount_pct, disc_amt, gst_amt, total, bill.payment_mode, user["id"]))
        bill_id = cur.lastrowid
        
        if bill.rx_no or bill.rx_image_path:
            import time
            rx_val = bill.rx_no or f"RX-{int(time.time())}"
            conn.execute("""
                INSERT INTO prescriptions(rx_no, patient, doctor, rx_date, bill_id, image_path)
                VALUES(?,?,?,?,?,?)
            """, (rx_val, bill.patient_name, bill.doctor, date.today().isoformat(), bill_id, bill.rx_image_path))


        for item in bill.items:
            drug = row_to_dict(conn.execute("SELECT * FROM drugs WHERE id=?", (item.drug_id,)).fetchone())
            mrp  = drug["mrp_per_tablet"]
            tps  = drug["tablets_per_strip"]

            # FEFO stock deduction
            remaining = item.tablets_qty
            trays = rows_to_list(conn.execute("""
                SELECT t.*, b.expiry FROM trays t JOIN batches b ON b.id=t.batch_id
                WHERE t.drug_id=? AND t.closed=0 ORDER BY b.expiry ASC""", (item.drug_id,)).fetchall())
            for tray in trays:
                if remaining <= 0:
                    break
                use     = min(remaining, tray["tablets_remaining"])
                new_qty = tray["tablets_remaining"] - use
                if new_qty == 0:
                    conn.execute("UPDATE trays SET tablets_remaining=0,closed=1 WHERE id=?", (tray["id"],))
                else:
                    conn.execute("UPDATE trays SET tablets_remaining=? WHERE id=?", (new_qty, tray["id"]))
                
                # Insert bill item for this tray deduction
                amt = round(mrp * use, 2)
                conn.execute("""
                    INSERT INTO bill_items(bill_id,drug_id,batch_id,tray_id,tablets_qty,mrp_per_tab,amount)
                    VALUES(?,?,?,?,?,?,?)""",
                    (bill_id, item.drug_id, tray["batch_id"], tray["id"], use, mrp, amt))
                
                remaining -= use

            if remaining > 0:
                batches = rows_to_list(conn.execute("""
                    SELECT * FROM batches WHERE drug_id=? AND full_strips>0
                    ORDER BY expiry ASC""", (item.drug_id,)).fetchall())
                for batch in batches:
                    if remaining <= 0:
                        break
                    strips_needed = (int(remaining) + int(tps) - 1) // int(tps)
                    strips_use    = min(strips_needed, batch["full_strips"])
                    tablets_from  = strips_use * tps
                    leftover      = tablets_from - remaining
                    conn.execute("UPDATE batches SET full_strips=full_strips-? WHERE id=?",
                                 (strips_use, batch["id"]))
                    
                    use = tablets_from - leftover
                    amt = round(mrp * use, 2)
                    conn.execute("""
                        INSERT INTO bill_items(bill_id,drug_id,batch_id,tray_id,tablets_qty,mrp_per_tab,amount)
                        VALUES(?,?,?,?,?,?,?)""",
                        (bill_id, item.drug_id, batch["id"], None, use, mrp, amt))

                    if leftover > 0:
                        tid = next_tray_id(conn)
                        conn.execute("""
                            INSERT INTO trays(tray_id,drug_id,batch_id,tablets_remaining,box_id)
                            VALUES(?,?,?,?,?)""",
                            (tid, item.drug_id, batch["id"], leftover, drug["box_id"]))
                        remaining = 0


        if bill.customer_id:
            # Earn 1 point per 100 rupees spent
            pts_earned = int(total // 100)
            conn.execute("""
                UPDATE customers 
                SET loyalty_points = COALESCE(loyalty_points, 0) - ? + ?
                WHERE id=?
            """, (bill.points_redeemed, pts_earned, bill.customer_id))
            
            # Credit payment — debit customer balance
            if bill.payment_mode == "Credit":
                conn.execute("UPDATE customers SET credit_balance = COALESCE(credit_balance, 0) + ? WHERE id=?", (total, bill.customer_id))
                conn.execute("INSERT INTO credit_ledger(customer_id,bill_id,type,amount,note) VALUES(?,?,?,?,?)",
                             (bill.customer_id, bill_id, "debit", total, "Credit Bill Generated"))

        # Schedule H/X auto-log
        for item in bill.items:
            sch = conn.execute(
                "SELECT schedule FROM drugs WHERE id=?", (item.drug_id,)).fetchone()
            if sch and sch["schedule"] in ("H", "X"):
                conn.execute("""
                    INSERT INTO schedule_log(drug_id, bill_id, patient, doctor, rx_no, qty_tabs)
                    VALUES(?,?,?,?,?,?)""",
                    (item.drug_id, bill_id, bill.patient_name, bill.doctor,
                     bill.rx_no, item.tablets_qty))

        conn.execute("INSERT INTO stock_log(drug_id,action,qty_change,note) VALUES(?,?,?,?)",
                     (bill.items[0].drug_id if bill.items else None, "sale",
                      -sum(i.tablets_qty for i in bill.items), f"Bill {bill_no}"))

    # Auto-backup
    auto_trigger_backup(background_tasks)

    return {"bill_no": bill_no, "bill_id": bill_id, "total": total,
            "subtotal": subtotal, "discount_amt": disc_amt, "gst_amt": gst_amt}


@router.get("")
def get_bills(limit: int = 50):
    with get_db() as conn:
        rows = conn.execute("""
            SELECT b.*, c.name as customer_name, u.display_name as cashier
            FROM bills b
            LEFT JOIN customers c ON c.id=b.customer_id
            LEFT JOIN users u ON u.id=b.created_by
            ORDER BY b.created_at DESC LIMIT ?""", (limit,)).fetchall()
        return rows_to_list(rows)


@router.get("/{bill_id}")
def get_bill(bill_id: int):
    with get_db() as conn:
        bill = row_to_dict(conn.execute("""
            SELECT b.*, c.name as customer_name, c.phone as customer_phone, c.loyalty_points as customer_loyalty_points, u.display_name as cashier
            FROM bills b
            LEFT JOIN customers c ON c.id=b.customer_id
            LEFT JOIN users u ON u.id=b.created_by
            WHERE b.id=?""", (bill_id,)).fetchone())
        if not bill:
            raise HTTPException(404)
        bill["items"] = rows_to_list(conn.execute("""
            SELECT bi.*, d.name, d.brand, d.hsn, b.batch_no, b.expiry
            FROM bill_items bi JOIN drugs d ON d.id=bi.drug_id
            LEFT JOIN batches b ON b.id=bi.batch_id
            WHERE bi.bill_id=?""", (bill_id,)).fetchall())
        return bill


@router.put("/{bill_id}")
def update_bill(bill_id: int, bill: BillIn, background_tasks: BackgroundTasks, x_token: Optional[str] = Header(default=None)):
    user = get_current_user(x_token)
    with get_db() as conn:
        old_bill = row_to_dict(conn.execute("SELECT * FROM bills WHERE id=?", (bill_id,)).fetchone())
        if not old_bill:
            raise HTTPException(404, "Bill not found")

        old_items = rows_to_list(conn.execute("SELECT * FROM bill_items WHERE bill_id=?", (bill_id,)).fetchall())

        # 1. Revert Old Items Stock
        for item in old_items:
            drug = row_to_dict(conn.execute("SELECT * FROM drugs WHERE id=?", (item["drug_id"],)).fetchone())
            tps = (drug or {}).get("tablets_per_strip", 10) or 10
            qty = item["tablets_qty"]
            full_strips = qty // tps
            leftover = qty % tps
            
            if full_strips > 0 and item["batch_id"]:
                conn.execute("UPDATE batches SET full_strips=full_strips+? WHERE id=?", (full_strips, item["batch_id"]))
            
            if leftover > 0 and item["batch_id"]:
                existing = row_to_dict(conn.execute("""
                    SELECT * FROM trays WHERE batch_id=? AND closed=0
                    ORDER BY tablets_remaining DESC LIMIT 1""", (item["batch_id"],)).fetchone())
                if existing:
                    conn.execute("UPDATE trays SET tablets_remaining=tablets_remaining+? WHERE id=?", (leftover, existing["id"]))
                else:
                    tid = next_tray_id(conn)
                    conn.execute("""
                        INSERT INTO trays(tray_id, drug_id, batch_id, tablets_remaining, box_id)
                        VALUES(?,?,?,?,?)""", (tid, item["drug_id"], item["batch_id"], leftover, drug.get("box_id") if drug else None))

        # 2. Revert Customer Balance/Points
        if old_bill.get("customer_id"):
            old_total = old_bill.get("total") or 0.0
            old_pts_earned = int(old_total // 100)
            
            # Back-calculate old points redeemed.
            # Determine GST slab
            cfg_row = conn.execute("SELECT value FROM shop_config WHERE key='gst_slab'").fetchone()
            gst_slab = float(cfg_row["value"] if cfg_row else 12)
            
            # Check if previous was inclusive or exclusive:
            # If exclusive, total = subtotal - discount_amt + gst_amt
            # If inclusive, total = base_subtotal - discount_amt + gst_amt
            if abs(old_total - (old_bill["subtotal"] - old_bill["discount_amt"] + old_bill["gst_amt"])) < 0.1:
                old_pct_disc_amt = round(float(old_bill["subtotal"] * old_bill["discount_pct"]) / 100.0, 2)
            else:
                base_subtotal = round(old_bill["subtotal"] / (1 + gst_slab / 100), 2)
                old_pct_disc_amt = round(float(base_subtotal * old_bill["discount_pct"]) / 100.0, 2)
                
            old_points_redeemed = max(0, int(round(old_bill["discount_amt"] - old_pct_disc_amt)))
            
            conn.execute("""
                UPDATE customers 
                SET loyalty_points = COALESCE(loyalty_points, 0) + ? - ?
                WHERE id=?
            """, (old_points_redeemed, old_pts_earned, old_bill["customer_id"]))
            
            if old_bill.get("payment_mode") == "Credit":
                conn.execute("UPDATE customers SET credit_balance = COALESCE(credit_balance, 0) - ? WHERE id=?", (old_total, old_bill["customer_id"]))

        # 3. Clear old dependent entries
        conn.execute("DELETE FROM credit_ledger WHERE bill_id=?", (bill_id,))
        conn.execute("DELETE FROM schedule_log WHERE bill_id=?", (bill_id,))
        conn.execute("DELETE FROM prescriptions WHERE bill_id=?", (bill_id,))
        conn.execute("DELETE FROM bill_items WHERE bill_id=?", (bill_id,))

        # 4. Calculate New Totals
        subtotal = sum(
            i.tablets_qty * conn.execute(
                "SELECT mrp_per_tablet FROM drugs WHERE id=?", (i.drug_id,)
            ).fetchone()[0]
            for i in bill.items
        )
        pct_disc_amt = round(float(subtotal * bill.discount_pct) / 100.0, 2)
        points_disc_amt = float(bill.points_redeemed) if bill.points_redeemed else 0.0
        disc_amt = pct_disc_amt + points_disc_amt
        
        # Determine GST slab
        cfg_row  = conn.execute("SELECT value FROM shop_config WHERE key='gst_slab'").fetchone()
        gst_slab = float(cfg_row["value"] if cfg_row else 12)
        
        if bill.gst_inclusive:
            base_subtotal = round(subtotal / (1 + gst_slab / 100), 2)
            pct_disc_amt = round(float(base_subtotal * bill.discount_pct) / 100.0, 2)
            disc_amt = pct_disc_amt + points_disc_amt
            taxable = base_subtotal - disc_amt
            gst_amt = round(taxable * gst_slab / 100, 2)
            total = round(base_subtotal - disc_amt + gst_amt, 2)
        else:
            pct_disc_amt = round(float(subtotal * bill.discount_pct) / 100.0, 2)
            disc_amt = pct_disc_amt + points_disc_amt
            gst_amt = round(float((subtotal - disc_amt) * gst_slab) / 100.0, 2)
            total = round(float(subtotal - disc_amt + gst_amt), 2)

        # 5. Update main bills row
        conn.execute("""
            UPDATE bills
            SET customer_id=?, patient_name=?, doctor=?, rx_no=?,
                subtotal=?, discount_pct=?, discount_amt=?, gst_amt=?, total=?, payment_mode=?
            WHERE id=?""",
            (bill.customer_id, bill.patient_name, bill.doctor, bill.rx_no,
             subtotal, bill.discount_pct, disc_amt, gst_amt, total, bill.payment_mode, bill_id))

        # 6. Insert new prescriptions if needed
        if bill.rx_no or bill.rx_image_path:
            import time
            rx_val = bill.rx_no or f"RX-{int(time.time())}"
            conn.execute("""
                INSERT INTO prescriptions(rx_no, patient, doctor, rx_date, bill_id, image_path)
                VALUES(?,?,?,?,?,?)
            """, (rx_val, bill.patient_name, bill.doctor, date.today().isoformat(), bill_id, bill.rx_image_path))

        # 7. Deduct new stock and insert new bill_items
        for item in bill.items:
            drug = row_to_dict(conn.execute("SELECT * FROM drugs WHERE id=?", (item.drug_id,)).fetchone())
            mrp  = drug["mrp_per_tablet"]
            amt  = round(mrp * item.tablets_qty, 2)
            tps  = drug["tablets_per_strip"]

            conn.execute("""
                INSERT INTO bill_items(bill_id,drug_id,batch_id,tray_id,tablets_qty,mrp_per_tab,amount)
                VALUES(?,?,?,?,?,?,?)""",
                (bill_id, item.drug_id, item.batch_id, item.tray_id, item.tablets_qty, mrp, amt))

            # FEFO stock deduction
            remaining = item.tablets_qty
            trays = rows_to_list(conn.execute("""
                SELECT t.*, b.expiry FROM trays t JOIN batches b ON b.id=t.batch_id
                WHERE t.drug_id=? AND t.closed=0 ORDER BY b.expiry ASC""", (item.drug_id,)).fetchall())
            for tray in trays:
                if remaining <= 0:
                    break
                use     = min(remaining, tray["tablets_remaining"])
                new_qty = tray["tablets_remaining"] - use
                if new_qty == 0:
                    conn.execute("UPDATE trays SET tablets_remaining=0,closed=1 WHERE id=?", (tray["id"],))
                else:
                    conn.execute("UPDATE trays SET tablets_remaining=? WHERE id=?", (new_qty, tray["id"]))
                remaining -= use

            if remaining > 0:
                batches = rows_to_list(conn.execute("""
                    SELECT * FROM batches WHERE drug_id=? AND full_strips>0
                    ORDER BY expiry ASC""", (item.drug_id,)).fetchall())
                for batch in batches:
                    if remaining <= 0:
                        break
                    strips_needed = (int(remaining) + int(tps) - 1) // int(tps)
                    strips_use    = min(strips_needed, batch["full_strips"])
                    tablets_from  = strips_use * tps
                    leftover      = tablets_from - remaining
                    conn.execute("UPDATE batches SET full_strips=full_strips-? WHERE id=?",
                                 (strips_use, batch["id"]))
                    if leftover > 0:
                        tid = next_tray_id(conn)
                        conn.execute("""
                            INSERT INTO trays(tray_id,drug_id,batch_id,tablets_remaining,box_id)
                            VALUES(?,?,?,?,?)""",
                            (tid, item.drug_id, batch["id"], leftover, drug["box_id"]))
                        remaining = 0

        # 8. Re-apply customer changes and credit balance/ledger/logs
        if bill.customer_id:
            pts_earned = int(total // 100)
            conn.execute("""
                UPDATE customers 
                SET loyalty_points = COALESCE(loyalty_points, 0) - ? + ?
                WHERE id=?
            """, (bill.points_redeemed, pts_earned, bill.customer_id))
            
            if bill.payment_mode == "Credit":
                conn.execute("UPDATE customers SET credit_balance = COALESCE(credit_balance, 0) + ? WHERE id=?", (total, bill.customer_id))
                conn.execute("INSERT INTO credit_ledger(customer_id,bill_id,type,amount,note) VALUES(?,?,?,?,?)",
                             (bill.customer_id, bill_id, "debit", total, "Credit Bill Updated"))

        # Schedule H/X auto-log
        for item in bill.items:
            sch = conn.execute(
                "SELECT schedule FROM drugs WHERE id=?", (item.drug_id,)).fetchone()
            if sch and sch["schedule"] in ("H", "X"):
                conn.execute("""
                    INSERT INTO schedule_log(drug_id, bill_id, patient, doctor, rx_no, qty_tabs)
                    VALUES(?,?,?,?,?,?)""",
                    (item.drug_id, bill_id, bill.patient_name, bill.doctor,
                     bill.rx_no, item.tablets_qty))

        conn.execute("INSERT INTO stock_log(drug_id,action,qty_change,note) VALUES(?,?,?,?)",
                     (bill.items[0].drug_id if bill.items else None, "edit_bill",
                      -sum(i.tablets_qty for i in bill.items), f"Bill {old_bill['bill_no']} Updated"))

    # Auto-backup
    auto_trigger_backup(background_tasks)

    return {"bill_no": old_bill["bill_no"], "bill_id": bill_id, "total": total,
            "subtotal": subtotal, "discount_amt": disc_amt, "gst_amt": gst_amt}
