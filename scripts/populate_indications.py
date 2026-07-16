"""
PharmaPro — scripts/populate_indications.py
Standalone AI Inventory Enrichment script.
Query each medicine in the local database and populate indications, side effects,
general administration guidelines, and specific child/adult/elderly suitability and dosage information.
"""

import os
import sys
import json
import sqlite3
import urllib.request
import urllib.error
import ssl
import re
import time
from pathlib import Path

# Fix python path so it can import from backend if needed
sys.path.append(str(Path(__file__).parent.parent))

DB_PATH = Path(__file__).parent.parent / "data" / "pharmapro.db"

def get_gemini_key(conn) -> str:
    # 1. Check environment variable
    env_key = os.environ.get("GEMINI_API_KEY")
    if env_key:
        return env_key
    
    # 2. Check shop_config table
    try:
        row = conn.execute("SELECT value FROM shop_config WHERE key='gemini_api_key'").fetchone()
        if row and row[0]:
            return row[0]
    except Exception:
        pass
    
    return ""

def clean_json_response(raw: str) -> str:
    raw = raw.strip()
    raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw, flags=re.IGNORECASE | re.MULTILINE)
    raw = raw.replace("`", "")
    
    start = raw.find('{')
    start_arr = raw.find('[')
    if start == -1 or (start_arr != -1 and start_arr < start):
        start = start_arr
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

def call_gemini(key: str, prompt: str) -> str:
    model = "gemini-2.5-flash"
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}"
    payload = json.dumps({
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.2,
            "maxOutputTokens": 2048,
            "responseMimeType": "application/json"
        }
    }).encode()
    
    context = ssl._create_unverified_context()
    req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"}, method="POST")
    
    try:
        with urllib.request.urlopen(req, timeout=30, context=context) as r:
            resp = json.loads(r.read())
        return resp["candidates"][0]["content"]["parts"][0]["text"]
    except urllib.error.HTTPError as he:
        try:
            err_body = he.read().decode("utf-8")
            err_json = json.loads(err_body)
            msg = err_json.get("error", {}).get("message", he.reason)
            raise ValueError(msg)
        except Exception:
            raise he

def enrich_medicine(key: str, name: str, brand: str, composition: str) -> dict:
    prompt = f"""You are a clinical pharmacist. For the following medicine:
Name: {name}
Brand: {brand or "N/A"}
Composition: {composition or "N/A"}

Please provide complete, accurate clinical details in JSON format.
You must respond with ONLY a valid JSON object matching the following structure:
{{
  "composition": "The active pharmaceutical ingredient(s) of the medicine in generic names (e.g. 'Paracetamol' or 'Ibuprofen + Domperidone')",
  "indications": "Plain text string listing symptoms, causes, or problems this medicine treats (e.g. 'fever, mild to moderate pain, headache, toothache')",
  "side_effects": "Plain text string listing common side effects (e.g. 'nausea, stomach irritation, allergic reaction')",
  "administration": "Plain text string containing general dosage/consumption instructions (e.g. 'Take with or after food. Do not exceed recommended dosage.')",
  "child_ok": true or false,
  "child_dose": "Pediatric dosage instructions, or 'Not recommended / Consult pediatrician'",
  "middle_aged_men_ok": true or false,
  "middle_aged_men_dose": "Dosage instructions or precautions for adult/middle-aged men",
  "middle_aged_women_ok": true or false,
  "middle_aged_women_dose": "Dosage instructions, pregnancy/lactation warnings, or precautions for adult/middle-aged women",
  "elderly_men_ok": true or false,
  "elderly_men_dose": "Geriatric dosage instructions or precautions for elderly men (e.g. 'Monitor renal function. Lower starting dose.')",
  "elderly_women_ok": true or false,
  "elderly_women_dose": "Geriatric dosage instructions or precautions for elderly women (e.g. 'Use with caution. Monitor bone density.')"
}}

Respond ONLY with the JSON object. Do not include any conversational text or markdown blocks outside the JSON.
"""
    raw_res = call_gemini(key, prompt)
    cleaned = clean_json_response(raw_res)
    return json.loads(cleaned)

def run(force=False):
    print("-------------------------------------------------")
    print("PharmaPro AI Inventory Enrichment Script starting...")
    print("-------------------------------------------------")
    
    if not DB_PATH.exists():
        raise FileNotFoundError(f"Database file not found at {DB_PATH}")
        
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    
    key = get_gemini_key(conn)
    if not key:
        conn.close()
        raise ValueError("Gemini API key not configured. Please set your key in Settings.")
        
    # Find medicines to enrich
    if force:
        drugs = conn.execute("SELECT id, name, brand, composition FROM drugs").fetchall()
    else:
        drugs = conn.execute("""
            SELECT id, name, brand, composition FROM drugs 
            WHERE indications IS NULL OR indications = '' 
               OR age_suitability IS NULL OR age_suitability = ''
        """).fetchall()
        
    if not drugs:
        print("All medicines are already enriched! Nothing to do.")
        conn.close()
        return
        
    print(f"Found {len(drugs)} medicines requiring AI enrichment.")
    success_count = 0
    
    for idx, drug in enumerate(drugs):
        print(f"[{idx+1}/{len(drugs)}] Enriching: {drug['name']}...")
        try:
            data = enrich_medicine(key, drug['name'], drug['brand'], drug['composition'])
            
            # Prepare age suitability JSON
            age_suitability = json.dumps({
                "child": {"ok": bool(data.get("child_ok", False)), "dose": data.get("child_dose", "Not recommended")},
                "middle_aged_men": {"ok": bool(data.get("middle_aged_men_ok", True)), "dose": data.get("middle_aged_men_dose", "")},
                "middle_aged_women": {"ok": bool(data.get("middle_aged_women_ok", True)), "dose": data.get("middle_aged_women_dose", "")},
                "elderly_men": {"ok": bool(data.get("elderly_men_ok", True)), "dose": data.get("elderly_men_dose", "")},
                "elderly_women": {"ok": bool(data.get("elderly_women_ok", True)), "dose": data.get("elderly_women_dose", "")}
            })
            
            conn.execute("""
                UPDATE drugs
                SET indications = ?,
                    side_effects = ?,
                    administration = ?,
                    age_suitability = ?
                WHERE id = ?
            """, (
                data.get("indications", ""),
                data.get("side_effects", ""),
                data.get("administration", ""),
                age_suitability,
                drug['id']
            ))
            conn.execute("""
                UPDATE master_drugs
                SET indications = ?,
                    side_effects = ?,
                    administration = ?,
                    age_suitability = ?
                WHERE name = ?
            """, (
                data.get("indications", ""),
                data.get("side_effects", ""),
                data.get("administration", ""),
                age_suitability,
                drug['name']
            ))
            
            # Patch composition if it was missing
            if data.get("composition") and (not drug['composition'] or not drug['composition'].strip()):
                conn.execute("UPDATE drugs SET composition = ? WHERE id = ?",
                             (data["composition"], drug['id']))
                conn.execute("UPDATE master_drugs SET composition = ? WHERE name = ?",
                             (data["composition"], drug['name']))

            conn.commit()
            print(f"  -> Successfully enriched: {drug['name']}")
            success_count += 1
            
            # Simple rate limiting delay
            time.sleep(1)
        except Exception as e:
            print(f"  -> Failed to enrich {drug['name']}: {e}")
            
    print("-------------------------------------------------")
    print(f"AI Enrichment Complete! Successfully enriched {success_count}/{len(drugs)} medicines.")
    print("-------------------------------------------------")
    conn.close()

if __name__ == "__main__":
    force_run = "--force" in sys.argv
    try:
        run(force=force_run)
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)
