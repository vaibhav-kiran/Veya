import time

from fastapi.testclient import TestClient

from app.main import create_app
from tests.conftest import PROFILE, make_settings
from tests.fakes import FakeLLM, fake_sources


def client(**kwargs) -> TestClient:
    return TestClient(create_app(make_settings(), llm=kwargs.get("llm") or FakeLLM(), sources=fake_sources()))


def wait_until_done(api: TestClient, session_id: str) -> dict:
    for _ in range(200):
        status = api.get(f"/api/v1/idea-discovery/{session_id}/status").json()
        if status["status"] in {"completed", "failed"}:
            return status
        time.sleep(0.05)
    raise AssertionError("research did not finish")


def test_full_api_flow():
    with client() as api:
        assert api.get("/health").json()["research_mode"] == "live"

        started = api.post("/api/v1/idea-discovery/start", json={"profile": {"interests": ["healthcare"]}})
        assert started.status_code == 201
        body = started.json()
        assert body["status"] == "created" and body["clarifying_questions"]
        session_id = body["session_id"]

        running = api.post(f"/api/v1/idea-discovery/{session_id}/research", json={"profile_update": PROFILE})
        assert running.status_code == 202
        status = wait_until_done(api, session_id)
        assert status["status"] == "completed", status
        assert status["counts"]["selected_ideas"] >= 1

        results = api.get(f"/api/v1/idea-discovery/{session_id}/results").json()
        assert 1 <= len(results["recommended_ideas"]) <= 3
        assert results["evidence"] and all(e["url"].startswith("https://") for e in results["evidence"])
        assert "novel" in results["disclaimer"]
        assert results["profile"]["budget"] == "3000 rupees"

        idea_id = results["recommended_ideas"][0]["idea"]["idea_id"]
        assert api.get(f"/api/v1/ideas/{idea_id}").json()["idea"]["idea_id"] == idea_id

        refined = api.post(f"/api/v1/ideas/{idea_id}/refine", json={"feedback": "Make it cheaper"})
        assert refined.status_code == 200
        assert refined.json()["idea"]["revision"] == 1
        assert refined.json()["idea"]["title"].endswith("(revised)")

        evaluated = api.post(f"/api/v1/ideas/{idea_id}/evaluate", json={"profile_update": {"deadline": "2 weeks"}})
        assert evaluated.status_code == 200 and evaluated.json()["critique"] is not None


def test_auto_start_runs_immediately():
    with client() as api:
        body = api.post("/api/v1/idea-discovery/start", json={"profile": PROFILE, "auto_start": True}).json()
        assert body["status"] == "running"
        assert wait_until_done(api, body["session_id"])["status"] == "completed"


def test_errors_are_clear():
    with client() as api:
        assert api.get("/api/v1/idea-discovery/nope/status").status_code == 404
        assert api.get("/api/v1/ideas/nope").json() == {"detail": "This idea does not exist."}

        session_id = api.post("/api/v1/idea-discovery/start", json={"profile": {}}).json()["session_id"]
        response = api.post(f"/api/v1/idea-discovery/{session_id}/research")
        assert response.status_code == 409 and "interest" in response.json()["detail"]

        assert api.post("/api/v1/idea-discovery/start", json={"profile": {}, "unknown": 1}).status_code == 422
        assert api.post("/api/v1/ideas/x/refine", json={"feedback": ""}).status_code == 422
