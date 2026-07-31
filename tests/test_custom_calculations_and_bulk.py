import pytest

def test_bulk_category_move(client, auth_headers):
    # 1. Add three drugs
    d1 = client.post("/api/drugs", json={"name": "Drug A", "category": "Ethical", "tablets_per_strip": 10}, headers=auth_headers).json()["id"]
    d2 = client.post("/api/drugs", json={"name": "Drug B", "category": "Generic", "tablets_per_strip": 10}, headers=auth_headers).json()["id"]
    d3 = client.post("/api/drugs", json={"name": "Drug C", "category": "Ointment", "tablets_per_strip": 10}, headers=auth_headers).json()["id"]

    # 2. Bulk move Drug A and Drug C to "Generic"
    resp = client.post("/api/drugs/bulk_category", json={"drug_ids": [d1, d3], "category": "Generic"}, headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json() == {"ok": True}

    # 3. Verify category change
    resp1 = client.get("/api/inventory", headers=auth_headers).json()
    
    # Map drug IDs to categories from inventory
    cat_map = {d["id"]: d["category"] for d in resp1}
    assert cat_map[d1] == "Generic"
    assert cat_map[d2] == "Generic"
    assert cat_map[d3] == "Generic"

    # 4. Bulk move Drug B and Drug C to "Ethnic" (should map to "Ethical" in DB)
    resp = client.post("/api/drugs/bulk_category", json={"drug_ids": [d2, d3], "category": "Ethnic"}, headers=auth_headers)
    assert resp.status_code == 200

    resp2 = client.get("/api/inventory", headers=auth_headers).json()
    cat_map2 = {d["id"]: d["category"] for d in resp2}
    assert cat_map2[d1] == "Generic"
    assert cat_map2[d2] == "Ethical"
    assert cat_map2[d3] == "Ethical"
