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


@router.delete("/{supplier_id}")
def delete_supplier(supplier_id: int, x_token: Optional[str] = Header(default=None)):
    from fastapi import HTTPException
    get_current_user(x_token)
    with get_db() as conn:
        has_pos = conn.execute("SELECT 1 FROM purchase_orders WHERE supplier_id=?", (supplier_id,)).fetchone()
        if has_pos:
            raise HTTPException(400, "Cannot delete supplier with transaction history (Purchase Orders exist).")
            
        has_returns = conn.execute("SELECT 1 FROM expiry_returns WHERE supplier_id=?", (supplier_id,)).fetchone()
        if has_returns:
            raise HTTPException(400, "Cannot delete supplier with transaction history (Expiry Returns exist).")
            
        conn.execute("DELETE FROM suppliers WHERE id=?", (supplier_id,))
    return {"ok": True}


from datetime import date
from fastapi import HTTPException
from backend.models import SupplierReturnIn
from backend.database import row_to_dict

def next_supplier_return_no(conn) -> str:
    today = date.today().strftime("%Y%m%d")
    n = conn.execute("SELECT COUNT(*) FROM supplier_returns WHERE return_no LIKE ?",
                     (f"SRN{today}%",)).fetchone()[0]
    return f"SRN{today}{n+1:04d}"


@router.post("/returns")
def create_supplier_return(body: SupplierReturnIn, x_token: Optional[str] = Header(default=None)):
    user = get_current_user(x_token)
    with get_db() as conn:
        sup = conn.execute("SELECT * FROM suppliers WHERE id=?", (body.supplier_id,)).fetchone()
        if not sup:
            raise HTTPException(status_code=404, detail="Supplier not found")
            
        return_no = next_supplier_return_no(conn)
        total_amount = 0.0
        
        cur = conn.execute("""
            INSERT INTO supplier_returns(return_no, supplier_id, total_amount, reason, notes, created_by)
            VALUES(?,?,?,?,?,?)
        """, (return_no, body.supplier_id, 0.0, body.reason, body.notes, user["id"]))
        return_id = cur.lastrowid
        
        for item in body.items:
            amount = round(item.strips * item.unit_cost, 2)
            total_amount += amount
            
            conn.execute("""
                INSERT INTO supplier_return_items(return_id, drug_id, batch_id, strips, unit_cost, amount, reason)
                VALUES(?,?,?,?,?,?,?)
            """, (return_id, item.drug_id, item.batch_id, item.strips, item.unit_cost, amount, item.reason or body.reason))
            
            # Deduct returned full_strips from inventory batch
            if item.batch_id:
                conn.execute("UPDATE batches SET full_strips = MAX(0, full_strips - ?) WHERE id=?", (item.strips, item.batch_id))
            
            # Record in expiry_returns for historical tracking
            conn.execute("""
                INSERT INTO expiry_returns(drug_id, batch_id, supplier_id, strips_returned, reason)
                VALUES(?,?,?,?,?)
            """, (item.drug_id, item.batch_id, body.supplier_id, item.strips, item.reason or body.reason or "supplier_return"))
            
            # Record in stock log
            conn.execute("""
                INSERT INTO stock_log(drug_id, batch_id, action, qty_change, note)
                VALUES(?,?,?,?,?)
            """, (item.drug_id, item.batch_id, "supplier_return", -item.strips, f"Supplier Return {return_no}"))
            
        # Update total amount & adjust supplier due balance
        conn.execute("UPDATE supplier_returns SET total_amount=? WHERE id=?", (total_amount, return_id))
        conn.execute("UPDATE suppliers SET due = MAX(0, COALESCE(due, 0) - ?) WHERE id=?", (total_amount, body.supplier_id))
        
        return {"ok": True, "id": return_id, "return_no": return_no, "total_amount": total_amount}


@router.get("/returns")
def list_supplier_returns(limit: int = 50):
    with get_db() as conn:
        rows = conn.execute("""
            SELECT sr.*, s.name as supplier_name, u.display_name as created_by_name
            FROM supplier_returns sr
            JOIN suppliers s ON s.id = sr.supplier_id
            LEFT JOIN users u ON u.id = sr.created_by
            ORDER BY sr.created_at DESC LIMIT ?
        """, (limit,)).fetchall()
        return rows_to_list(rows)


@router.get("/returns/{return_id}")
def get_supplier_return(return_id: int):
    with get_db() as conn:
        sr = row_to_dict(conn.execute("""
            SELECT sr.*, s.name as supplier_name, s.contact, s.phone, s.email, s.gstin as supplier_gstin
            FROM supplier_returns sr JOIN suppliers s ON s.id = sr.supplier_id
            WHERE sr.id=?
        """, (return_id,)).fetchone())
        if not sr:
            raise HTTPException(status_code=404, detail="Supplier return not found")
        sr["items"] = rows_to_list(conn.execute("""
            SELECT sri.*, d.name as drug_name, d.brand, d.hsn, b.batch_no, b.expiry
            FROM supplier_return_items sri
            JOIN drugs d ON d.id = sri.drug_id
            LEFT JOIN batches b ON b.id = sri.batch_id
            WHERE sri.return_id=?
        """, (return_id,)).fetchall())
        return sr


@router.get("/returns/{return_id}/pdf")
def get_supplier_return_pdf(return_id: int, download: bool = False):
    from fastapi.responses import Response
    from fpdf import FPDF
    
    with get_db() as conn:
        sr_row = conn.execute("""
            SELECT sr.*, s.name as supplier_name, s.contact, s.phone as supplier_phone, s.email as supplier_email, s.gstin as supplier_gstin
            FROM supplier_returns sr JOIN suppliers s ON s.id = sr.supplier_id
            WHERE sr.id=?
        """, (return_id,)).fetchone()
        if not sr_row:
            raise HTTPException(status_code=404, detail="Supplier return not found")
        sr = dict(sr_row)
        
        items_rows = conn.execute("""
            SELECT sri.*, d.name as drug_name, d.brand, d.hsn, b.batch_no, b.expiry
            FROM supplier_return_items sri
            JOIN drugs d ON d.id = sri.drug_id
            LEFT JOIN batches b ON b.id = sri.batch_id
            WHERE sri.return_id=?
        """, (return_id,)).fetchall()
        items = [dict(r) for r in items_rows]
        
        config_rows = conn.execute("SELECT key, value FROM shop_config").fetchall()
        shop_config = {r["key"]: r["value"] for r in config_rows}

    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 16)
    shop_name = shop_config.get("name", "Shrivari Medicals")
    pdf.cell(0, 8, shop_name, new_x="LMARGIN", new_y="NEXT", align="C")
    
    pdf.set_font("Helvetica", "", 10)
    pdf.cell(0, 5, shop_config.get("address", "123 Main St, Bangalore"), new_x="LMARGIN", new_y="NEXT", align="C")
    
    details = []
    phone = shop_config.get("phone", "")
    gstin = shop_config.get("gstin", "")
    if phone: details.append(f"Phone: {phone}")
    if gstin: details.append(f"GSTIN: {gstin}")
    if details:
        pdf.cell(0, 5, " | ".join(details), new_x="LMARGIN", new_y="NEXT", align="C")
        
    pdf.ln(4)
    pdf.line(10, pdf.get_y(), 200, pdf.get_y())
    pdf.ln(4)
    
    pdf.set_font("Helvetica", "B", 14)
    pdf.cell(0, 8, "PURCHASE RETURN INVOICE / DEBIT NOTE", new_x="LMARGIN", new_y="NEXT", align="C")
    pdf.ln(2)
    
    pdf.set_font("Helvetica", "B", 10)
    pdf.cell(100, 6, f"Return Ref No: {sr['return_no']}", new_x="RIGHT", new_y="TOP")
    pdf.set_font("Helvetica", "", 10)
    pdf.cell(90, 6, f"Date: {sr['created_at']}", new_x="LMARGIN", new_y="NEXT", align="R")
    
    pdf.set_font("Helvetica", "B", 10)
    pdf.cell(100, 6, f"To Supplier/Dealer: {sr['supplier_name']}", new_x="RIGHT", new_y="TOP")
    sup_phone = sr.get("supplier_phone") or ""
    pdf.cell(90, 6, f"Contact / Phone: {sup_phone}", new_x="LMARGIN", new_y="NEXT", align="R")
    
    if sr.get("supplier_gstin"):
        pdf.cell(100, 6, f"Supplier GSTIN: {sr['supplier_gstin']}", new_x="LMARGIN", new_y="NEXT")
    if sr.get("reason"):
        pdf.cell(100, 6, f"Return Reason: {sr['reason']}", new_x="LMARGIN", new_y="NEXT")
        
    pdf.ln(4)
    pdf.set_fill_color(240, 240, 240)
    pdf.set_font("Helvetica", "B", 9)
    pdf.cell(75, 7, " Item/Drug Description", border=1, fill=True)
    pdf.cell(25, 7, "Batch", border=1, fill=True, align="C")
    pdf.cell(20, 7, "Expiry", border=1, fill=True, align="C")
    pdf.cell(20, 7, "Strips", border=1, fill=True, align="R")
    pdf.cell(25, 7, "Cost/Strip", border=1, fill=True, align="R")
    pdf.cell(25, 7, "Total (Rs)", border=1, fill=True, align="R")
    pdf.ln()
    
    pdf.set_font("Helvetica", "", 9)
    for item in items:
        name = item.get("drug_name", "Unknown Item")
        if len(name) > 35:
            name = name[:32] + "..."
        pdf.cell(75, 6, " " + name, border=1)
        pdf.cell(25, 6, item.get("batch_no", "") or "—", border=1, align="C")
        pdf.cell(20, 6, item.get("expiry", "") or "—", border=1, align="C")
        pdf.cell(20, 6, str(item.get("strips", 0)), border=1, align="R")
        pdf.cell(25, 6, f"Rs.{item.get('unit_cost', 0.0):.2f}", border=1, align="R")
        pdf.cell(25, 6, f"Rs.{item.get('amount', 0.0):.2f}", border=1, align="R")
        pdf.ln()
        
    pdf.ln(3)
    pdf.set_font("Helvetica", "B", 11)
    pdf.cell(130)
    pdf.cell(35, 8, "Total Debit Amount:", align="R")
    pdf.cell(25, 8, f"Rs.{sr.get('total_amount', 0.0):.2f}", align="R")
    pdf.ln()
    
    pdf.ln(15)
    pdf.set_font("Helvetica", "I", 9)
    pdf.cell(95, 6, "Supplier / Dealer Acknowledgement Signature", align="L")
    pdf.cell(95, 6, "Authorized Pharmacy Stamp & Sign", align="R")
    
    pdf_bytes = pdf.output()
    if isinstance(pdf_bytes, str):
        pdf_bytes = pdf_bytes.encode('latin1')
    else:
        pdf_bytes = bytes(pdf_bytes)
        
    disposition = "attachment" if download else "inline"
    return Response(content=pdf_bytes, media_type="application/pdf", headers={
        "Content-Disposition": f"{disposition}; filename=SupplierReturn_{sr['return_no']}.pdf"
    })
