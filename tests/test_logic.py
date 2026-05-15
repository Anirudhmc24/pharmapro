import pytest
from datetime import date

@pytest.mark.xfail(reason="System currently does not block or warn about expired batches")
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
