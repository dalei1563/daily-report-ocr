import os
from pathlib import Path

os.environ["DATABASE_URL"] = "sqlite:///./test_app.db"
os.environ["DATA_DIR"] = "./test_data"

from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def auth_headers():
    res = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    assert res.status_code == 200
    return {"Authorization": f"Bearer {res.json()['access_token']}"}


def test_template_seed_and_login():
    headers = auth_headers()
    assert client.get("/api/auth/me", headers=headers).status_code == 200
    templates = client.get("/api/templates", headers=headers)
    assert templates.status_code == 200
    assert templates.json()[0]["fields"]


def test_upload_detail_and_export():
    headers = auth_headers()
    template_id = client.get("/api/templates", headers=headers).json()[0]["id"]
    response = client.post(
        "/api/records/upload",
        headers=headers,
        data={"template_id": str(template_id)},
        files={"file": ("sample.jpg", b"fake-image", "image/jpeg")},
    )
    assert response.status_code == 200
    record_id = response.json()["id"]
    detail = client.get(f"/api/records/{record_id}", headers=headers)
    assert detail.status_code == 200
    assert detail.json()["status"] == "uploaded"
    export = client.post("/api/records/export", headers=headers)
    assert export.status_code == 200
    assert export.content


def test_non_admin_cannot_manage_templates():
    headers = auth_headers()
    created = client.post("/api/users", headers=headers, json={"username": "worker", "password": "worker123", "role": "user"})
    assert created.status_code in (200, 400)
    token = client.post("/api/auth/login", json={"username": "worker", "password": "worker123"}).json()["access_token"]
    user_headers = {"Authorization": f"Bearer {token}"}
    denied = client.post("/api/templates", headers=user_headers, json={"name": "x", "fields": []})
    assert denied.status_code == 403
