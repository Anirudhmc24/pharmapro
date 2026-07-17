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
        bills_rows = conn.execute("""
            SELECT date(created_at) as day,
                   COUNT(*) as bill_count,
                   SUM(subtotal) as subtotal,
                   SUM(discount_amt) as discount,
                   SUM(gst_amt) as gst,
                   SUM(total) as total,
                   SUM(CASE WHEN payment_mode='Cash' THEN total ELSE 0 END) as cash,
                   SUM(CASE WHEN payment_mode='UPI'  THEN total ELSE 0 END) as upi,
                   SUM(CASE WHEN payment_mode='Card' THEN total ELSE 0 END) as card
            FROM bills
            WHERE date(created_at) BETWEEN ? AND ?
            GROUP BY date(created_at)""", (from_date, to_date)).fetchall()
            
        returns_rows = conn.execute("""
            SELECT date(created_at) as day,
                   COUNT(*) as return_count,
                   SUM(total_refund) as total_refund,
                   SUM(CASE WHEN refund_mode='Cash' THEN total_refund ELSE 0 END) as cash_refund,
                   SUM(CASE WHEN refund_mode='UPI'  THEN total_refund ELSE 0 END) as upi_refund,
                   SUM(CASE WHEN refund_mode='Card' THEN total_refund ELSE 0 END) as card_refund
            FROM bill_returns
            WHERE date(created_at) BETWEEN ? AND ?
            GROUP BY date(created_at)""", (from_date, to_date)).fetchall()
            
        days_data = {}
        for r in bills_rows:
            day = r["day"]
            days_data[day] = {
                "day": day,
                "bill_count": r["bill_count"],
                "subtotal": r["subtotal"] or 0.0,
                "discount": r["discount"] or 0.0,
                "gst": r["gst"] or 0.0,
                "total": r["total"] or 0.0,
                "cash": r["cash"] or 0.0,
                "upi": r["upi"] or 0.0,
                "card": r["card"] or 0.0
            }
        for r in returns_rows:
            day = r["day"]
            if day not in days_data:
                days_data[day] = {
                    "day": day,
                    "bill_count": 0,
                    "subtotal": 0.0,
                    "discount": 0.0,
                    "gst": 0.0,
                    "total": 0.0,
                    "cash": 0.0,
                    "upi": 0.0,
                    "card": 0.0
                }
            refund = r["total_refund"] or 0.0
            days_data[day]["subtotal"] = max(0.0, days_data[day]["subtotal"] - refund / 1.12)
            days_data[day]["gst"] = max(0.0, days_data[day]["gst"] - (refund - (refund / 1.12)))
            days_data[day]["total"] = max(0.0, days_data[day]["total"] - refund)
            days_data[day]["cash"] = max(0.0, days_data[day]["cash"] - (r["cash_refund"] or 0.0))
            days_data[day]["upi"] = max(0.0, days_data[day]["upi"] - (r["upi_refund"] or 0.0))
            days_data[day]["card"] = max(0.0, days_data[day]["card"] - (r["card_refund"] or 0.0))
            
        rows_list = sorted(days_data.values(), key=lambda x: x["day"])
        
        summary = conn.execute("""
            SELECT COUNT(*) as total_bills,
                   COALESCE(SUM(subtotal),0) as gross,
                   COALESCE(SUM(discount_amt),0) as discount,
                   COALESCE(SUM(gst_amt),0) as gst,
                   COALESCE(SUM(total),0) as net
            FROM bills WHERE date(created_at) BETWEEN ? AND ?""",
            (from_date, to_date)).fetchone()
            
        ret_summary = conn.execute("""
            SELECT COALESCE(SUM(total_refund),0) as total_refund
            FROM bill_returns WHERE date(created_at) BETWEEN ? AND ?""",
            (from_date, to_date)).fetchone()
            
        refund_total = ret_summary["total_refund"] or 0.0
        gross_val = max(0.0, (summary["gross"] or 0) - refund_total / 1.12)
        gst_val = max(0.0, (summary["gst"] or 0) - (refund_total - refund_total / 1.12))
        net_val = max(0.0, (summary["net"] or 0) - refund_total)
        
        summary_dict = {
            "total_bills": summary["total_bills"] or 0,
            "gross": round(gross_val, 2),
            "discount": round(summary["discount"] or 0, 2),
            "gst": round(gst_val, 2),
            "net": round(net_val, 2)
        }
        return {"rows": rows_list, "summary": summary_dict,
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
            SELECT drug_name as name, brand, category,
                   SUM(qty) as tablets_sold,
                   SUM(amt) as revenue,
                   COUNT(DISTINCT bill_id) as bill_count
            FROM (
                SELECT d.name as drug_name, d.brand, d.category,
                       bi.tablets_qty as qty,
                       bi.amount as amt,
                       bi.bill_id
                FROM bill_items bi
                JOIN drugs d ON d.id=bi.drug_id
                JOIN bills b ON b.id=bi.bill_id
                WHERE date(b.created_at) BETWEEN ? AND ?
                
                UNION ALL
                
                SELECT d.name as drug_name, d.brand, d.category,
                       -bri.tablets_qty as qty,
                       -bri.amount as amt,
                       br.bill_id
                FROM bill_return_items bri
                JOIN bill_returns br ON br.id=bri.return_id
                JOIN drugs d ON d.id=bri.drug_id
                WHERE date(br.created_at) BETWEEN ? AND ?
            )
            GROUP BY drug_name, brand, category
            ORDER BY revenue DESC""", (from_date, to_date, from_date, to_date)).fetchall()
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
            
        returns_summary = conn.execute("""
            SELECT COALESCE(SUM(total_refund),0) as total_refund
            FROM bill_returns WHERE date(created_at) BETWEEN ? AND ?""",
            (from_date, to_date)).fetchone()
            
        net_rev = (revenue["net_revenue"] or 0) - (returns_summary["total_refund"] or 0)
        ratio = (revenue["taxable"] / revenue["net_revenue"]) if revenue["net_revenue"] else 1.0
        taxable_val = (revenue["taxable"] or 0) - (returns_summary["total_refund"] or 0) * ratio
        
        cogs = conn.execute("""
            SELECT COALESCE(SUM(qty * cost_per_tab),0) as cogs
            FROM (
                SELECT bi.tablets_qty as qty,
                       (b.cost_per_strip / NULLIF(d.tablets_per_strip,0)) as cost_per_tab
                FROM bill_items bi
                JOIN drugs d ON d.id=bi.drug_id
                LEFT JOIN batches b ON b.id=bi.batch_id
                JOIN bills bl ON bl.id=bi.bill_id
                WHERE date(bl.created_at) BETWEEN ? AND ?
                
                UNION ALL
                
                SELECT -bri.tablets_qty as qty,
                       (b.cost_per_strip / NULLIF(d.tablets_per_strip,0)) as cost_per_tab
                FROM bill_return_items bri
                JOIN bill_returns br ON br.id=bri.return_id
                JOIN drugs d ON d.id=bri.drug_id
                LEFT JOIN batches b ON b.id=bri.batch_id
                WHERE date(br.created_at) BETWEEN ? AND ?
            )""", (from_date, to_date, from_date, to_date)).fetchone()
            
        cogs_val = cogs["cogs"] or 0.0
        gross_profit = net_rev - cogs_val
        margin_val = (gross_profit / net_rev * 100) if net_rev else 0.0
        margin = float(f"{margin_val:.1f}")
        return {
            "net_revenue": round(net_rev, 2),
            "cogs": round(cogs_val, 2),
            "gross_profit": round(gross_profit, 2),
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


@router.get("/non_moving")
def non_moving_report(days: int = 90):
    from datetime import date, timedelta
    cutoff_date = (date.today() - timedelta(days=days)).isoformat()
    
    with get_db() as conn:
        rows = conn.execute("""
            SELECT d.id, d.name, d.brand, d.category, d.composition, d.box_id, d.mrp_per_strip, d.mrp_per_tablet,
                   COALESCE((
                       SELECT SUM(b.full_strips) FROM batches b WHERE b.drug_id = d.id AND b.full_strips > 0
                   ), 0) as full_strips,
                   COALESCE((
                       SELECT SUM(b.full_strips * d.tablets_per_strip) FROM batches b WHERE b.drug_id = d.id AND b.full_strips > 0
                   ), 0) +
                   COALESCE((
                       SELECT SUM(t.tablets_remaining) FROM trays t WHERE t.drug_id = d.id AND t.closed = 0
                   ), 0) as stock_tablets,
                   COALESCE((
                       SELECT MAX(bl.created_at)
                       FROM bill_items bi
                       JOIN bills bl ON bl.id = bi.bill_id
                       WHERE bi.drug_id = d.id
                   ), '') as last_sold_date,
                   COALESCE((
                       SELECT MAX(b2.received_on)
                       FROM batches b2
                       WHERE b2.drug_id = d.id
                   ), '') as latest_received_on
            FROM drugs d
            WHERE (
                EXISTS(SELECT 1 FROM batches b3 WHERE b3.drug_id = d.id AND b3.full_strips > 0)
                OR EXISTS(SELECT 1 FROM trays t2 WHERE t2.drug_id = d.id AND t2.closed = 0 AND t2.tablets_remaining > 0)
            )
            GROUP BY d.id
            HAVING (last_sold_date = '' OR date(last_sold_date) < date(?))
               AND (latest_received_on = '' OR date(latest_received_on) < date(?))
            ORDER BY last_sold_date ASC, d.name ASC
        """, (cutoff_date, cutoff_date)).fetchall()
        
        return rows_to_list(rows)


