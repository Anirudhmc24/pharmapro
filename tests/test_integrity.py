import pytest
import sqlite3
import time

def test_sql_reflection_directly(client, auth_headers, temp_db_path):
    # Perform an API action: Add a customer
    customer_data = {"name": "Integrity Test", "phone": "9998887776"}
    resp = client.post("/api/customers", json=customer_data, headers=auth_headers)
    assert resp.status_code == 200
    customer_id = resp.json().get("id")

    # Connect directly to the SQLite database and assert the data is committed
    with sqlite3.connect(temp_db_path) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute("SELECT * FROM customers WHERE id=?", (customer_id,)).fetchone()
        
        assert row is not None
        assert row["name"] == "Integrity Test"
        assert row["phone"] == "9998887776"

def test_stress_invoice_generation(client, auth_headers):
    """
    Stress Test: Seeding 50+ unique drugs and generating a single POS invoice
    with 50 line items to measure database execution and API stability.
    """
    num_items = 55
    drug_ids = []
    
    # 1. Seed 55 drugs and batches
    for i in range(num_items):
        drug_data = {
            "name": f"StressDrug_{i}",
            "tablets_per_strip": 10,
            "mrp_per_tablet": 2.0
        }
        drug_id = client.post("/api/drugs", json=drug_data, headers=auth_headers).json()["id"]
        drug_ids.append(drug_id)
        
        batch_data = {
            "drug_id": drug_id,
            "batch_no": f"STR-{i}",
            "expiry": "2030-01",
            "strips": 10
        }
        client.post("/api/batches", json=batch_data, headers=auth_headers)

    # 2. Build massive bill payload
    bill_items = [{"drug_id": did, "tablets_qty": 5} for did in drug_ids]
    bill_data = {
        "patient_name": "Stress Patient",
        "items": bill_items
    }
    
    # 3. Time the execution
    start_time = time.time()
    resp = client.post("/api/bills", json=bill_data, headers=auth_headers)
    end_time = time.time()
    
    assert resp.status_code == 200
    bill_info = resp.json()
    assert bill_info["bill_no"] is not None
    
    # Mathematical assertion
    # 55 items * 5 tablets * $2.0 = 550 subtotal
    assert bill_info["subtotal"] == 550.0
    
    execution_time = end_time - start_time
    print(f"Stress test executed 55-item invoice in {execution_time:.3f} seconds")
    # Assert it executes within a reasonable time, e.g., < 3 seconds
    assert execution_time < 3.0, f"Invoice generation is too slow! Took {execution_time:.3f}s"
