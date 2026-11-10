"""
Plans: who has which plan, entitlements on the routes, and GET /plan.
"""

from typing import Any

from services.plans import Plan, PlanResolver, build_plan_configs
from services.plans import plans as plans_module
from tests.conftest import FIXED_ANSWERS, extraction_json


def test_plan_resolver_defaults_and_paid_users():
    resolver = PlanResolver(default_plan="free", paid_users={"user_paid"})
    assert resolver.plan_for("user_paid") == Plan.PAID
    assert resolver.plan_for("someone") == Plan.FREE
    assert resolver.plan_for(None) == Plan.FREE


def test_conversation_remembers_the_users_plan(service, store):
    import asyncio

    service.plan_resolver = PlanResolver(default_plan="free", paid_users={"user_paid"})
    session_id = asyncio.run(service.start_conversation(owner_id="user_paid")).session_id
    assert store.get_conversation(session_id).plan == "paid"


def limited_configs(**entitlements: Any) -> dict:
    configs = build_plan_configs()
    free = configs[Plan.FREE]
    configs[Plan.FREE] = plans_module.PlanConfig(
        plan=free.plan, label=free.label, entitlements=plans_module.Entitlements(**entitlements)
    )
    return configs


def test_free_plan_project_limit_blocks_new_projects(client, monkeypatch):
    monkeypatch.setattr(plans_module, "PLAN_CONFIGS", limited_configs(max_projects=1))
    headers = {"X-Veya-User": "user_free"}

    assert client.post("/projects", json={"title": "One"}, headers=headers).status_code == 201
    blocked = client.post("/projects", json={"title": "Two"}, headers=headers)
    assert blocked.status_code == 403
    assert "1 saved project" in blocked.json()["detail"]


def test_free_plan_without_images_gets_403(client, fakes, monkeypatch):
    monkeypatch.setattr(plans_module, "PLAN_CONFIGS", limited_configs(image_generation=False))
    headers = {"X-Veya-User": "user_free"}
    session_id = client.post("/conversation/start", json={}, headers=headers).json()["session_id"]
    for answer in FIXED_ANSWERS:
        client.post(f"/conversation/{session_id}/respond", data={"text": answer})
    fakes.llm.queue(extraction_json())
    client.post(f"/conversation/{session_id}/summary")
    project_id = client.post(f"/conversation/{session_id}/confirm").json()["project_id"]

    assert client.post(f"/conversation/{session_id}/generate-image").status_code == 403
    assert client.post(f"/projects/{project_id}/generate-image", headers=headers).status_code == 403
    assert fakes.image.calls == []


def test_get_plan(client):
    response = client.get("/plan", headers={"X-Veya-User": "user_free"})
    assert response.status_code == 200
    body = response.json()
    assert body["plan"] == "free"
    assert body["entitlements"]["image_generation"] is True
    assert body["projects_used"] == 0
