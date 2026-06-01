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


import ast
import re
import ssl
import time
import traceback
import urllib.error


def clean_json_response(raw: str) -> str:
    """Robustly extracts JSON from a string, handling markdown and noise."""
    raw = raw.strip()
    # Remove markdown code blocks and stray backticks
    raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw, flags=re.IGNORECASE | re.MULTILINE)
    raw = raw.replace("`", "")
    
    # Find the range of the outermost JSON object/array
    start = raw.find('{')
    start_arr = raw.find('[')
    
    if start == -1 or (start_arr != -1 and start_arr < start):
        start = start_arr
        
    if start == -1:
        return raw

    # Find matching closing bracket by counting nesting level
    depth = 0
    for i in range(start, len(raw)):
        if raw[i] in '{[':
            depth += 1
        elif raw[i] in '}]':
            depth -= 1
            if depth == 0:
                return raw[start:i+1].strip()
        
    return raw


def parse_tolerant_json(s: str):
    s = s.strip()
    try:
        return json.loads(s)
    except Exception as json_err:
        try:
            # Regex matches string literals (double/single quoted with escapes) or true/false/null tokens
            pattern = re.compile(
                r'("(?:[^"\\]|\\.)*")|'          # Double-quoted string
                r'(\'(?:[^\'\\]|\\.)*\')|'        # Single-quoted string
                r'(\btrue\b)|(\bfalse\b)|(\bnull\b)',
                re.IGNORECASE
            )
            
            def replace_token(match):
                if match.group(1) or match.group(2):
                    return match.group(0) # Keep string contents unchanged
                val = match.group(0).lower()
                if val == 'true':
                    return 'True'
                elif val == 'false':
                    return 'False'
                elif val == 'null':
                    return 'None'
                return match.group(0)
                
            s = pattern.sub(replace_token, s)
            # Remove trailing commas before closing braces/brackets to make it Python/literal eval friendly
            s = re.sub(r",\s*([}\]])", r"\1", s)
            return ast.literal_eval(s)
        except Exception:
            raise json_err


def call_gemini(prompt: str, image_b64: str, mime: str = "image/jpeg") -> str:
    key = get_gemini_key()
    if not key:
        raise ValueError("no_key")
        
    models_to_try = [GEMINI_MODEL]
    if GEMINI_MODEL != "gemini-flash-latest":
        models_to_try.append("gemini-flash-latest")
        
    last_err = None
    context = ssl._create_unverified_context()
    
    for model in models_to_try:
        url = (f"https://generativelanguage.googleapis.com/v1beta/models/"
               f"{model}:generateContent?key={key}")
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
        
        # Retry up to 3 times per model for transient HTTP status codes (429, 500, 503, 504)
        max_retries = 3
        for attempt in range(max_retries):
            req = urllib.request.Request(url, data=payload,
                  headers={"Content-Type": "application/json"}, method="POST")
            try:
                with urllib.request.urlopen(req, timeout=30, context=context) as r:
                    resp = json.loads(r.read())
                return resp["candidates"][0]["content"]["parts"][0]["text"]
            except urllib.error.HTTPError as he:
                last_err = he
                status = he.code
                if status not in (429, 500, 503, 504):
                    # For non-transient errors (like invalid key, invalid prompt etc), fail early
                    try:
                        error_body = he.read().decode("utf-8")
                        error_json = json.loads(error_body)
                        msg = error_json.get("error", {}).get("message", he.reason)
                        raise ValueError(msg)
                    except ValueError:
                        raise
                    except Exception:
                        raise he
                
                print(f"Gemini API returned {status} for model {model} (attempt {attempt + 1}/{max_retries}). Retrying...")
                if attempt < max_retries - 1:
                    time.sleep(2 ** attempt)
            except Exception as e:
                # Retry for network level issues or connection timeouts
                last_err = e
                print(f"Gemini API connection error for model {model} (attempt {attempt + 1}/{max_retries}): {e}. Retrying...")
                if attempt < max_retries - 1:
                    time.sleep(2 ** attempt)
                    
    # Re-raise the last exception if all retries and models failed
    if isinstance(last_err, urllib.error.HTTPError):
        try:
            error_body = last_err.read().decode("utf-8")
            error_json = json.loads(error_body)
            msg = error_json.get("error", {}).get("message", last_err.reason)
            raise ValueError(msg)
        except Exception:
            raise last_err
    raise last_err


@router.post("/scan")
def scan_image(body: ScanIn):
    if not get_gemini_key():
        return {"ok": False, "error": "no_key",
                "message": "Add your Gemini API key in Settings or set GEMINI_API_KEY environment variable."}
    
    raw = None
    cleaned = None
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
            print(f"Gemini raw response (strip mode): {raw}")
            cleaned = clean_json_response(raw)
            print(f"Gemini cleaned response (strip mode): {cleaned}")
            data = parse_tolerant_json(cleaned)
            return {"ok": True, "mode": "strip", "result": data}
        except Exception as e:
            traceback.print_exc()
            err_msg = f"{e}"
            if raw is not None:
                err_msg += f"\nRaw: {raw}"
            if cleaned is not None:
                err_msg += f"\nCleaned: {cleaned}"
            return {"ok": False, "error": err_msg}
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
            print(f"Gemini raw response (challan mode): {raw}")
            cleaned = clean_json_response(raw)
            print(f"Gemini cleaned response (challan mode): {cleaned}")
            data = parse_tolerant_json(cleaned)
            if isinstance(data, dict):
                data = [data]
            return {"ok": True, "mode": "challan", "result": data}
        except Exception as e:
            traceback.print_exc()
            err_msg = f"{e}"
            if raw is not None:
                err_msg += f"\nRaw: {raw}"
            if cleaned is not None:
                err_msg += f"\nCleaned: {cleaned}"
            return {"ok": False, "error": err_msg}
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
