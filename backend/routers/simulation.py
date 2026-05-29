"""
PharmaPro — routers/simulation.py
Custom Bill Generation without stock deduction
"""

from datetime import date, timedelta
import random
from fastapi import APIRouter, HTTPException, Header
from typing import Optional
from pydantic import BaseModel

from backend.database import get_db, row_to_dict, rows_to_list
from backend.routers.auth import get_current_user

router = APIRouter(prefix="/api/simulation", tags=["simulation"])

class GenerateBillsIn(BaseModel):
    month: str  # YYYY-MM
    target_amount: float

def get_days_in_month(year: int, month: int):
    import calendar
    return calendar.monthrange(year, month)[1]

def next_bill_no(conn, date_str: str) -> str:
    # date_str is YYYY-MM-DD
    day_prefix = date_str.replace("-", "")
    n = conn.execute("SELECT COUNT(*) FROM bills WHERE bill_no LIKE ?",
                     (f"B{day_prefix}%",)).fetchone()[0]
    return f"B{day_prefix}{n+1:04d}"

@router.post("/generate_bills")
def generate_bills(data: GenerateBillsIn, x_token: Optional[str] = Header(default=None)):
    user = get_current_user(x_token)
    
    try:
        year, month = map(int, data.month.split("-"))
    except ValueError:
        raise HTTPException(400, "Invalid month format. Use YYYY-MM")
        
    days = get_days_in_month(year, month)
    
    with get_db() as conn:
        # Get all drugs with MRP > 0
        drugs = rows_to_list(conn.execute("SELECT id, mrp_per_tablet, name FROM drugs WHERE mrp_per_tablet > 0").fetchall())
        if not drugs:
            raise HTTPException(400, "No drugs found with MRP > 0 in database.")
            
        cfg_row = conn.execute("SELECT value FROM shop_config WHERE key='gst_slab'").fetchone()
        gst_slab = float(cfg_row["value"] if cfg_row else 12)
        
        generated_amount = 0.0
        bills_created = 0
        
        while generated_amount < data.target_amount:
            # Pick a random day
            day = random.randint(1, days)
            bill_date = f"{year}-{month:02d}-{day:02d}"
            
            # Create a bill
            bill_no = next_bill_no(conn, bill_date)
            
            # Pick random items (1 to 5)
            num_items = random.randint(1, 5)
            selected_drugs = random.sample(drugs, min(num_items, len(drugs)))
            
            items = []
            subtotal = 0.0
            
            for drug in selected_drugs:
                qty = random.randint(1, 30)  # Random quantity
                amount = qty * drug["mrp_per_tablet"]
                items.append({
                    "drug_id": drug["id"],
                    "qty": qty,
                    "mrp": drug["mrp_per_tablet"],
                    "amount": amount
                })
                subtotal += amount
                
            gst_amt = round(subtotal * gst_slab / 100.0, 2)
            total = round(subtotal + gst_amt, 2)
            
            # Check if this bill exceeds target by too much
            if generated_amount + total > data.target_amount + 500: # Allow small overshoot
                # Try to scale down the last bill or just stop if close enough
                if data.target_amount - generated_amount < 10:
                    break
                # Scale down items
                # For simplicity, we just skip this bill and try again with fewer items or smaller qty
                continue
                
            # Insert bill
            cur = conn.execute("""
                INSERT INTO bills(bill_no, customer_id, patient_name, subtotal, gst_amt, total, payment_mode, created_by, created_at)
                VALUES(?,?,?,?,?,?,?,?,?)""",
                (bill_no, None, "Walk-in", subtotal, gst_amt, total, "Cash", user["id"], f"{bill_date} 12:00:00"))
            bill_id = cur.lastrowid
            
            # Insert bill items
            for item in items:
                conn.execute("""
                    INSERT INTO bill_items(bill_id, drug_id, tablets_qty, mrp_per_tab, amount)
                    VALUES(?,?,?,?,?)""",
                    (bill_id, item["drug_id"], item["qty"], item["mrp"], item["amount"]))
                    
            generated_amount += total
            bills_created += 1
            
            # If we are very close, stop
            if abs(generated_amount - data.target_amount) < 10:
                break
                
        return {
            "success": True,
            "bills_created": bills_created,
            "total_amount": generated_amount,
            "target_amount": data.target_amount
        }
