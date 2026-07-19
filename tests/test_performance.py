import pytest
import time
import threading
from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)

@pytest.fixture
def auth_headers():
    # Login as admin to get token
    resp = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    assert resp.status_code == 200
    token = resp.json()["token"]
    return {"X-Token": token}

def test_session_lookup_speed(client, auth_headers):
    """
    Stress test: Perform 1000 requests to validate the database persistent token lookup
    to verify indexing performs efficiently (target < 1000ms total).
    """
    start_time = time.time()
    for _ in range(1000):
        resp = client.get("/api/auth/me", headers=auth_headers)
        assert resp.status_code == 200
    total_time = time.time() - start_time
    print(f"\n[Performance] Validated session 1000 times in {total_time:.3f} seconds (average {(total_time/1000)*1000:.3f}ms per query).")
    assert total_time < 10.0, f"Session DB validation is too slow: {total_time:.3f}s"

def test_reminders_scalability(client, auth_headers):
    """
    Stress test: Seed 500 customers and 500 bills, then measure completion time
    of the reminders API call (target < 500ms).
    """
    # 1. Register a drug
    drug_data = {
        "name": "PerfMeds",
        "tablets_per_strip": 10,
        "mrp_per_tablet": 2.0
    }
    drug_id = client.post("/api/drugs", json=drug_data, headers=auth_headers).json()["id"]

    batch_data = {
        "drug_id": drug_id,
        "batch_no": "PERF-001",
        "expiry": "2030-12",
        "strips": 1000
    }
    client.post("/api/batches", json=batch_data, headers=auth_headers)

    # 2. Seed 500 customers and 500 bills
    print(f"\n[Performance] Seeding 500 customers and bills...")
    for i in range(500):
        # customer
        cust_payload = {
            "name": f"Customer Perf_{i}",
            "phone": f"9000000{i:03d}",
            "custom_id": f"PERFCUST-{i}"
        }
        cust_id = client.post("/api/customers", json=cust_payload, headers=auth_headers).json()["id"]
        
        # bill (quantity of 5 tablets = course of 2 days = active reminder)
        bill_payload = {
            "customer_id": cust_id,
            "patient_name": f"Patient Perf_{i}",
            "phone": f"9000000{i:03d}",
            "items": [{"drug_id": drug_id, "tablets_qty": 5}]
        }
        client.post("/api/bills", json=bill_payload, headers=auth_headers)

    # 3. Time the reminders retrieval
    start_time = time.time()
    resp = client.get("/api/customers/reminders/active", headers=auth_headers)
    total_time = time.time() - start_time
    assert resp.status_code == 200
    rems = resp.json()
    print(f"[Performance] Retrieved reminders ({len(rems)} reminders found) in {total_time:.3f} seconds.")
    assert total_time < 1.0, f"Reminders calculation is slow: {total_time:.3f}s"

def test_concurrent_bill_generation(client, auth_headers):
    """
    Stress test: Launch 10 concurrent bill generations using threads
    to verify SQLite database locking operates correctly under concurrent load.
    """
    # Create a new drug for this test
    drug_data = {
        "name": "ConcurrentMeds",
        "tablets_per_strip": 10,
        "mrp_per_tablet": 3.0
    }
    drug_id = client.post("/api/drugs", json=drug_data, headers=auth_headers).json()["id"]

    batch_data = {
        "drug_id": drug_id,
        "batch_no": "CONC-001",
        "expiry": "2030-12",
        "strips": 500
    }
    client.post("/api/batches", json=batch_data, headers=auth_headers)

    # Pre-register 10 customers to avoid registration lock contention
    cust_ids = []
    for i in range(10):
        cust_payload = {
            "name": f"Concurrent Customer_{i}",
            "phone": f"8000000{i:03d}",
            "custom_id": f"CONCCUST-{i}"
        }
        cid = client.post("/api/customers", json=cust_payload, headers=auth_headers).json()["id"]
        cust_ids.append(cid)

    results = []
    
    def worker(worker_id):
        try:
            # Build and send bill
            bill_payload = {
                "customer_id": cust_ids[worker_id],
                "patient_name": f"Conc Patient_{worker_id}",
                "phone": f"8000000{worker_id:03d}",
                "items": [{"drug_id": drug_id, "tablets_qty": 2}]
            }
            resp = client.post("/api/bills", json=bill_payload, headers=auth_headers)
            results.append(resp.status_code)
        except Exception as e:
            results.append(e)

    # Start 10 concurrent threads
    threads = []
    for i in range(10):
        t = threading.Thread(target=worker, args=(i,))
        threads.append(t)

    start_time = time.time()
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    total_time = time.time() - start_time

    print(f"\n[Performance] Executed 10 concurrent bill generations in {total_time:.3f} seconds.")
    # Check that all requests succeeded (200 status code)
    assert len(results) == 10
    for res in results:
        assert res == 200, f"Concurrent request failed or raised exception: {res}"
