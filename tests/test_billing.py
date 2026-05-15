import pytest

def test_search_functionality(client, auth_headers):
    # Add a drug to search for
    drug_data = {
        "name": "Searchamol",
        "brand": "SearchBrand",
        "composition": "Paracetamol"
    }
    client.post("/api/drugs", json=drug_data, headers=auth_headers)

    # Test search by name
    resp = client.get("/api/drugs?q=Searchamol", headers=auth_headers)
    assert resp.status_code == 200
    results = resp.json()
    assert len(results) >= 1
    assert any(d["name"] == "Searchamol" for d in results)

    # Test search by composition
    resp = client.get("/api/drugs?q=Paracetamol", headers=auth_headers)
    assert resp.status_code == 200
    results = resp.json()
    assert any(d["name"] == "Searchamol" for d in results)

def test_invoice_generation_and_stock_deduction(client, auth_headers):
    # 1. Setup inventory
    drug_data = {
        "name": "Billamol 500mg",
        "tablets_per_strip": 10,
        "mrp_per_tablet": 2.5
    }
    resp = client.post("/api/drugs", json=drug_data, headers=auth_headers)
    drug_id = resp.json()["id"]

    batch_data = {
        "drug_id": drug_id,
        "batch_no": "BILL-001",
        "expiry": "2029-01",
        "strips": 2 # 20 tablets total
    }
    client.post("/api/batches", json=batch_data, headers=auth_headers)

    # Verify initial stock
    drug_resp = client.get(f"/api/drugs/{drug_id}", headers=auth_headers)
    assert drug_resp.json()["batches"][0]["full_strips"] == 2

    # 2. Create invoice for 15 tablets (1 strip + 5 loose tablets)
    bill_data = {
        "patient_name": "John Doe",
        "discount_pct": 10.0,
        "items": [
            {"drug_id": drug_id, "tablets_qty": 15}
        ]
    }
    resp = client.post("/api/bills", json=bill_data, headers=auth_headers)
    assert resp.status_code == 200
    bill_info = resp.json()
    assert "bill_no" in bill_info

    # 3. Assert Financial Calculations
    # subtotal = 15 * 2.5 = 37.5
    # discount = 37.5 * 10% = 3.75
    # gst_slab = 12% (default)
    # gst = (37.5 - 3.75) * 12% = 33.75 * 0.12 = 4.05
    # total = 33.75 + 4.05 = 37.8
    assert bill_info["subtotal"] == 37.5
    assert bill_info["discount_amt"] == 3.75
    assert bill_info["gst_amt"] == 4.05
    assert bill_info["total"] == 37.8

    # 4. Assert Stock Deduction
    # Should have 0 full strips left, and 1 tray with 5 tablets remaining
    drug_resp = client.get(f"/api/drugs/{drug_id}", headers=auth_headers)
    drug_info = drug_resp.json()
    
    assert drug_info["batches"][0]["full_strips"] == 0
    assert len(drug_info["trays"]) == 1
    assert drug_info["trays"][0]["tablets_remaining"] == 5
    assert drug_info["trays"][0]["closed"] == 0
