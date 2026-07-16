import pytest

def test_add_drug_and_batch_success(client, auth_headers):
    # 1. Add a new drug with HSN
    drug_data = {
        "name": "Testomol 500mg",
        "brand": "TestBrand",
        "composition": "Testamol",
        "category": "Analgesic",
        "schedule": "OTC",
        "hsn": "30049099",
        "tablets_per_strip": 10,
        "strips_per_box": 10,
        "mrp_per_strip": 20.0,
        "mrp_per_tablet": 2.0,
        "reorder_level": 5
    }
    resp = client.post("/api/drugs", json=drug_data, headers=auth_headers)
    assert resp.status_code == 200
    drug_id = resp.json().get("id")
    assert drug_id is not None

    # 2. Add a new batch for this drug
    batch_data = {
        "drug_id": drug_id,
        "batch_no": "BATCH-001",
        "expiry": "2028-12",
        "strips": 10,
        "cost_per_strip": 10.0,
        "mrp_per_strip": 20.0,
        "gst_pct": 12.0
    }
    resp = client.post("/api/batches", json=batch_data, headers=auth_headers)
    assert resp.status_code == 200
    batch_id = resp.json().get("batch_id")
    assert batch_id is not None

    # Verify the batch was actually added and stock reflected
    resp = client.get(f"/api/drugs/{drug_id}", headers=auth_headers)
    assert resp.status_code == 200
    drug_info = resp.json()
    assert len(drug_info["batches"]) == 1
    assert drug_info["batches"][0]["batch_no"] == "BATCH-001"

def test_duplicate_batch_updates_stock(client, auth_headers):
    # Add a drug
    resp = client.post("/api/drugs", json={"name": "DupDrug", "tablets_per_strip": 10}, headers=auth_headers)
    drug_id = resp.json()["id"]

    # Add initial batch
    batch_data = {
        "drug_id": drug_id,
        "batch_no": "DUP-001",
        "expiry": "2025-01",
        "strips": 5
    }
    client.post("/api/batches", json=batch_data, headers=auth_headers)

    # Add same batch again to simulate duplicate entry
    batch_data["strips"] = 10
    client.post("/api/batches", json=batch_data, headers=auth_headers)

    # Verify stock was added together instead of creating a new batch row
    resp = client.get(f"/api/drugs/{drug_id}", headers=auth_headers)
    drug_info = resp.json()
    assert len(drug_info["batches"]) == 1
    assert drug_info["batches"][0]["full_strips"] == 15

def test_missing_mandatory_fields(client, auth_headers):
    # Test missing name
    resp = client.post("/api/drugs", json={"hsn": "1234"}, headers=auth_headers)
    assert resp.status_code == 422 # Pydantic validation error

    # Test missing drug_id in batch
    resp = client.post("/api/batches", json={"batch_no": "B1", "expiry": "2025"}, headers=auth_headers)
    assert resp.status_code == 422


def test_search_by_problem(client, auth_headers):
    # Add a drug with indications, side effects, and administration details
    drug_data = {
        "name": "HeadacheGone 200mg",
        "brand": "SymptomRelief",
        "composition": "Ibuprofen + Caffeine",
        "category": "Pain Killer",
        "schedule": "OTC",
        "hsn": "30049099",
        "tablets_per_strip": 10,
        "strips_per_box": 10,
        "mrp_per_strip": 25.0,
        "mrp_per_tablet": 2.5,
        "reorder_level": 5,
        "indications": "migraine, severe headache, tension headache",
        "side_effects": "stomach upset, insomnia",
        "administration": "Take 1 tablet after food every 6 hours"
    }
    resp = client.post("/api/drugs", json=drug_data, headers=auth_headers)
    assert resp.status_code == 200
    drug_id = resp.json()["id"]

    # Search by problem
    resp = client.get("/api/drugs/search_by_problem?q=migraine", headers=auth_headers)
    assert resp.status_code == 200
    results = resp.json()
    assert len(results) > 0
    match = [r for r in results if r["id"] == drug_id]
    assert len(match) == 1
    assert match[0]["indications"] == "migraine, severe headache, tension headache"
    assert match[0]["side_effects"] == "stomach upset, insomnia"
    assert match[0]["administration"] == "Take 1 tablet after food every 6 hours"

def test_delete_drug_without_billing_history(client, auth_headers):
    # 1. Add a drug
    resp = client.post("/api/drugs", json={"name": "DeleteMe 500mg", "tablets_per_strip": 10}, headers=auth_headers)
    assert resp.status_code == 200
    drug_id = resp.json()["id"]

    # 2. Add batch which creates stock log
    batch_data = {
        "drug_id": drug_id,
        "batch_no": "DEL-B1",
        "expiry": "2028-12",
        "strips": 5
    }
    client.post("/api/batches", json=batch_data, headers=auth_headers)

    # 3. Try to delete the drug
    del_resp = client.delete(f"/api/drugs/{drug_id}", headers=auth_headers)
    assert del_resp.status_code == 200

    # 4. Verify drug no longer exists
    get_resp = client.get(f"/api/drugs/{drug_id}", headers=auth_headers)
    assert get_resp.status_code == 404

def test_delete_drug_fails_with_billing_history(client, auth_headers):
    # 1. Add a drug
    resp = client.post("/api/drugs", json={"name": "KeepMe 500mg", "tablets_per_strip": 10}, headers=auth_headers)
    drug_id = resp.json()["id"]

    # 2. Add batch
    batch_data = {
        "drug_id": drug_id,
        "batch_no": "KEEP-B1",
        "expiry": "2028-12",
        "strips": 5
    }
    client.post("/api/batches", json=batch_data, headers=auth_headers)

    # 3. Create a bill referencing this drug
    bill_data = {
        "patient_name": "Test Customer",
        "phone": "9999999999",
        "items": [{"drug_id": drug_id, "tablets_qty": 5}],
        "discount_pct": 0.0,
        "payment_mode": "Cash",
        "points_redeemed": 0
    }
    bill_resp = client.post("/api/bills", json=bill_data, headers=auth_headers)
    assert bill_resp.status_code == 200

    # 4. Try to delete the drug
    del_resp = client.delete(f"/api/drugs/{drug_id}", headers=auth_headers)
    assert del_resp.status_code == 400
    assert "billing history" in del_resp.json()["detail"]
