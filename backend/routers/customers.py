"""
PharmaPro — routers/customers.py
Customer CRUD
"""

from fastapi import APIRouter, Header
from typing import Optional
from datetime import datetime, timedelta, date

from backend.database import get_db, rows_to_list
from backend.models import CustomerIn
from backend.routers.auth import get_current_user

router = APIRouter(prefix="/api/customers", tags=["customers"])


@router.get("")
def get_customers(q: str = ""):
    with get_db() as conn:
        if q:
            like = f"%{q}%"
            rows = conn.execute(
                "SELECT * FROM customers WHERE name LIKE ? OR phone LIKE ? OR custom_id LIKE ? LIMIT 10",
                (like, like, like)).fetchall()
        else:
            rows = conn.execute("SELECT * FROM customers ORDER BY name").fetchall()
        return rows_to_list(rows)


@router.get("/reminders/active")
def get_reminders(x_token: Optional[str] = Header(default=None)):
    get_current_user(x_token)
    reminders = []
    today = date.today()
    with get_db() as conn:
        rows = conn.execute("""
            SELECT c.id as customer_id, c.name as customer_name, c.phone, c.custom_id,
                   b.created_at, bi.tablets_qty, d.name as drug_name, d.id as drug_id
            FROM customers c
            JOIN bills b ON b.customer_id = c.id
            JOIN bill_items bi ON bi.bill_id = b.id
            JOIN drugs d ON d.id = bi.drug_id
            ORDER BY b.created_at DESC, b.id DESC
        """).fetchall()
        
        seen = set()
        for r in rows:
            key = (r["customer_id"], r["drug_id"])
            if key in seen:
                continue
            seen.add(key)
            
            if not r["created_at"]:
                continue
            date_str = r["created_at"].split(" ")[0].split("T")[0]
            try:
                purchase_date = datetime.strptime(date_str, "%Y-%m-%d").date()
            except Exception:
                continue
            
            qty = r["tablets_qty"] or 10
            days_dose = int(qty / 2.0)  # assume 2 tablets per day
            completion_date = purchase_date + timedelta(days=days_dose)
            days_left = (completion_date - today).days
            
            if -10 <= days_left <= 3:
                reminders.append({
                    "customer_id": r["customer_id"],
                    "customer_name": r["customer_name"],
                    "phone": r["phone"],
                    "custom_id": r["custom_id"],
                    "drug_name": r["drug_name"],
                    "purchase_date": purchase_date.isoformat(),
                    "qty": qty,
                    "completion_date": completion_date.isoformat(),
                    "days_left": days_left,
                    "status": "Running Out" if days_left >= 0 else "Completed"
                })
        
        reminders.sort(key=lambda x: x["days_left"])
        return reminders


@router.get("/{customer_id}/bills")
def get_customer_bills(customer_id: int):
    with get_db() as conn:
        rows = conn.execute("""
            SELECT b.bill_no, b.total, b.payment_mode, b.created_at,
                   COUNT(bi.id) as item_count
            FROM bills b JOIN bill_items bi ON bi.bill_id=b.id
            WHERE b.customer_id=?
            GROUP BY b.id ORDER BY b.created_at DESC LIMIT 20""", (customer_id,)).fetchall()
        return rows_to_list(rows)


@router.post("")
def add_customer(c: CustomerIn, x_token: Optional[str] = Header(default=None)):
    get_current_user(x_token)
    with get_db() as conn:
        cur = conn.execute("""
            INSERT INTO customers(name, phone, dob, custom_id, agreed_discount, purchased_medicines, last_purchase_date, loyalty_points)
            VALUES(?,?,?,?,?,?,?,?)
        """, (c.name, c.phone, c.dob, c.custom_id, c.agreed_discount, c.purchased_medicines, c.last_purchase_date, c.loyalty_points))
        return {"id": cur.lastrowid}


@router.put("/{customer_id}")
def update_customer(customer_id: int, c: CustomerIn, x_token: Optional[str] = Header(default=None)):
    get_current_user(x_token)
    with get_db() as conn:
        conn.execute("""
            UPDATE customers
            SET name=?, phone=?, dob=?, custom_id=?, agreed_discount=?, purchased_medicines=?, last_purchase_date=?, loyalty_points=?
            WHERE id=?
        """, (c.name, c.phone, c.dob, c.custom_id, c.agreed_discount, c.purchased_medicines, c.last_purchase_date, c.loyalty_points, customer_id))
        return {"ok": True}
