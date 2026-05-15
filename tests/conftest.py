import pytest
import sqlite3
import tempfile
from pathlib import Path
from fastapi.testclient import TestClient

from backend.main import app
from backend.database import SCHEMA, get_db

@pytest.fixture(scope="session")
def temp_db_path():
    # Create a temporary file for the database
    fd, path = tempfile.mkstemp(suffix=".db")
    yield path
    # Cleanup
    import os
    os.close(fd)
    try:
        os.remove(path)
    except PermissionError:
        pass

@pytest.fixture(autouse=True)
def mock_db_path(monkeypatch, temp_db_path):
    # Monkeypatch the database path in the backend so all connections use the temp db
    monkeypatch.setattr("backend.database.DB_PATH", Path(temp_db_path))

@pytest.fixture(scope="function", autouse=True)
def setup_db(temp_db_path, mock_db_path):
    # Initialize the database schema before each test
    with sqlite3.connect(temp_db_path) as conn:
        conn.executescript(SCHEMA)
        try: conn.execute("ALTER TABLE drugs ADD COLUMN barcode TEXT UNIQUE")
        except sqlite3.OperationalError: pass
        try: conn.execute("ALTER TABLE drugs ADD COLUMN zone TEXT DEFAULT 'B'")
        except sqlite3.OperationalError: pass
        try: conn.execute("ALTER TABLE prescriptions ADD COLUMN image_path TEXT")
        except sqlite3.OperationalError: pass
        
        # Insert admin user so authentication works
        try:
            from passlib.context import CryptContext
            pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
            hashed = pwd_ctx.hash("admin123")
        except Exception:
            import hashlib
            hashed = "sha256:" + hashlib.sha256("admin123".encode()).hexdigest()
            
        conn.execute(
            "INSERT OR IGNORE INTO users(username,display_name,password_hash,role) VALUES(?,?,?,?)",
            ("admin", "Administrator", hashed, "admin")
        )
        conn.commit()
    
    yield temp_db_path
    
    # Drop all tables after each test to ensure a clean slate
    with sqlite3.connect(temp_db_path) as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
        tables = cursor.fetchall()
        for table in tables:
            if table[0] != "sqlite_sequence":
                cursor.execute(f"DROP TABLE {table[0]};")
        conn.commit()

@pytest.fixture
def client():
    # Return the TestClient
    return TestClient(app)

@pytest.fixture
def auth_headers(client):
    # Authenticate and return the auth header
    response = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    assert response.status_code == 200, f"Login failed: {response.text}"
    token = response.json()["token"]
    return {"X-Token": token}
