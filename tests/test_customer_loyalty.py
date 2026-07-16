import pytest
import datetime
from backend.database import get_db

def test_customer_registration_and_loyalty(client, auth_headers):
    # Setup a drug
    drug_data = {
        "name": "LoyaltyMeds",
        "tablets_per_strip": 10,
        "mrp_per_tablet": 10.0
    }
    resp = client.post("/api/drugs", json=drug_data, headers=auth_headers)
    drug_id = resp.json()["id"]

    # add a batch with strips
    batch_data = {
        "drug_id": drug_id,
        "batch_no": "LOY-001",
        "expiry": "2029-12",
        "strips": 5
    }
    client.post("/api/batches", json=batch_data, headers=auth_headers)

    # Let's create a bill for a new customer by phone
    bill_data = {
        "patient_name": "Loyal Patient",
        "phone": "9998887776",
        "discount_pct": 0.0,
        "gst_inclusive": False,
        "items": [{"drug_id": drug_id, "tablets_qty": 20}]
    }
    resp = client.post("/api/bills", json=bill_data, headers=auth_headers)
    assert resp.status_code == 200
    bill_info = resp.json()
    total = int(bill_info["total"])
    
    # Verify that a customer was dynamically created
    resp_cust = client.get("/api/customers?q=9998887776", headers=auth_headers)
    assert resp_cust.status_code == 200
    customers = resp_cust.json()
    assert len(customers) == 1
    cust = customers[0]
    assert cust["phone"] == "9998887776"
    assert cust["custom_id"] == "887776"  # phone[-6:] is 887776
    assert cust["loyalty_points"] == total
    assert "LoyaltyMeds" in cust["purchased_medicines"]

def test_loyalty_redemption_and_discount(client, auth_headers):
    # Setup drug
    drug_data = {
        "name": "DiscountMeds",
        "tablets_per_strip": 10,
        "mrp_per_tablet": 5.0
    }
    resp = client.post("/api/drugs", json=drug_data, headers=auth_headers)
    drug_id = resp.json()["id"]

    batch_data = {
        "drug_id": drug_id,
        "batch_no": "DISC-001",
        "expiry": "2029-12",
        "strips": 10
    }
    client.post("/api/batches", json=batch_data, headers=auth_headers)

    # Create a customer with 10% agreed discount and 1000 loyalty points
    cust_data = {
        "name": "Vip Customer",
        "phone": "1112223334",
        "custom_id": "VIP-999",
        "dob": "1990-01-01",
        "agreed_discount": 10.0,
        "loyalty_points": 1000
    }
    resp_cust = client.post("/api/customers", json=cust_data, headers=auth_headers)
    assert resp_cust.status_code == 200
    cust_id = resp_cust.json()["id"]

    # Let's perform billing with redemption
    bill_data = {
        "customer_id": cust_id,
        "patient_name": "Vip Customer",
        "phone": "1112223334",
        "discount_pct": 10.0,
        "points_redeemed": 500,
        "gst_inclusive": False,
        "items": [{"drug_id": drug_id, "tablets_qty": 20}]
    }
    
    resp_bill = client.post("/api/bills", json=bill_data, headers=auth_headers)
    assert resp_bill.status_code == 200
    bill_info = resp_bill.json()
    assert abs(bill_info["total"] - 95.2) < 0.01

    # Verify that points were deducted and new points earned
    resp_cust = client.get(f"/api/customers", headers=auth_headers)
    cust = [c for c in resp_cust.json() if c["id"] == cust_id][0]
    assert cust["loyalty_points"] == 595
    assert cust["last_purchase_date"] != ""

def test_reminders_logic(client, auth_headers):
    # Setup drug
    drug_data = {
        "name": "ReminderMeds",
        "tablets_per_strip": 10,
        "mrp_per_tablet": 5.0
    }
    resp = client.post("/api/drugs", json=drug_data, headers=auth_headers)
    drug_id = resp.json()["id"]

    batch_data = {
        "drug_id": drug_id,
        "batch_no": "REM-001",
        "expiry": "2029-12",
        "strips": 100
    }
    client.post("/api/batches", json=batch_data, headers=auth_headers)

    # Register customer
    cust_data = {
        "name": "Remind Me",
        "phone": "4445556667",
        "custom_id": "REMIND-1",
        "dob": "1995-05-05",
        "agreed_discount": 0.0,
        "loyalty_points": 0
    }
    resp_cust = client.post("/api/customers", json=cust_data, headers=auth_headers)
    cust_id = resp_cust.json()["id"]

    # Bill them for 10 tablets (assumed at 2 tabs/day = course completes in 5 days)
    bill_data = {
        "customer_id": cust_id,
        "patient_name": "Remind Me",
        "phone": "4445556667",
        "discount_pct": 0.0,
        "gst_inclusive": False,
        "items": [{"drug_id": drug_id, "tablets_qty": 10}]
    }
    client.post("/api/bills", json=bill_data, headers=auth_headers)

    # Let's add a bill for 2 tablets
    bill_data2 = {
        "customer_id": cust_id,
        "patient_name": "Remind Me",
        "phone": "4445556667",
        "discount_pct": 0.0,
        "gst_inclusive": False,
        "items": [{"drug_id": drug_id, "tablets_qty": 2}]
    }
    client.post("/api/bills", json=bill_data2, headers=auth_headers)

    resp_rem2 = client.get("/api/customers/reminders/active", headers=auth_headers)
    assert resp_rem2.status_code == 200
    rems2 = resp_rem2.json()
    
    matches = [r for r in rems2 if r["customer_name"] == "Remind Me" and r["drug_name"] == "ReminderMeds"]
    assert len(matches) > 0
    match = matches[0]
    assert match["phone"] == "4445556667"
    assert match["status"] in ("Running Out", "Completed")
