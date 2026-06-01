"""
PharmaPro — scripts/batch_scan_invoices.py
Batch-process historical invoice photos using Gemini API and insert directly into the database.
"""

import os
import sys
import json
import time
import shutil
import base64
import sqlite3
import urllib.request
import urllib.error
import ssl
import re
from pathlib import Path

# Paths relative to the project root
ROOT_DIR = Path(__file__).parent.parent.resolve()
DB_PATH = ROOT_DIR / "data" / "pharmapro.db"
INWARD_DIR = ROOT_DIR / "Bills_For_Inward"
PROCESSED_DIR = ROOT_DIR / "Bills_Processed"

GEMINI_MODEL = "gemini-2.5-flash"

def get_api_key():
    # 1. Check environment variable
    env_key = os.environ.get("GEMINI_API_KEY")
    if env_key:
        return env_key.strip()
    
    # 2. Check SQLite shop_config
    if DB_PATH.exists():
        try:
            conn = sqlite3.connect(DB_PATH)
            conn.row_factory = sqlite3.Row
            row = conn.execute("SELECT value FROM shop_config WHERE key='gemini_api_key'").fetchone()
            conn.close()
            if row and row["value"]:
                return row["value"].strip()
        except Exception as e:
            print("Warning: Could not read API key from database:", e)
            
    # 3. Prompt user directly
    print("\n" + "="*50)
    print("  GEMINI API KEY NOT FOUND")
    print("  To bypass rate limits and process 300+ bills smoothly:")
    print("  1. Create a pay-as-you-go key in Google AI Studio.")
    print("  2. Paste it below or save it as GEMINI_API_KEY environment variable.")
    print("="*50 + "\n")
    user_key = input("Enter your Gemini API Key: ").strip()
    return user_key

def clean_json_response(raw: str) -> str:
    raw = raw.strip()
    raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw, flags=re.IGNORECASE | re.MULTILINE)
    raw = raw.replace("`", "")
    start = raw.find('[')
    start_obj = raw.find('{')
    if start == -1 or (start_obj != -1 and start_obj < start):
        start = start_obj
    if start == -1:
        return raw
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
    except Exception as err:
        import ast
        try:
            pattern = re.compile(
                r'("(?:[^"\\]|\\.)*")|'
                r'(\'(?:[^\'\\]|\\.)*\')|'
                r'(\btrue\b)|(\bfalse\b)|(\bnull\b)',
                re.IGNORECASE
            )
            def replace_token(match):
                if match.group(1) or match.group(2): return match.group(0)
                val = match.group(0).lower()
                if val == 'true': return 'True'
                if val == 'false': return 'False'
                if val == 'null': return 'None'
                return match.group(0)
            s = pattern.sub(replace_token, s)
            s = re.sub(r",\s*([}\]])", r"\1", s)
            return ast.literal_eval(s)
        except Exception:
            raise err

def call_gemini(api_key: str, image_b64: str, mime: str = "image/jpeg") -> str:
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent?key={api_key}"
    prompt = (
        "Look at this pharmacy invoice/challan photo.\n"
        "Extract ALL medicine line items: drug_name, batch_no, expiry (YYYY-MM), strips (int), mrp (number), cost (number).\n"
        "Respond ONLY with a JSON array, matching schema:\n"
        '[{"drug_name":"","batch_no":"","expiry":"","strips":1,"mrp":0,"cost":0}]\n'
        "Use empty string or 0 for unreadable fields."
    )
    
    payload = json.dumps({
        "contents": [{"parts": [
            {"text": prompt},
            {"inline_data": {"mime_type": mime, "data": image_b64}}
        ]}],
        "generationConfig": {
            "temperature": 0.1,
            "maxOutputTokens": 8192,
            "responseMimeType": "application/json"
        }
    }).encode()
    
    context = ssl._create_unverified_context()
    max_retries = 4
    for attempt in range(max_retries):
        req = urllib.request.Request(
            url, data=payload,
            headers={"Content-Type": "application/json"}, method="POST"
        )
        try:
            with urllib.request.urlopen(req, timeout=60, context=context) as r:
                resp = json.loads(r.read())
            return resp["candidates"][0]["content"]["parts"][0]["text"]
        except urllib.error.HTTPError as he:
            status = he.code
            print(f"Gemini API error (HTTP {status}) on attempt {attempt+1}/{max_retries}.")
            if status == 429:
                sleep_time = 10 * (attempt + 1)
                print(f"Rate limited. Waiting {sleep_time} seconds before retrying...")
                time.sleep(sleep_time)
            elif status in (500, 503, 504):
                time.sleep(2 ** attempt)
            else:
                try:
                    error_body = he.read().decode("utf-8")
                    error_json = json.loads(error_body)
                    msg = error_json.get("error", {}).get("message", he.reason)
                    raise ValueError(msg)
                except Exception:
                    raise he
        except Exception as e:
            print(f"Network error on attempt {attempt+1}: {e}")
            time.sleep(2 ** attempt)
            
    raise RuntimeError("All retries to Gemini API failed.")

def normalize_expiry(expiry: str) -> str:
    if not expiry: return ""
    expiry = expiry.strip()
    
    # MM/YYYY or MM/YY
    m = re.match(r"^(\d{1,2})[\-\/](\d{4})$", expiry)
    if m: return f"{m[2]}-{m[1].zfill(2)}"
    
    m = re.match(r"^(\d{1,2})[\-\/](\d{2})$", expiry)
    if m: return f"20{m[2]}-{m[1].zfill(2)}"
    
    # YYYY-MM or YY-MM
    m = re.match(r"^(\d{4})[\-\/](\d{1,2})$", expiry)
    if m: return f"{m[1]}-{m[2].zfill(2)}"
    
    m = re.match(r"^(\d{2})[\-\/](\d{1,2})$", expiry)
    if m: return f"20{m[1]}-{m[2].zfill(2)}"
    
    # Pure numbers (e.g. 1226)
    if re.match(r"^\d{4}$", expiry):
        return f"20{expiry[2:4]}-{expiry[0:2]}"
    if re.match(r"^\d{6}$", expiry):
        return f"{expiry[2:6]}-{expiry[0:2]}"
        
    return expiry

def process_single_invoice(api_key: str, filepath: Path, conn: sqlite3.Connection):
    # Load and encode image
    with open(filepath, "rb") as f:
        img_data = f.read()
    
    # Frontend compression emulation for local files
    # Only compress if file is larger than 1.5MB to save local CPU time
    if len(img_data) > 1.5 * 1024 * 1024:
        print(f"  File is large ({len(img_data)/1024/1024:.1f}MB). Note: Frontend uploads are compressed, but local batch imports run directly.")
        
    image_b64 = base64.b64encode(img_data).decode("utf-8")
    
    # Determine MIME type
    mime = "image/jpeg"
    if filepath.suffix.lower() in (".png"):
        mime = "image/png"
        
    raw_res = call_gemini(api_key, image_b64, mime)
    cleaned = clean_json_response(raw_res)
    items = parse_tolerant_json(cleaned)
    if isinstance(items, dict):
        items = [items]
        
    cursor = conn.cursor()
    print(f"  Gemini found {len(items)} medicines. Storing to database...")
    
    added_count = 0
    for it in items:
        drug_name = it.get("drug_name", "").strip()
        if not drug_name:
            continue
            
        batch_no = it.get("batch_no", "").strip() or "NA"
        expiry = normalize_expiry(it.get("expiry", ""))
        strips = int(it.get("strips", 1) or 1)
        mrp = float(it.get("mrp", 0) or 0)
        cost = float(it.get("cost", 0) or 0)
        
        # 1. Find or create the drug in the catalogue
        query_word = drug_name.split()[0]
        rows = cursor.execute(
            "SELECT id, name FROM drugs WHERE name LIKE ? OR brand LIKE ?",
            (f"%{query_word}%", f"%{query_word}%")
        ).fetchall()
        
        drug_id = None
        exact_name = drug_name.lower().strip()
        for r in rows:
            if r[1].lower().strip() == exact_name:
                drug_id = r[0]
                break
        
        if not drug_id and len(rows) == 1:
            # If only one match, auto-associate
            drug_id = rows[0][0]
            print(f"    Linked '{drug_name}' -> '{rows[0][1]}' in catalogue.")
            
        if not drug_id:
            # Create a new drug in the catalogue
            cursor.execute(
                """INSERT INTO drugs(name, brand, category, schedule, tablets_per_strip, strips_per_box, mrp_per_strip, mrp_per_tablet)
                   VALUES (?, ?, 'Allopathy', 'OTC', 10, 10, ?, ?)""",
                (drug_name, drug_name.split()[0], mrp, mrp/10.0)
            )
            drug_id = cursor.lastrowid
            print(f"    Created new drug in catalogue: '{drug_name}' (ID: {drug_id})")
            
        # 2. Add or update batch in inventory
        existing_batch = cursor.execute(
            "SELECT id, full_strips FROM batches WHERE drug_id=? AND batch_no=?",
            (drug_id, batch_no)
        ).fetchone()
        
        if existing_batch:
            batch_id = existing_batch[0]
            cursor.execute(
                "UPDATE batches SET full_strips = full_strips + ?, cost_per_strip = ?, mrp_per_strip = ? WHERE id = ?",
                (strips, cost, mrp, batch_id)
            )
            print(f"    Updated existing batch '{batch_no}' for '{drug_name}': +{strips} strips")
        else:
            cursor.execute(
                """INSERT INTO batches(drug_id, batch_no, expiry, full_strips, cost_per_strip, mrp_per_strip)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (drug_id, batch_no, expiry or "2028-12", strips, cost, mrp)
            )
            batch_id = cursor.lastrowid
            print(f"    Created new batch '{batch_no}' for '{drug_name}': {strips} strips")
            
        # 3. Insert stock log
        cursor.execute(
            "INSERT INTO stock_log(drug_id, batch_id, action, qty_change, note) VALUES (?, ?, 'receive', ?, ?)",
            (drug_id, batch_id, strips, f"Batch import from invoice: {filepath.name}")
        )
        added_count += 1
        
    conn.commit()
    return added_count

def main():
    print("="*60)
    print("        PHARMAPRO HISTORICAL INVOICE BATCH SCANNER")
    print("="*60)
    
    api_key = get_api_key()
    if not api_key:
        print("Error: Gemini API Key is required. Exiting.")
        return
        
    if not DB_PATH.exists():
        print(f"Error: Database file not found at {DB_PATH}. Run the app once first to initialize.")
        return
        
    INWARD_DIR.mkdir(exist_ok=True)
    PROCESSED_DIR.mkdir(exist_ok=True)
    
    # Fetch list of invoices
    allowed_exts = (".jpg", ".jpeg", ".png")
    invoice_files = sorted([f for f in INWARD_DIR.iterdir() if f.is_file() and f.suffix.lower() in allowed_exts])
    
    if not invoice_files:
        print(f"\nNo invoice files found in folder: {INWARD_DIR}")
        print("Please copy all your scanned bill photos there and run this script again.")
        return
        
    print(f"\nFound {len(invoice_files)} invoices to process inside '{INWARD_DIR.name}/'.")
    confirm = input("Do you want to start processing? (y/n): ").strip().lower()
    if confirm != 'y':
        print("Aborted.")
        return
        
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA foreign_keys = ON")
    
    success_count = 0
    failure_count = 0
    
    for idx, filepath in enumerate(invoice_files):
        print(f"\n[{idx+1}/{len(invoice_files)}] Processing: {filepath.name}...")
        start_time = time.time()
        try:
            items_added = process_single_invoice(api_key, filepath, conn)
            
            # Move file to completed folder
            dest = PROCESSED_DIR / filepath.name
            shutil.move(str(filepath), str(dest))
            
            elapsed = time.time() - start_time
            print(f"  Success: Added {items_added} items in {elapsed:.1f}s. Moved to '{PROCESSED_DIR.name}/'.")
            success_count += 1
            
            # Throttle delay (4 seconds) to stay well under Gemini free limit (15 RPM)
            # Adjust or remove if you have a paid Pay-As-You-Go key
            time.sleep(4)
            
        except Exception as e:
            print(f"  FAILED to process {filepath.name}: {e}")
            failure_count += 1
            # If API limits hit, sleep a bit longer before next file
            time.sleep(10)
            
    conn.close()
    
    print("\n" + "="*50)
    print("                PROCESSING COMPLETE")
    print(f"  Successfully imported: {success_count} invoices")
    print(f"  Failed:                  {failure_count} invoices")
    print("="*50 + "\n")

if __name__ == "__main__":
    main()
