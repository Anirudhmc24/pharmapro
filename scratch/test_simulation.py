import sys
from pathlib import Path

# Add project root to sys.path
project_root = Path(__file__).parent.parent
sys.path.append(str(project_root))

from fastapi.testclient import TestClient
from backend.main import app
from backend.database import get_db

client = TestClient(app)

def test_generate_bills():
    # Login to get token or skip auth if test client allows
    # The endpoint uses get_current_user which checks X-Token
    # Let's see if we can get a token or mock it.
    # Or just use the admin user credentials to login first.
    
    login_res = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    assert login_res.status_code == 200
    token = login_res.json()["token"]
    
    response = client.post(
        "/api/simulation/generate_bills",
        json={"month": "2026-05", "target_amount": 5000},
        headers={"X-Token": token}
    )
    
    print("Response Status:", response.status_code)
    print("Response Body:", response.json())
    
    assert response.status_code == 200
    data = response.json()
    assert data["success"] == True
    assert data["bills_created"] > 0
    assert data["total_amount"] <= 5000 + 500
    assert data["total_amount"] >= 5000 - 10 # Should be close

if __name__ == "__main__":
    try:
        test_generate_bills()
        print("Test Passed!")
    except Exception as e:
        print("Test Failed:", e)
