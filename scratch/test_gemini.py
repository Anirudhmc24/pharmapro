import urllib.request
import urllib.error
import json
from backend.routers.scan import get_gemini_key

key = get_gemini_key()
GEMINI_MODEL = "gemini-2.5-flash"

url = (f"https://generativelanguage.googleapis.com/v1beta/models/"
       f"{GEMINI_MODEL}:generateContent?key={key}")

# Ask for structured JSON
payload = json.dumps({
    "contents": [{"parts": [{"text": "Extract drug information from: Paracetamol 650mg, Batch: AB12, Expiry: 12/28, MRP: 23.50. Respond with schema: {'drug_name':'', 'batch_no':'', 'expiry':'', 'mrp':0}"}]}],
    "generationConfig": {
        "temperature": 0.1, 
        "maxOutputTokens": 1024,
        "responseMimeType": "application/json"
    }
}).encode()

req = urllib.request.Request(url, data=payload,
      headers={"Content-Type": "application/json"}, method="POST")

try:
    with urllib.request.urlopen(req, timeout=30) as r:
        print("Success! Response Code:", r.getcode())
        resp = json.loads(r.read())
        print("Response text:", resp["candidates"][0]["content"]["parts"][0]["text"])
except urllib.error.HTTPError as e:
    print(f"HTTPError: {e.code} - {e.reason}")
    print(e.read().decode())
except Exception as e:
    print("Other Exception:", e)
