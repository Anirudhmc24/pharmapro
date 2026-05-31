import os
import pytest
from backend.routers.scan import get_gemini_key

@pytest.fixture(autouse=True)
def clear_env_key():
    old_key = os.environ.get("GEMINI_API_KEY")
    if "GEMINI_API_KEY" in os.environ:
        del os.environ["GEMINI_API_KEY"]
    yield
    if old_key is not None:
        os.environ["GEMINI_API_KEY"] = old_key

def test_scan_no_key_behavior(client, auth_headers):
    # Try calling scan and assert it returns no_key error message because no key exists in env or DB
    scan_payload = {
        "mode": "strip",
        "image_b64": "SGVsbG8gd29ybGQ=", # "Hello world" base64
        "mime": "image/jpeg"
    }
    resp = client.post("/api/scan", json=scan_payload, headers=auth_headers)
    assert resp.status_code == 200
    res = resp.json()
    assert res["ok"] is False
    assert res["error"] == "no_key"
    assert "Add your Gemini API key" in res["message"]

def test_save_and_retrieve_gemini_key(client, auth_headers):
    # Set the Gemini API key in configuration
    config_payload = {
        "name": "PharmaPro Retail Test",
        "gemini_api_key": "AIzaSyTestKey123"
    }
    resp = client.post("/api/config", json=config_payload, headers=auth_headers)
    assert resp.status_code == 200
    
    # Verify it is returned in GET config
    resp = client.get("/api/config", headers=auth_headers)
    assert resp.status_code == 200
    cfg = resp.json()
    assert cfg.get("gemini_api_key") == "AIzaSyTestKey123"
    
    # Verify the helper function resolves it
    assert get_gemini_key() == "AIzaSyTestKey123"

def test_env_key_takes_precedence(client, auth_headers):
    # Set the Gemini API key in configuration
    config_payload = {
        "name": "PharmaPro Retail Test",
        "gemini_api_key": "AIzaSyTestKey123"
    }
    client.post("/api/config", json=config_payload, headers=auth_headers)
    
    # Set environment variable
    os.environ["GEMINI_API_KEY"] = "EnvKey456"
    
    # Environment variable should take precedence
    assert get_gemini_key() == "EnvKey456"


def test_clean_json_response():
    from backend.routers.scan import clean_json_response
    assert clean_json_response("```json\n{\"test\": 1}\n```") == '{"test": 1}'
    assert clean_json_response("Here is JSON:\n{\"test\": 1}\nHope it helps!") == '{"test": 1}'
    assert clean_json_response("[\n  {\"name\": \"item\"}\n]") == '[\n  {"name": "item"}\n]'


def test_parse_tolerant_json():
    from backend.routers.scan import parse_tolerant_json
    import json
    assert parse_tolerant_json('{"test": 1}') == {"test": 1}
    assert parse_tolerant_json("{'test': 1, 'name': 'hello'}") == {"test": 1, "name": "hello"}
    assert parse_tolerant_json('{"test": 1,}') == {"test": 1}
    assert parse_tolerant_json('{"ok": true, "err": false, "val": null}') == {"ok": True, "err": False, "val": None}
    
    with pytest.raises(json.JSONDecodeError):
        parse_tolerant_json('invalid string')

