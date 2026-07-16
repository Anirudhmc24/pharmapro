"""
PharmaPro — routers/inventory.py
Inventory view, dashboard, stock log, putaway guide, expiry returns
"""

from datetime import date
from fastapi import APIRouter, Header
from typing import Optional

from backend.database import get_db, row_to_dict, rows_to_list
from backend.models import ExpiryReturnIn
from backend.routers.auth import get_current_user

router = APIRouter(prefix="/api", tags=["inventory"])


@router.get("/dashboard")
def get_dashboard():
    with get_db() as conn:
        today_str = date.today().isoformat()
        m = date.today().month
        y = date.today().year
        month_start = f"{y}-{m:02d}-01"

        # Fetch warning months from shop_config
        warn_row = conn.execute("SELECT value FROM shop_config WHERE key='expiry_warn_months'").fetchone()
        warn_months = int(warn_row["value"]) if warn_row else 3
        
        warn_mo = m + warn_months
        warn_year = y
        while warn_mo > 12:
            warn_mo -= 12
            warn_year += 1
        warn_date = f"{warn_year}-{warn_mo:02d}"

        today_revenue = conn.execute(
            "SELECT COALESCE(SUM(total),0) FROM bills WHERE date(created_at)=?", (today_str,)).fetchone()[0]
        today_bills = conn.execute(
            "SELECT COUNT(*) FROM bills WHERE date(created_at)=?", (today_str,)).fetchone()[0]
        yesterday_revenue = conn.execute(
            "SELECT COALESCE(SUM(total),0) FROM bills WHERE date(created_at)=date('now','-1 day')").fetchone()[0]

        # Weekly totals (Mon–Sun rolling 7 days)
        week_total = conn.execute(
            "SELECT COALESCE(SUM(total),0) FROM bills WHERE date(created_at) >= date('now','-6 days')").fetchone()[0]
        week_bills = conn.execute(
            "SELECT COUNT(*) FROM bills WHERE date(created_at) >= date('now','-6 days')").fetchone()[0]
        last_week_total = conn.execute(
            "SELECT COALESCE(SUM(total),0) FROM bills WHERE date(created_at) BETWEEN date('now','-13 days') AND date('now','-7 days')").fetchone()[0]

        # Monthly totals
        month_total = conn.execute(
            "SELECT COALESCE(SUM(total),0) FROM bills WHERE date(created_at) >= ?", (month_start,)).fetchone()[0]
        month_bills = conn.execute(
            "SELECT COUNT(*) FROM bills WHERE date(created_at) >= ?", (month_start,)).fetchone()[0]
        last_month_total = conn.execute("""
            SELECT COALESCE(SUM(total),0) FROM bills
            WHERE date(created_at) >= date(?,'-1 month') AND date(created_at) < ?""",
            (month_start, month_start)).fetchone()[0]

        expiring = conn.execute(
            "SELECT COUNT(*) FROM batches WHERE expiry<=? AND expiry>=? AND full_strips>0",
            (warn_date, today_str)).fetchone()[0]
        expired = conn.execute(
            "SELECT COUNT(*) FROM batches WHERE expiry<? AND full_strips>0", (today_str,)).fetchone()[0]
        low_stock = conn.execute("""
            SELECT COUNT(*) FROM drugs d WHERE
            (SELECT COALESCE(SUM(b.full_strips*d.tablets_per_strip),0)+
             COALESCE((SELECT SUM(t.tablets_remaining) FROM trays t WHERE t.drug_id=d.id AND t.closed=0),0)
             FROM batches b WHERE b.drug_id=d.id) < d.reorder_level""").fetchone()[0]
        critical_trays = conn.execute("""
            SELECT COUNT(*) FROM trays t, shop_config sc
            WHERE sc.key='broken_strip_alert' AND t.closed=0
            AND t.tablets_remaining <= CAST(sc.value AS INTEGER)""").fetchone()[0]
        total_drugs = conn.execute("SELECT COUNT(*) FROM drugs").fetchone()[0]
        customers   = conn.execute("SELECT COUNT(*) FROM customers").fetchone()[0]
        open_pos    = conn.execute("SELECT COUNT(*) FROM purchase_orders WHERE status='ordered'").fetchone()[0]
        week_rev    = rows_to_list(conn.execute("""
            SELECT date(created_at) as day, SUM(total) as revenue, COUNT(*) as bills
            FROM bills WHERE created_at >= date('now','-6 days')
            GROUP BY date(created_at) ORDER BY day""").fetchall())

        # Reorder alerts
        reorder = rows_to_list(conn.execute("""
            SELECT d.id, d.name, d.brand, d.reorder_level, d.box_id,
              COALESCE(SUM(b.full_strips*d.tablets_per_strip),0)+
              COALESCE((SELECT SUM(t.tablets_remaining) FROM trays t WHERE t.drug_id=d.id AND t.closed=0),0)
              AS stock_tablets,
              COALESCE((SELECT SUM(bi.tablets_qty) FROM bill_items bi JOIN bills bl ON bl.id=bi.bill_id
                        WHERE bi.drug_id=d.id AND date(bl.created_at)>=date('now','-30 days')),0) as sold_30d,
              d.mrp_per_strip, d.tablets_per_strip
            FROM drugs d LEFT JOIN batches b ON b.drug_id=d.id
            GROUP BY d.id
            HAVING stock_tablets < d.reorder_level
            ORDER BY stock_tablets ASC LIMIT 8""").fetchall())

        near_expiry = rows_to_list(conn.execute("""
            SELECT d.id as drug_id, d.name, d.brand, b.batch_no, b.expiry, b.full_strips, d.box_id
            FROM batches b JOIN drugs d ON d.id=b.drug_id
            WHERE b.expiry <= ? AND (b.full_strips > 0 OR EXISTS(SELECT 1 FROM trays t WHERE t.batch_id=b.id AND t.closed=0))
            ORDER BY b.expiry ASC LIMIT 8""", (warn_date,)).fetchall())

        # Daily reorder alerts (items sold today)
        daily_reorder = rows_to_list(conn.execute("""
            SELECT d.id, d.name, d.brand, d.box_id,
              COALESCE(SUM(b.full_strips*d.tablets_per_strip),0)+
              COALESCE((SELECT SUM(t.tablets_remaining) FROM trays t WHERE t.drug_id=d.id AND t.closed=0),0)
              AS stock_tablets,
              COALESCE((SELECT SUM(bi.tablets_qty) FROM bill_items bi JOIN bills bl ON bl.id=bi.bill_id
                        WHERE bi.drug_id=d.id AND date(bl.created_at)=?),0) as sold_today,
              d.mrp_per_strip, d.tablets_per_strip
            FROM drugs d LEFT JOIN batches b ON b.drug_id=d.id
            WHERE d.id IN (
                SELECT DISTINCT bi.drug_id
                FROM bill_items bi JOIN bills bl ON bl.id=bi.bill_id
                WHERE date(bl.created_at)=?
            )
            GROUP BY d.id
            ORDER BY d.name ASC""", (today_str, today_str)).fetchall())

        return {
            "today_revenue": today_revenue, "today_bills": today_bills,
            "yesterday_revenue": yesterday_revenue,
            "week_total": week_total, "week_bills": week_bills,
            "last_week_total": last_week_total,
            "month_total": month_total, "month_bills": month_bills,
            "last_month_total": last_month_total,
            "expiring": expiring, "expired": expired,
            "low_stock": low_stock, "critical_trays": critical_trays,
            "total_drugs": total_drugs, "customers": customers,
            "open_pos": open_pos,
            "week_revenue": week_rev,
            "reorder_alerts": reorder,
            "near_expiry_alerts": near_expiry,
            "daily_reorder_alerts": daily_reorder,
        }


@router.get("/inventory")
def get_inventory():
    with get_db() as conn:
        rows = conn.execute("""
            SELECT d.*,
              COALESCE(SUM(b.full_strips),0) as full_strips,
              COALESCE(SUM(b.full_strips * d.tablets_per_strip),0) +
              COALESCE((SELECT SUM(t.tablets_remaining) FROM trays t WHERE t.drug_id=d.id AND t.closed=0),0)
              AS stock_tablets,
              (SELECT MIN(b2.expiry) FROM batches b2 WHERE b2.drug_id=d.id AND b2.full_strips>0) as nearest_expiry,
              (SELECT COUNT(*) FROM trays t2 WHERE t2.drug_id=d.id AND t2.closed=0) as open_trays
            FROM drugs d LEFT JOIN batches b ON b.drug_id=d.id
            GROUP BY d.id ORDER BY d.name""").fetchall()
        return rows_to_list(rows)


@router.post("/putaway/guide")
def putaway_guide(items: list):
    with get_db() as conn:
        result = []
        for item in items:
            drug_id = item.get("drug_id")
            if not drug_id:
                continue
            drug = row_to_dict(conn.execute("SELECT * FROM drugs WHERE id=?", (drug_id,)).fetchone())
            if not drug:
                continue
            open_trays = rows_to_list(conn.execute("""
                SELECT t.*, b.expiry FROM trays t JOIN batches b ON b.id=t.batch_id
                WHERE t.drug_id=? AND t.closed=0 ORDER BY t.tablets_remaining ASC""", (drug_id,)).fetchall())
            path = ""
            box_id = drug.get("box_id")
            if box_id:
                box_info = conn.execute("""
                    SELECT f.name as f_name, c.name as c_name, b.name as b_name
                    FROM loc_boxes b
                    JOIN loc_compartments c ON c.id=b.compartment_id
                    JOIN loc_fixtures f ON f.id=c.fixture_id
                    WHERE b.id=?
                """, (box_id,)).fetchone()
                if box_info:
                    path = f"{box_info['f_name']} > {box_info['c_name']} > {box_info['b_name']}"
                    
            result.append({
                "drug": drug,
                "incoming_strips": item.get("strips", 1),
                "batch_no": item.get("batch_no", ""),
                "expiry": item.get("expiry", ""),
                "open_trays": open_trays,
                "suggested_location": path,
            })
        return result


@router.get("/drugs/{drug_id}/locate")
def locate_drug(drug_id: int):
    with get_db() as conn:
        drug = conn.execute("SELECT box_id FROM drugs WHERE id=?", (drug_id,)).fetchone()
        if not drug or not drug["box_id"]:
            return {"found": False}
        
        info = conn.execute("""
            SELECT f.name as f_name, f.x_pos, f.y_pos, f.width, f.height, 
                   c.name as c_name, b.name as b_name
            FROM loc_boxes b
            JOIN loc_compartments c ON c.id=b.compartment_id
            JOIN loc_fixtures f ON f.id=c.fixture_id
            WHERE b.id=?
        """, (drug["box_id"],)).fetchone()
        
        if not info:
             return {"found": False}
             
        return {
            "found": True,
            "path": f"{info['f_name']} > {info['c_name']} > {info['b_name']}",
            "x": info["x_pos"],
            "y": info["y_pos"],
            "fixture_name": info["f_name"]
        }



@router.get("/expired")
def get_expired_stock():
    with get_db() as conn:
        today_str = date.today().isoformat()
        m = date.today().month
        y = date.today().year
        warn_mo   = (m + 3 - 1) % 12 + 1
        warn_year = y + (1 if m > 9 else 0)
        warn_date = f"{warn_year}-{warn_mo:02d}"

        rows = conn.execute("""
            SELECT b.*, d.name as drug_name, d.brand, d.mrp_per_strip, d.supplier_id as default_supplier
            FROM batches b
            JOIN drugs d ON d.id=b.drug_id
            WHERE b.expiry <= ? AND b.full_strips > 0
            ORDER BY b.expiry ASC
        """, (warn_date,)).fetchall()
        return rows_to_list(rows)


@router.get("/expiry_returns")
def get_expiry_returns():
    with get_db() as conn:
        rows = conn.execute("""
            SELECT er.*, d.name as drug_name, d.brand, b.batch_no, b.expiry, s.name as supplier_name
            FROM expiry_returns er
            JOIN drugs d ON d.id=er.drug_id
            LEFT JOIN batches b ON b.id=er.batch_id
            LEFT JOIN suppliers s ON s.id=er.supplier_id
            ORDER BY er.created_at DESC LIMIT 100""").fetchall()
        return rows_to_list(rows)


@router.post("/expiry_returns")
def add_expiry_return(body: ExpiryReturnIn, x_token: Optional[str] = Header(default=None)):
    get_current_user(x_token)
    with get_db() as conn:
        conn.execute("""
            INSERT INTO expiry_returns(drug_id,batch_id,supplier_id,strips_returned,reason)
            VALUES(?,?,?,?,?)""",
            (body.drug_id, body.batch_id, body.supplier_id, body.strips_returned, body.reason))
        # Deduct from batch
        conn.execute("UPDATE batches SET full_strips = MAX(0, full_strips-?) WHERE id=?",
                     (body.strips_returned, body.batch_id))
        conn.execute("INSERT INTO stock_log(drug_id,batch_id,action,qty_change,note) VALUES(?,?,?,?,?)",
                     (body.drug_id, body.batch_id, "return", -body.strips_returned,
                      f"Expiry return: {body.strips_returned} strips"))
    return {"ok": True}


from pydantic import BaseModel
class AdjustIn(BaseModel):
    drug_id: int; batch_id: int; action: str; qty_change: int; note: str

@router.post("/adjust")
def adjust_stock(body: AdjustIn, x_token: Optional[str] = Header(default=None)):
    get_current_user(x_token)
    with get_db() as conn:
        conn.execute("UPDATE batches SET full_strips = MAX(0, full_strips + ?) WHERE id = ?",
                     (body.qty_change, body.batch_id))
        conn.execute("INSERT INTO stock_log(drug_id,batch_id,action,qty_change,note) VALUES(?,?,?,?,?)",
                     (body.drug_id, body.batch_id, body.action, body.qty_change, body.note))
    return {"ok": True}
