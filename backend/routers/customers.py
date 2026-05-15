"""
PharmaPro — routers/customers.py
Customer CRUD
"""

from fastapi import APIRouter, Header
from typing import Optional

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
                "SELECT * FROM customers WHERE name LIKE ? OR phone LIKE ? LIMIT 10",
                (like, like)).fetchall()
        else:
            rows = conn.execute("SELECT * FROM customers ORDER BY name").fetchall()
        return rows_to_list(rows)


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
        cur = conn.execute("INSERT INTO customers(name,phone,dob) VALUES(?,?,?)",
                           (c.name, c.phone, c.dob))
        return {"id": cur.lastrowid}
