import os
import shutil
import pytest
from fastapi.testclient import TestClient
from backend.main import app
from backend.database import get_db

client = TestClient(app)

@pytest.fixture
def auth_header():
    # Login as admin to get token
    resp = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    assert resp.status_code == 200
    token = resp.json()["token"]
    return {"X-Token": token}

def test_db_export_unauthorized():
    # Attempting export without token should fail
    resp = client.get("/api/config/db/export")
    assert resp.status_code == 401

def test_db_export_success(auth_header):
    # Successful export
    resp = client.get("/api/config/db/export", headers=auth_header)
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/octet-stream"
    assert b"SQLite format 3" in resp.content[:16]

def test_db_export_query_token():
    # Get token first
    login_resp = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    token = login_resp.json()["token"]
    
    # Export using token in query string
    resp = client.get(f"/api/config/db/export?token={token}")
    assert resp.status_code == 200
    assert b"SQLite format 3" in resp.content[:16]

def test_db_import_invalid_file(auth_header):
    # Uploading a non-sqlite file should fail
    files = {"file": ("test.txt", b"invalid file content", "text/plain")}
    resp = client.post("/api/config/db/import", files=files, headers=auth_header)
    assert resp.status_code == 400
    assert "Invalid SQLite database file" in resp.json()["detail"]
