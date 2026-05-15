"""
PharmaPro — routers/reports.py
GSTR-1, expiry, sales summary, drug-wise, stock value, P&L
"""

from fastapi import APIRouter, Header
from typing import Optional

from backend.database import get_db, rows_to_list
from backend.routers.auth import get_current_user

router = APIRouter(prefix="/api/reports", tags=["reports"])


@router.get("/gstr1")
def gstr1(month: str):
    with get_db() as conn:
        rows = conn.execute("""
            SELECT b.bill_no, b.created_at, b.total, b.gst_amt,
                   b.total - b.gst_amt as taxable, c.name as customer,
                   GROUP_CONCAT(DISTINCT d.hsn) as hsn_codes
            FROM bills b 
            LEFT JOIN customers c ON c.id=b.customer_id
            JOIN bill_items bi ON bi.bill_id=b.id
            JOIN drugs d ON d.id=bi.drug_id
            WHERE strftime('%Y-%m', b.created_at)=?
            GROUP BY b.id
            ORDER BY b.created_at""", (month,)).fetchall()
        return rows_to_list(rows)


@router.get("/expiry")
def expiry_report():
    from datetime import date
    today = date.today().isoformat()
    with get_db() as conn:
        rows = conn.execute("""
            SELECT d.name, d.brand, b.batch_no, b.expiry, b.full_strips,
                   d.tablets_per_strip, d.mrp_per_strip, d.box_id
            FROM batches b JOIN drugs d ON d.id=b.drug_id
            WHERE b.full_strips > 0 OR EXISTS(SELECT 1 FROM trays t WHERE t.batch_id=b.id AND t.closed=0)
            ORDER BY b.expiry""").fetchall()
        return rows_to_list(rows)


@router.get("/sales")
def sales_summary(from_date: str = "", to_date: str = ""):
    from datetime import date
    if not from_date:
        from_date = date.today().replace(day=1).isoformat()
    if not to_date:
        to_date = date.today().isoformat()
    with get_db() as conn:
        rows = conn.execute("""
            SELECT date(b.created_at) as day,
                   COUNT(*) as bill_count,
                   SUM(b.subtotal) as subtotal,
                   SUM(b.discount_amt) as discount,
                   SUM(b.gst_amt) as gst,
                   SUM(b.total) as total,
                   SUM(CASE WHEN b.payment_mode='Cash' THEN b.total ELSE 0 END) as cash,
                   SUM(CASE WHEN b.payment_mode='UPI'  THEN b.total ELSE 0 END) as upi,
                   SUM(CASE WHEN b.payment_mode='Card' THEN b.total ELSE 0 END) as card
            FROM bills b
            WHERE date(b.created_at) BETWEEN ? AND ?
            GROUP BY date(b.created_at)
            ORDER BY day""", (from_date, to_date)).fetchall()
        summary = conn.execute("""
            SELECT COUNT(*) as total_bills,
                   COALESCE(SUM(subtotal),0) as gross,
                   COALESCE(SUM(discount_amt),0) as discount,
                   COALESCE(SUM(gst_amt),0) as gst,
                   COALESCE(SUM(total),0) as net
            FROM bills WHERE date(created_at) BETWEEN ? AND ?""",
            (from_date, to_date)).fetchone()
        return {"rows": rows_to_list(rows), "summary": dict(summary),
                "from_date": from_date, "to_date": to_date}


@router.get("/drugwise")
def drug_wise(from_date: str = "", to_date: str = ""):
    from datetime import date
    if not from_date:
        from_date = date.today().replace(day=1).isoformat()
    if not to_date:
        to_date = date.today().isoformat()
    with get_db() as conn:
        rows = conn.execute("""
            SELECT d.name, d.brand, d.category,
                   SUM(bi.tablets_qty) as tablets_sold,
                   SUM(bi.amount) as revenue,
                   COUNT(DISTINCT bi.bill_id) as bill_count
            FROM bill_items bi
            JOIN drugs d ON d.id=bi.drug_id
            JOIN bills b ON b.id=bi.bill_id
            WHERE date(b.created_at) BETWEEN ? AND ?
            GROUP BY bi.drug_id
            ORDER BY revenue DESC""", (from_date, to_date)).fetchall()
        return rows_to_list(rows)


@router.get("/stock_value")
def stock_value():
    with get_db() as conn:
        rows = conn.execute("""
            SELECT d.name, d.brand, d.category,
              COALESCE(SUM(b.full_strips),0) as full_strips,
              COALESCE(SUM(b.full_strips*d.tablets_per_strip),0) as stock_tablets,
              COALESCE(SUM(b.full_strips * b.cost_per_strip),0) as cost_value,
              COALESCE(SUM(b.full_strips * d.mrp_per_strip),0) as mrp_value
            FROM drugs d LEFT JOIN batches b ON b.drug_id=d.id
            GROUP BY d.id HAVING full_strips > 0
            ORDER BY mrp_value DESC""").fetchall()
        total = conn.execute("""
            SELECT COALESCE(SUM(b.full_strips*b.cost_per_strip),0) as total_cost,
                   COALESCE(SUM(b.full_strips*d.mrp_per_strip),0) as total_mrp
            FROM batches b JOIN drugs d ON d.id=b.drug_id WHERE b.full_strips>0""").fetchone()
        return {"rows": rows_to_list(rows), "total_cost": total["total_cost"], "total_mrp": total["total_mrp"]}


@router.get("/pl")
def profit_loss(from_date: str = "", to_date: str = ""):
    from datetime import date
    if not from_date:
        from_date = date.today().replace(day=1).isoformat()
    if not to_date:
        to_date = date.today().isoformat()
    with get_db() as conn:
        revenue = conn.execute("""
            SELECT COALESCE(SUM(total),0) as net_revenue,
                   COALESCE(SUM(subtotal - discount_amt),0) as taxable
            FROM bills WHERE date(created_at) BETWEEN ? AND ?""",
            (from_date, to_date)).fetchone()
        cogs = conn.execute("""
            SELECT COALESCE(SUM(bi.tablets_qty * (b.cost_per_strip / NULLIF(d.tablets_per_strip,0))),0) as cogs
            FROM bill_items bi
            JOIN drugs d ON d.id=bi.drug_id
            LEFT JOIN batches b ON b.id=bi.batch_id
            JOIN bills bl ON bl.id=bi.bill_id
            WHERE date(bl.created_at) BETWEEN ? AND ?""",
            (from_date, to_date)).fetchone()
        net_rev  = revenue["net_revenue"] or 0
        cogs_val = cogs["cogs"] or 0
        gross_profit = net_rev - cogs_val
        margin_val = (gross_profit / net_rev * 100) if net_rev else 0.0
        margin = float(f"{margin_val:.1f}")
        return {
            "net_revenue": net_rev,
            "cogs": cogs_val,
            "gross_profit": gross_profit,
            "margin_pct": margin,
            "from_date": from_date,
            "to_date": to_date,
        }


@router.get("/schedule_log")
def schedule_log_report(from_date: str = "", to_date: str = ""):
    from datetime import date
    if not from_date:
        from_date = date.today().replace(day=1).isoformat()
    if not to_date:
        to_date = date.today().isoformat()
    with get_db() as conn:
        rows = conn.execute("""
            SELECT bi.tablets_qty, d.name as drug_name, d.brand, d.schedule,
                   b.bill_no, b.created_at as bill_date,
                   b.patient_name, b.doctor, b.rx_no
            FROM bill_items bi
            JOIN drugs d ON d.id=bi.drug_id
            JOIN bills b ON b.id=bi.bill_id
            WHERE d.schedule IN ('H', 'H1', 'X')
              AND date(b.created_at) BETWEEN ? AND ?
            ORDER BY b.created_at DESC""", (from_date, to_date)).fetchall()
        return rows_to_list(rows)


@router.get("/dayclose")
def dayclose_report(date_str: str = ""):
    from datetime import date
    if not date_str:
        date_str = date.today().isoformat()
    with get_db() as conn:
        summary = conn.execute("""
            SELECT COUNT(*) as bill_count,
                   COALESCE(SUM(total),0) as gross_sales,
                   COALESCE(SUM(discount_amt),0) as total_discount,
                   COALESCE(SUM(gst_amt),0) as total_gst,
                   COALESCE(SUM(CASE WHEN payment_mode='Cash'   THEN total ELSE 0 END),0) as cash_sales,
                   COALESCE(SUM(CASE WHEN payment_mode='UPI'    THEN total ELSE 0 END),0) as upi_sales,
                   COALESCE(SUM(CASE WHEN payment_mode='Card'   THEN total ELSE 0 END),0) as card_sales,
                   COALESCE(SUM(CASE WHEN payment_mode='Credit' THEN total ELSE 0 END),0) as credit_sales
            FROM bills WHERE date(created_at)=?""", (date_str,)).fetchone()
        returns = conn.execute("""
            SELECT COUNT(*) as return_count, COALESCE(SUM(total_refund),0) as total_refund
            FROM bill_returns WHERE date(created_at)=?""", (date_str,)).fetchone()
        net_cash = (summary["cash_sales"] or 0) - (returns["total_refund"] or 0)
        return {
            "date": date_str,
            **dict(summary),
            "return_count": returns["return_count"] or 0,
            "total_refunds": returns["total_refund"] or 0,
            "net_cash": round(net_cash, 2),
        }


@router.get("/staff_performance")
def staff_performance(from_date: str = "", to_date: str = ""):
    from datetime import date
    if not from_date:
        from_date = date.today().replace(day=1).isoformat()
    if not to_date:
        to_date = date.today().isoformat()
        
    with get_db() as conn:
        rows = conn.execute("""
            SELECT u.id, u.username, u.name,
                   COUNT(b.id) as bills_count,
                   COALESCE(SUM(b.total), 0) as total_sales,
                   COALESCE(SUM(b.discount_amt), 0) as total_discounts
            FROM users u
            LEFT JOIN bills b ON b.created_by = u.id 
                 AND date(b.created_at) >= ? AND date(b.created_at) <= ?
            GROUP BY u.id
            ORDER BY total_sales DESC
        """, (from_date, to_date)).fetchall()
        return rows_to_list(rows)

