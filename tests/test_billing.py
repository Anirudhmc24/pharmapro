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

    # Add a custom drug with specific MRP to test first-letter + MRP search
    mrp_drug = {
        "name": "Paracetamol-MRP",
        "brand": "MRPBrand",
        "composition": "Para",
        "mrp_per_strip": 22.35
    }
    client.post("/api/drugs", json=mrp_drug, headers=auth_headers)

    # Test search by prefix + MRP
    # 1. Test case-insensitive ('P' or 'p') prefix and MRP search in get_drugs
    resp = client.get("/api/drugs?q=p%2B22.35", headers=auth_headers)
    assert resp.status_code == 200
    results = resp.json()
    assert any(d["name"] == "Paracetamol-MRP" for d in results)

    # 2. Test spaces inside query (e.g. 'P + 22.35')
    resp = client.get("/api/drugs?q=P%20%2B%2022.35", headers=auth_headers)
    assert resp.status_code == 200
    results = resp.json()
    assert any(d["name"] == "Paracetamol-MRP" for d in results)

    # 3. Test master search by prefix + MRP
    # Adding the drug above syncs it to master_drugs. Let's verify master_search finds it.
    resp = client.get("/api/drugs/master_search?q=p%2B22.35", headers=auth_headers)
    assert resp.status_code == 200
    results = resp.json()
    assert any(d["name"] == "Paracetamol-MRP" for d in results)

    # 4. Test search_by_problem by prefix + MRP
    resp = client.get("/api/drugs/search_by_problem?q=p%2B22.35", headers=auth_headers)
    assert resp.status_code == 200
    results = resp.json()
    assert any(d["name"] == "Paracetamol-MRP" for d in results)

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
        "gst_inclusive": False,
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


def test_bill_editing(client, auth_headers):
    # 1. Setup inventory
    drug_data = {
        "name": "Editamol 500mg",
        "tablets_per_strip": 10,
        "mrp_per_tablet": 2.0
    }
    resp = client.post("/api/drugs", json=drug_data, headers=auth_headers)
    drug_id = resp.json()["id"]

    batch_data = {
        "drug_id": drug_id,
        "batch_no": "EDIT-001",
        "expiry": "2029-01",
        "strips": 2 # 20 tablets total
    }
    client.post("/api/batches", json=batch_data, headers=auth_headers)

    # 2. Create invoice for 15 tablets
    bill_data = {
        "patient_name": "Test Patient",
        "discount_pct": 0.0,
        "gst_inclusive": False,
        "items": [
            {"drug_id": drug_id, "tablets_qty": 15}
        ]
    }
    resp = client.post("/api/bills", json=bill_data, headers=auth_headers)
    assert resp.status_code == 200
    bill_id = resp.json()["bill_id"]

    # Verify initial stock (5 remaining)
    drug_resp = client.get(f"/api/drugs/{drug_id}", headers=auth_headers)
    assert drug_resp.json()["batches"][0]["full_strips"] == 0
    assert drug_resp.json()["trays"][0]["tablets_remaining"] == 5

    # 3. Edit invoice to 12 tablets
    edit_data = {
        "patient_name": "Test Patient",
        "discount_pct": 0.0,
        "gst_inclusive": False,
        "items": [
            {"drug_id": drug_id, "tablets_qty": 12}
        ]
    }
    resp = client.put(f"/api/bills/{bill_id}", json=edit_data, headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["total"] == 26.88 # 12 * 2.0 = 24.0, GST 12% = 2.88, total = 26.88

    # Verify stock is corrected (8 remaining: 1 strip returned to batch, leftover updated or tray consolidated)
    drug_resp = client.get(f"/api/drugs/{drug_id}", headers=auth_headers)
    # Reverting 15 tablets adds 1 full strip to batches and 5 to trays (or open tray)
    # Then deducting 12 tablets takes 10 tablets from batches (leaving 0 full strips) and 2 from trays.
    # Total remaining should be 20 - 12 = 8 tablets.
    # Let's count total tablets remaining:
    full_strips = drug_resp.json()["batches"][0]["full_strips"]
    trays_qty = sum(t["tablets_remaining"] for t in drug_resp.json()["trays"] if not t["closed"])
    assert (full_strips * 10 + trays_qty) == 8


def test_gst_inclusive_invoice_generation(client, auth_headers):
    # 1. Setup inventory
    drug_data = {
        "name": "Incluamol 500mg",
        "tablets_per_strip": 10,
        "mrp_per_tablet": 4.0
    }
    resp = client.post("/api/drugs", json=drug_data, headers=auth_headers)
    drug_id = resp.json()["id"]

    batch_data = {
        "drug_id": drug_id,
        "batch_no": "INCL-001",
        "expiry": "2029-01",
        "strips": 2,
        "cost_per_strip": 10.0,
        "mrp_per_strip": 40.0,
        "gst_pct": 12.0
    }
    client.post("/api/batches", json=batch_data, headers=auth_headers)

    # 2. Create invoice for 10 tablets with gst_inclusive = True
    bill_data = {
        "patient_name": "Jane Doe",
        "discount_pct": 10.0,
        "gst_inclusive": True,
        "items": [
            {"drug_id": drug_id, "tablets_qty": 10}
        ]
    }
    resp = client.post("/api/bills", json=bill_data, headers=auth_headers)
    assert resp.status_code == 200
    bill_info = resp.json()

    # 3. Assert Financial Calculations
    # subtotal = 10 * 4.0 = 40.0
    # discount = 40.0 * 10% = 4.0
    # total = 40.0 - 4.0 = 36.0
    # gst = 36.0 * 12 / 112 = 3.86
    assert bill_info["subtotal"] == 40.0
    assert bill_info["discount_amt"] == 4.0
    assert bill_info["gst_amt"] == 3.86
    assert bill_info["total"] == 36.0

    # 4. Verify GSTR-1 back-calculation/taxable base compatibility
    # taxable = total - gst = 36.0 - 3.86 = 32.14
    report_resp = client.get("/api/reports/gstr1?month=2026-07", headers=auth_headers)
    assert report_resp.status_code == 200
    records = report_resp.json()
    bill_record = [r for r in records if r["bill_no"] == bill_info["bill_no"]]
    assert len(bill_record) == 1
    assert bill_record[0]["total"] == 36.0
    assert bill_record[0]["gst_amt"] == 3.86
    assert bill_record[0]["taxable"] == 32.14


def test_daily_reorder_suggestion(client, auth_headers):
    # 1. Setup inventory
    drug_data = {
        "name": "Reorderamol 500mg",
        "tablets_per_strip": 10,
        "mrp_per_tablet": 3.0,
        "brand": "ReorderBrand"
    }
    resp = client.post("/api/drugs", json=drug_data, headers=auth_headers)
    drug_id = resp.json()["id"]

    batch_data = {
        "drug_id": drug_id,
        "batch_no": "REORDER-001",
        "expiry": "2029-01",
        "strips": 5 # 50 tablets total
    }
    client.post("/api/batches", json=batch_data, headers=auth_headers)

    # 2. Create invoice for today
    bill_data = {
        "patient_name": "Reorder Patient",
        "discount_pct": 0.0,
        "items": [
            {"drug_id": drug_id, "tablets_qty": 12}
        ]
    }
    resp = client.post("/api/bills", json=bill_data, headers=auth_headers)
    assert resp.status_code == 200

    # 3. Check dashboard daily_reorder_alerts
    dash_resp = client.get("/api/dashboard", headers=auth_headers)
    assert dash_resp.status_code == 200
    dash_data = dash_resp.json()
    assert "daily_reorder_alerts" in dash_data
    alerts = dash_data["daily_reorder_alerts"]
    assert len(alerts) >= 1
    
    match = [a for a in alerts if a["id"] == drug_id]
    assert len(match) == 1
    assert match[0]["sold_today"] == 12
    assert match[0]["stock_tablets"] == 38 # 50 - 12 = 38 tablets remaining


def test_clear_day_billing(client, auth_headers):
    # 1. Setup inventory
    drug_data = {
        "name": "Clearamol 500mg",
        "tablets_per_strip": 10,
        "mrp_per_tablet": 2.0
    }
    resp = client.post("/api/drugs", json=drug_data, headers=auth_headers)
    drug_id = resp.json()["id"]

    batch_data = {
        "drug_id": drug_id,
        "batch_no": "CLEAR-001",
        "expiry": "2029-01",
        "strips": 5 # 50 tablets total
    }
    client.post("/api/batches", json=batch_data, headers=auth_headers)

    # 2. Create invoice
    bill_data = {
        "patient_name": "Clear Patient",
        "discount_pct": 0.0,
        "items": [
            {"drug_id": drug_id, "tablets_qty": 20}
        ]
    }
    resp = client.post("/api/bills", json=bill_data, headers=auth_headers)
    assert resp.status_code == 200
    bill_info = resp.json()
    bill_id = bill_info["bill_id"]
    
    # Stock should be 30 tablets (3 full strips left)
    drug_resp = client.get(f"/api/drugs/{drug_id}", headers=auth_headers)
    assert drug_resp.json()["batches"][0]["full_strips"] == 3

    # 3. Request clear_day for today
    import datetime
    today = datetime.date.today().isoformat()
    
    clear_resp = client.delete(f"/api/bills/clear_day?date={today}&password=admin123", headers=auth_headers)
    assert clear_resp.status_code == 200
    assert clear_resp.json()["ok"] is True

    # 4. Verify stock has restored back to 50 (5 full strips)
    drug_resp = client.get(f"/api/drugs/{drug_id}", headers=auth_headers)
    assert drug_resp.json()["batches"][0]["full_strips"] == 5

    # 5. Verify the bill is deleted from database
    bill_check = client.get(f"/api/bills/{bill_id}", headers=auth_headers)
    assert bill_check.status_code == 404


