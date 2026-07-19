import pytest
from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)

def test_settings_save_repro():
    # Login
    resp = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    assert resp.status_code == 200
    token = resp.json()["token"]
    headers = {"X-Token": token}

    # Payload matching the settings page save POST request
    data = {
      "name": "Test Shop",
      "owner": "Test Owner",
      "phone": "9999999999",
      "gstin": "29AAAAA1111A1Z1",
      "address": "123 Main St",
      "licence": "DL-12345",
      "gst_slab": "5",
      "expiry_warn_months": 3,
      "broken_strip_alert": 2,
      "low_stock_alert_limit": 25,
      "fast2sms_key": "",
      "gemini_api_key": "",
      "backup_enabled": False,
      "gdrive_folder_id": "",
    }

    # Call endpoint stage 1
    resp = client.post("/api/config", json=data, headers=headers)
    print(f"\n[Reproduction Status] Response status: {resp.status_code}, response: {resp.text}")
    assert resp.status_code == 200
