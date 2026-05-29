"""
PharmaPro — routers/scan.py
Gemini Vision scanning for strips and challans
"""

import json, urllib.request
from fastapi import APIRouter

from backend.models import ScanIn

router = APIRouter(prefix="/api", tags=["scan"])

GEMINI_API_KEY = ""   # ← paste your key here e.g. "AIzaSy..."
GEMINI_MODEL   = "gemini-2.5-flash"


def get_gemini_key() -> str:
    # 1. Try environment variable
    import os
    env_key = os.environ.get("GEMINI_API_KEY")
    if env_key:
        return env_key
    
    # 2. Try database configuration
    from backend.database import get_db
    try:
        with get_db() as conn:
            row = conn.execute("SELECT value FROM shop_config WHERE key='gemini_api_key'").fetchone()
            if row and row["value"]:
                return row["value"]
    except Exception:
        pass
        
    # 3. Fallback to hardcoded module variable
    return GEMINI_API_KEY


def call_gemini(prompt: str, image_b64: str, mime: str = "image/jpeg") -> str:
    key = get_gemini_key()
    if not key:
        raise ValueError("no_key")
    url = (f"https://generativelanguage.googleapis.com/v1beta/models/"
           f"{GEMINI_MODEL}:generateContent?key={key}")
    payload = json.dumps({
        "contents": [{"parts": [
            {"text": prompt},
            {"inline_data": {"mime_type": mime, "data": image_b64}}
        ]}],
        "generationConfig": {
            "temperature": 0.1,
            "maxOutputTokens": 1024,
            "responseMimeType": "application/json"
        }
    }).encode()
    req = urllib.request.Request(url, data=payload,
          headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=30) as r:
        resp = json.loads(r.read())
    return resp["candidates"][0]["content"]["parts"][0]["text"]


@router.post("/scan")
def scan_image(body: ScanIn):
    if not get_gemini_key():
        return {"ok": False, "error": "no_key",
                "message": "Add your Gemini API key in Settings or set GEMINI_API_KEY environment variable."}
    if body.mode == "strip":
        prompt = (
            "Look at this medicine strip/blister pack photo.\n"
            "Extract: drug_name (name + strength), batch_no, expiry (YYYY-MM), mrp (number).\n"
            "Respond ONLY with JSON, matching schema:\n"
            '{"drug_name":"","batch_no":"","expiry":"","mrp":0}\n'
            "Use empty string or 0 for unreadable fields."
        )
        try:
            raw  = call_gemini(prompt, body.image_b64, body.mime)
            data = json.loads(raw.strip())
            return {"ok": True, "mode": "strip", "result": data}
        except Exception as e:
            return {"ok": False, "error": str(e)}
    elif body.mode == "challan":
        prompt = (
            "Look at this pharmacy invoice/challan photo.\n"
            "Extract ALL medicine line items: drug_name, batch_no, expiry (YYYY-MM), strips (int), mrp (number), cost (number).\n"
            "Respond ONLY with a JSON array, matching schema:\n"
            '[{"drug_name":"","batch_no":"","expiry":"","strips":1,"mrp":0,"cost":0}]\n'
            "Use empty string or 0 for unreadable fields."
        )
        try:
            raw  = call_gemini(prompt, body.image_b64, body.mime)
            data = json.loads(raw.strip())
            if isinstance(data, dict):
                data = [data]
            return {"ok": True, "mode": "challan", "result": data}
        except Exception as e:
            return {"ok": False, "error": str(e)}
    return {"ok": False, "error": "unknown mode"}


@router.get("/scan/barcode")
def scan_barcode(code: str):
    from backend.database import get_db, row_to_dict
    with get_db() as conn:
        drug = row_to_dict(conn.execute("""
            SELECT * FROM drugs WHERE barcode=? LIMIT 1
        """, (code, )).fetchone())
        if drug:
            return {"ok": True, "drug": drug}
        return {"ok": False, "error": "not_found"}


@router.get("/ai/reorder")
def ai_reorder():
    """Return reorder list based on low stock + recent sales velocity."""
    from backend.database import get_db, rows_to_list
    with get_db() as conn:
        rows = conn.execute("""
            SELECT d.id, d.name, d.brand, d.category, d.box_id,
              d.reorder_level, d.strips_per_box, d.mrp_per_strip,
              COALESCE(SUM(b.full_strips*d.tablets_per_strip),0)+
              COALESCE((SELECT SUM(t.tablets_remaining) FROM trays t WHERE t.drug_id=d.id AND t.closed=0),0)
              AS stock_tablets,
              COALESCE((
                SELECT SUM(bi.tablets_qty)
                FROM bill_items bi JOIN bills bl ON bl.id=bi.bill_id
                WHERE bi.drug_id=d.id AND bl.created_at >= date('now','-30 days')
              ), 0) AS sold_30d
            FROM drugs d
            LEFT JOIN batches b ON b.drug_id=d.id
            GROUP BY d.id
            HAVING stock_tablets < (d.reorder_level * d.tablets_per_strip)
            ORDER BY (stock_tablets * 1.0 / NULLIF(sold_30d, 0)) ASC, stock_tablets ASC
            LIMIT 20""").fetchall()
        result = []
        for row in rows_to_list(rows):
            tps  = row.get("tablets_per_strip", 10) or 10
            sold = row.get("sold_30d", 0) or 0
            days_left = int(row["stock_tablets"] / (sold / 30)) if sold > 0 else 999
            suggested = max(row.get("strips_per_box", 10), int(sold / 30 * 14 / tps))
            row["days_stock_left"] = days_left
            row["suggested_strips"] = suggested
            row["suggested_cost"]   = round(suggested * row.get("mrp_per_strip", 0) * 0.85, 2)
            result.append(row)
        return result
