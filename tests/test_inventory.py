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
