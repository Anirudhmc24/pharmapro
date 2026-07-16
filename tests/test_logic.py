import pytest
from datetime import date

def test_expiry_management_warning_or_block(client, auth_headers):
    # Add a drug
    drug_data = {
        "name": "ExpiredDrug",
        "tablets_per_strip": 10,
        "mrp_per_tablet": 1.0
    }
    resp = client.post("/api/drugs", json=drug_data, headers=auth_headers)
    drug_id = resp.json()["id"]

    # Add an expired batch
    batch_data = {
        "drug_id": drug_id,
        "batch_no": "EXP-001",
        "expiry": "2020-01", # Past date
        "strips": 5
    }
    client.post("/api/batches", json=batch_data, headers=auth_headers)

    # Attempt to bill the expired drug
    bill_data = {
        "patient_name": "Test Expiry",
        "items": [
            {"drug_id": drug_id, "tablets_qty": 5}
        ]
    }
    resp = client.post("/api/bills", json=bill_data, headers=auth_headers)
    
    # We expect the system to either block it (400/422) or provide a warning in the response
    # Since the requirement is "Ensure system blocks or warns", if it successfully bills 
    # without any warning payload, it should fail this test.
    if resp.status_code == 200:
        # Check if there is a warning in the response
        assert "warning" in resp.json() or "expired" in resp.json().get("msg", "").lower(), "System did not block or warn about expired batch"
    else:
        assert resp.status_code in [400, 422, 403], f"Expected block status code, got {resp.status_code}"

def test_low_stock_alerts_trigger(client, auth_headers):
    # 1. Setup a drug with reorder level 20 tablets (2 strips)
    drug_data = {
        "name": "LowStockDrug",
        "tablets_per_strip": 10,
        "reorder_level": 20
    }
    resp = client.post("/api/drugs", json=drug_data, headers=auth_headers)
    drug_id = resp.json()["id"]

    # Add exactly 2 strips (20 tablets) - shouldn't trigger alert yet (needs to be < 20)
    batch_data = {
        "drug_id": drug_id,
        "batch_no": "LOW-001",
        "expiry": "2029-12",
        "strips": 2
    }
    client.post("/api/batches", json=batch_data, headers=auth_headers)

    # Verify not in low stock
    resp = client.get("/api/dashboard", headers=auth_headers)
    alerts = [a for a in resp.json()["reorder_alerts"] if a["id"] == drug_id]
    assert len(alerts) == 0

    # 2. Sell 5 tablets to drop below reorder level
    bill_data = {
        "items": [{"drug_id": drug_id, "tablets_qty": 5}]
    }
    client.post("/api/bills", json=bill_data, headers=auth_headers)

    # 3. Verify it is now in the low stock alerts
    resp = client.get("/api/dashboard", headers=auth_headers)
    dashboard = resp.json()
    alerts = [a for a in dashboard["reorder_alerts"] if a["id"] == drug_id]
    
    assert len(alerts) == 1, "Drug did not appear in low stock alerts after dropping below reorder level"
    assert alerts[0]["stock_tablets"] == 15 # 20 - 5 = 15

def test_processing_sales_return(client, auth_headers):
    # Setup inventory
    drug_data = {"name": "ReturnDrug", "tablets_per_strip": 10, "mrp_per_tablet": 5.0}
    drug_id = client.post("/api/drugs", json=drug_data, headers=auth_headers).json()["id"]

    batch_data = {
        "drug_id": drug_id,
        "batch_no": "RET-001",
        "expiry": "2030-01",
        "strips": 5 # 50 tablets
    }
    resp = client.post("/api/batches", json=batch_data, headers=auth_headers)
    batch_id = resp.json()["batch_id"]

    # Create Bill for 12 tablets (1 strip + 2 loose)
    bill_data = {
        "items": [{"drug_id": drug_id, "batch_id": batch_id, "tablets_qty": 12}]
    }
    resp = client.post("/api/bills", json=bill_data, headers=auth_headers)
    bill_id = resp.json()["bill_id"]

    # Fetch bill to get bill_item_id and batch_id
    bill = client.get(f"/api/bills/{bill_id}", headers=auth_headers).json()
    bill_item = bill["items"][0]
    
    # Assert stock before return
    drug_resp = client.get(f"/api/drugs/{drug_id}", headers=auth_headers).json()
    assert drug_resp["batches"][0]["full_strips"] == 3 # 5 - 2 strips needed to cover 12 tabs
    assert drug_resp["trays"][0]["tablets_remaining"] == 8 # 20 - 12 = 8
    
    # Process Return for 2 tablets
    return_data = {
        "bill_id": bill_id,
        "items": [{
            "bill_item_id": bill_item["id"],
            "drug_id": drug_id,
            "batch_id": bill_item["batch_id"],
            "tablets_qty": 2
        }],
        "reason": "Customer change of mind"
    }
    resp = client.post("/api/returns", json=return_data, headers=auth_headers)
    assert resp.status_code == 200
    
    # Assert stock after return
    drug_resp = client.get(f"/api/drugs/{drug_id}", headers=auth_headers).json()
    # full_strips should still be 3. The 2 returned tablets should be added to the open tray
    assert drug_resp["batches"][0]["full_strips"] == 3
    assert drug_resp["trays"][0]["tablets_remaining"] == 10 # 8 + 2 = 10


def test_returns_constraints_and_report_adjustments(client, auth_headers):
    # 1. Setup drug & batch with cost_per_strip
    drug_data = {"name": "ReportAdjustDrug", "tablets_per_strip": 10, "mrp_per_tablet": 10.0}
    drug_id = client.post("/api/drugs", json=drug_data, headers=auth_headers).json()["id"]
    
    batch_data = {
        "drug_id": drug_id,
        "batch_no": "REP-ADJ-001",
        "expiry": "2030-01",
        "strips": 5,
        "cost_per_strip": 50.0
    }
    batch_resp = client.post("/api/batches", json=batch_data, headers=auth_headers).json()
    batch_id = batch_resp["batch_id"]

    # 2. Create bill for 20 tablets (2 strips = ₹200 MRP total)
    bill_data = {
        "items": [{"drug_id": drug_id, "batch_id": batch_id, "tablets_qty": 20}]
    }
    bill_resp = client.post("/api/bills", json=bill_data, headers=auth_headers).json()
    bill_id = bill_resp["bill_id"]
    
    # Check reports before return
    sales_before = client.get("/api/reports/sales", headers=auth_headers).json()
    pl_before = client.get("/api/reports/pl", headers=auth_headers).json()
    drug_before = client.get("/api/reports/drugwise", headers=auth_headers).json()
    
    # 3. Process Return for 10 tablets (1 strip = ₹100 MRP)
    # First get bill_item_id
    bill = client.get(f"/api/bills/{bill_id}", headers=auth_headers).json()
    bill_item_id = bill["items"][0]["id"]
    
    return_data = {
        "bill_id": bill_id,
        "items": [{
            "bill_item_id": bill_item_id,
            "drug_id": drug_id,
            "batch_id": batch_id,
            "tablets_qty": 10
        }],
        "reason": "Over-prescribed"
    }
    ret_resp = client.post("/api/returns", json=return_data, headers=auth_headers)
    assert ret_resp.status_code == 200
    
    # 4. Assert that another return on the same bill fails with 400
    ret_resp_dup = client.post("/api/returns", json=return_data, headers=auth_headers)
    assert ret_resp_dup.status_code == 400
    assert "already processed" in ret_resp_dup.json()["detail"]
    
    # 5. Check reports after return
    sales_after = client.get("/api/reports/sales", headers=auth_headers).json()
    pl_after = client.get("/api/reports/pl", headers=auth_headers).json()
    drug_after = client.get("/api/reports/drugwise", headers=auth_headers).json()
    
    # Sales Net should be reduced by 100
    assert round(sales_before["summary"]["net"] - sales_after["summary"]["net"], 2) == 100.0
    
    # COGS should be reduced by cost of 10 tablets: 10 tablets * (50.0 / 10) = 50.0
    assert round(pl_before["cogs"] - pl_after["cogs"], 2) == 50.0
    
    # Revenue/Profit in PL should be reduced by 100
    assert round(pl_before["net_revenue"] - pl_after["net_revenue"], 2) == 100.0
    
    # Drug-wise sales should show 10 tablets sold (down from 20)
    drug_sales_before = next(d for d in drug_before if d["name"] == "ReportAdjustDrug")
    drug_sales_after = next(d for d in drug_after if d["name"] == "ReportAdjustDrug")
    assert round(drug_sales_before["revenue"] - drug_sales_after["revenue"], 2) == 100.0


def test_substitutes_partitioning(client, auth_headers):
    # 1. Add some active drugs
    # Query drug: Amlodipine 5mg
    # Exact match: Amlip 5mg (composition: Amlodipine 5mg)
    # Combination match: Amlip H (composition: Amlodipine 5mg + Hydrochlorothiazide 12.5mg)
    
    d1 = client.post("/api/drugs", json={
        "name": "Amlip 5mg", "brand": "Cipla", "composition": "Amlodipine 5mg",
        "tablets_per_strip": 10, "mrp_per_strip": 20.0
    }, headers=auth_headers).json()["id"]
    
    d2 = client.post("/api/drugs", json={
        "name": "Amlip H", "brand": "Cipla", "composition": "Amlodipine 5mg + Hydrochlorothiazide 12.5mg",
        "tablets_per_strip": 10, "mrp_per_strip": 40.0
    }, headers=auth_headers).json()["id"]
    
    # 2. Setup master drugs
    from backend.database import get_db
    with get_db() as conn:
        conn.execute("DELETE FROM master_drugs WHERE name IN ('MasterExact 5mg', 'MasterComb')")
        conn.execute("""
            INSERT INTO master_drugs(name, composition, mrp) VALUES
            ('MasterExact 5mg', 'Amlodipine 5mg', 18.0),
            ('MasterComb', 'Amlodipine 5mg + Atenolol 50mg', 35.0)
        """)
        conn.commit()

    # 3. Call substitutes endpoint for Amlodipine 5mg
    resp = client.get("/api/drugs/substitutes?composition=Amlodipine+5mg&name=Amlodipine+5mg", headers=auth_headers)
    assert resp.status_code == 200
    res = resp.json()
    
    exact_in = [r["name"] for r in res["exact_in_stock"]]
    comb_in = [r["name"] for r in res["comb_in_stock"]]
    exact_ord = [r["name"] for r in res["exact_orderable"]]
    comb_ord = [r["name"] for r in res["comb_orderable"]]
    
    assert "Amlip 5mg" in exact_in
    assert "Amlip H" in comb_in
    assert "MasterExact 5mg" in exact_ord
    assert "MasterComb" in comb_ord
    
    assert "Amlip H" not in exact_in
    assert "Amlip 5mg" not in comb_in


def test_enrich_master_item(client, auth_headers, monkeypatch):
    # Mock get_gemini_key to return a fake key
    from backend.routers import scan
    monkeypatch.setattr(scan, "get_gemini_key", lambda: "fake-key")

    # Mock enrich_medicine to return fake data
    from scripts import populate_indications
    fake_clinical = {
        "composition": "Paracetamol 500mg",
        "indications": "test headache",
        "side_effects": "test nausea",
        "administration": "test dose",
        "child_ok": True,
        "child_dose": "consult doc",
        "middle_aged_men_ok": True,
        "middle_aged_men_dose": "1 tab",
        "middle_aged_women_ok": True,
        "middle_aged_women_dose": "1 tab",
        "elderly_men_ok": True,
        "elderly_men_dose": "1 tab",
        "elderly_women_ok": True,
        "elderly_women_dose": "1 tab"
    }
    monkeypatch.setattr(populate_indications, "enrich_medicine", lambda *args, **kwargs: fake_clinical)

    from backend.database import get_db
    with get_db() as conn:
        conn.execute("DELETE FROM master_drugs WHERE name = 'EnrichTest 500mg'")
        conn.execute("DELETE FROM drugs WHERE name = 'EnrichTest 500mg'")
        conn.execute("""
            INSERT INTO master_drugs(name, composition, mrp)
            VALUES(?, ?, ?)
        """, ("EnrichTest 500mg", "", 15.0))
        conn.execute("""
            INSERT INTO drugs(name, composition, tablets_per_strip, mrp_per_strip)
            VALUES(?, ?, ?, ?)
        """, ("EnrichTest 500mg", "", 10, 15.0))
        conn.commit()

    resp = client.post("/api/drugs/enrich_master_item", json={
        "name": "EnrichTest 500mg",
        "manufacturer": "TestLab",
        "composition": ""
    }, headers=auth_headers)
    
    assert resp.status_code == 200
    res = resp.json()
    assert res["ok"] is True
    assert res["data"]["indications"] == "test headache"

    # Verify database was updated
    with get_db() as conn:
        row = conn.execute("SELECT indications, composition, age_suitability FROM master_drugs WHERE name='EnrichTest 500mg'").fetchone()
        assert row["indications"] == "test headache"
        assert row["composition"] == "Paracetamol 500mg"
        assert "child" in row["age_suitability"]

        row_local = conn.execute("SELECT composition FROM drugs WHERE name='EnrichTest 500mg'").fetchone()
        assert row_local["composition"] == "Paracetamol 500mg"
