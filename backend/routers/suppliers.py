"""
PharmaPro — routers/suppliers.py
Supplier CRUD
"""

from fastapi import APIRouter, Header
from typing import Optional

from backend.database import get_db, rows_to_list
from backend.models import SupplierIn
from backend.routers.auth import get_current_user

router = APIRouter(prefix="/api/suppliers", tags=["suppliers"])


@router.get("")
def get_suppliers():
    with get_db() as conn:
        return rows_to_list(conn.execute("SELECT * FROM suppliers ORDER BY name").fetchall())


@router.post("")
def add_supplier(s: SupplierIn, x_token: Optional[str] = Header(default=None)):
    get_current_user(x_token)
    with get_db() as conn:
        cur = conn.execute(
            "INSERT INTO suppliers(name,contact,phone,email,gstin) VALUES(?,?,?,?,?)",
            (s.name, s.contact, s.phone, s.email, s.gstin))
        return {"id": cur.lastrowid}


from pydantic import BaseModel
class PaymentIn(BaseModel):
    amount: float

@router.post("/{supplier_id}/pay")
def pay_supplier(supplier_id: int, p: PaymentIn, x_token: Optional[str] = Header(default=None)):
    get_current_user(x_token)
    with get_db() as conn:
        conn.execute("UPDATE suppliers SET due = COALESCE(due, 0) - ? WHERE id=?", (p.amount, supplier_id))
    return {"ok": True}
