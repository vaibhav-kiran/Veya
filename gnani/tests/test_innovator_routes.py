"""The /innovator proxy: forwards to the idea engine and turns its failures into friendly errors."""

import json

import httpx
from fastapi import FastAPI
from fastapi.testclient import TestClient

from webapp.innovator_routes import router


def make_client(handler) -> TestClient:
    app = FastAPI()
    app.include_router(router)
    app.state.innovator_http = httpx.AsyncClient(base_url="http://engine", transport=httpx.MockTransport(handler))
    return TestClient(app)


def test_start_forwards_profile_and_auto_starts():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["path"] = request.url.path
        seen["body"] = json.loads(request.content)
        return httpx.Response(201, json={"session_id": "ses_abc", "status": "running"})

    response = make_client(handler).post("/innovator/start", json={"profile": {"interests": ["agriculture"], "budget": None}})
    assert response.status_code == 201
    assert response.json()["session_id"] == "ses_abc"
    assert seen["path"] == "/api/v1/idea-discovery/start"
    assert seen["body"] == {"profile": {"interests": ["agriculture"]}, "auto_start": True}


def test_status_and_refine_paths():
    paths = []

    def handler(request: httpx.Request) -> httpx.Response:
        paths.append(request.url.path)
        return httpx.Response(200, json={"ok": True})

    client = make_client(handler)
    assert client.get("/innovator/ses_abc/status").status_code == 200
    assert client.get("/innovator/ses_abc/results").status_code == 200
    assert client.post("/innovator/ideas/idea_1/refine", json={"feedback": "make it cheaper"}).status_code == 200
    assert paths == [
        "/api/v1/idea-discovery/ses_abc/status",
        "/api/v1/idea-discovery/ses_abc/results",
        "/api/v1/ideas/idea_1/refine",
    ]


def test_engine_down_gives_503_with_a_readable_message():
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused")

    response = make_client(handler).get("/innovator/ses_abc/status")
    assert response.status_code == 503
    assert "isn't running" in response.json()["detail"]


def test_engine_errors_are_mapped():
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/status"):
            return httpx.Response(404, json={"detail": "Session not found"})
        return httpx.Response(500, text="boom")

    client = make_client(handler)
    assert client.get("/innovator/ses_gone/status").status_code == 404
    assert client.get("/innovator/ses_x/results").status_code == 502


def test_rejects_unknown_fields_and_odd_ids():
    client = make_client(lambda request: httpx.Response(200, json={}))
    assert client.post("/innovator/start", json={"profile": {"password": "x"}}).status_code == 422
    assert client.get("/innovator/..%2Fhealth/status").status_code == 404
