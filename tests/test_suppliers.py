import pytest

def test_add_and_delete_supplier_success(client, auth_headers):
    # 1. Add a new supplier
    sup_data = {
        "name": "Supplier To Delete",
        "contact": "John",
        "phone": "1234567890",
        "email": "john@delete.com",
        "gstin": "29ABCDE1234F1Z5"
    }
    resp = client.post("/api/suppliers", json=sup_data, headers=auth_headers)
    assert resp.status_code == 200
    sup_id = resp.json().get("id")
    assert sup_id is not None

    # 2. Delete the supplier
    del_resp = client.delete(f"/api/suppliers/{sup_id}", headers=auth_headers)
    assert del_resp.status_code == 200

    # 3. Verify supplier is no longer in list
    list_resp = client.get("/api/suppliers", headers=auth_headers)
    assert list_resp.status_code == 200
    sups = list_resp.json()
    assert not any(s["id"] == sup_id for s in sups)

def test_delete_supplier_fails_with_purchase_order(client, auth_headers):
    # 1. Add a supplier
    sup_data = {
        "name": "Supplier With PO",
        "contact": "Alice"
    }
    resp = client.post("/api/suppliers", json=sup_data, headers=auth_headers)
    assert resp.status_code == 200
    sup_id = resp.json().get("id")

    # 2. Add drug
    drug_resp = client.post("/api/drugs", json={"name": "SupplierTestDrug", "tablets_per_strip": 10}, headers=auth_headers)
    drug_id = drug_resp.json()["id"]

    # 3. Create a purchase order link
    po_data = {
        "supplier_id": sup_id,
        "notes": "Test PO",
        "items": [{"drug_id": drug_id, "qty_strips": 5}]
    }
    po_resp = client.post("/api/purchase_orders", json=po_data, headers=auth_headers)
    assert po_resp.status_code == 200

    # 4. Try to delete the supplier
    del_resp = client.delete(f"/api/suppliers/{sup_id}", headers=auth_headers)
    assert del_resp.status_code == 400
    assert "Purchase Orders exist" in del_resp.json()["detail"]


def test_supplier_return_invoice_and_pdf(client, auth_headers):
    sup_resp = client.post("/api/suppliers", json={"name": "Dealer XYZ", "contact": "Dealer Contact"}, headers=auth_headers)
    sup_id = sup_resp.json()["id"]

    drug_resp = client.post("/api/drugs", json={"name": "Returnable Tab", "tablets_per_strip": 10}, headers=auth_headers)
    drug_id = drug_resp.json()["id"]

    batch_resp = client.post("/api/batches", json={
        "drug_id": drug_id,
        "batch_no": "RET-001",
        "expiry": "2029-06",
        "strips": 10,
        "cost_per_strip": 50.0
    }, headers=auth_headers)
    batch_id = batch_resp.json()["batch_id"]

    # Create supplier return
    ret_payload = {
        "supplier_id": sup_id,
        "reason": "Customer Rejected",
        "notes": "Returned 2 strips",
        "items": [
            {
                "drug_id": drug_id,
                "batch_id": batch_id,
                "strips": 2,
                "unit_cost": 50.0,
                "reason": "Customer Rejected"
            }
        ]
    }
    ret_resp = client.post("/api/suppliers/returns", json=ret_payload, headers=auth_headers)
    assert ret_resp.status_code == 200
    ret_data = ret_resp.json()
    assert ret_data["ok"] is True
    assert ret_data["total_amount"] == 100.0
    return_id = ret_data["id"]

    # Verify PDF generation (inline and attachment)
    pdf_inline = client.get(f"/api/suppliers/returns/{return_id}/pdf", headers=auth_headers)
    assert pdf_inline.status_code == 200
    assert pdf_inline.headers["content-type"] == "application/pdf"
    assert "inline" in pdf_inline.headers["content-disposition"]

    pdf_download = client.get(f"/api/suppliers/returns/{return_id}/pdf?download=1", headers=auth_headers)
    assert pdf_download.status_code == 200
    assert pdf_download.headers["content-type"] == "application/pdf"
    assert "attachment" in pdf_download.headers["content-disposition"]

