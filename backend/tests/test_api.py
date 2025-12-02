from fastapi.testclient import TestClient

from app.main import ADDIN_ORIGIN, app

client = TestClient(app)


def test_health():
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_detect_returns_one_list_per_paragraph():
    response = client.post(
        "/api/detect",
        json={"paragraphs": ["Reach me at jane.doe@example.com", "Nothing here."]},
    )
    assert response.status_code == 200
    paragraphs = response.json()["paragraphs"]
    assert len(paragraphs) == 2
    assert paragraphs[0][0]["marker"] == "[REDACTED EMAIL]"
    assert paragraphs[0][0]["start"] == 12
    assert paragraphs[1] == []


def test_detect_rejects_bad_payload():
    assert client.post("/api/detect", json={"text": "wrong shape"}).status_code == 422


def test_cors_allows_task_pane_origin_only():
    preflight = {"Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type"}

    allowed = client.options("/api/detect", headers={"Origin": ADDIN_ORIGIN, **preflight})
    assert allowed.headers.get("access-control-allow-origin") == ADDIN_ORIGIN

    blocked = client.options("/api/detect", headers={"Origin": "https://evil.example", **preflight})
    assert "access-control-allow-origin" not in blocked.headers
