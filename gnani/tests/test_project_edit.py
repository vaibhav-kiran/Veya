"""Changing a saved project's plan by voice or text: only the asked-for sections change, and it can be undone."""

import json

from fastapi import FastAPI
from fastapi.testclient import TestClient

from services.project_edit import apply_edits, edit_readme, split_sections
from services.project_store import ProjectRepository
from services.project_store.schemas import SectionsUpdate
from tests.conftest import FakeLLMClient
from webapp.auth import Authenticator
from webapp.project_routes import router

README = """# FoodShare

Intro line.

## 1. Overview
Share leftover canteen food.

## 4. Technology Stack
| Part | Technology | Why |
|---|---|---|
| Database | PostgreSQL | reliable |

## 7. Implementation Plan
### 7.1 Project Structure
```text
## not a heading (inside code)
backend/main.py
```

## 9. Timeline
Week 1: setup.
"""


def reply(**data) -> str:
    return json.dumps(data)


# ---------------- sections ----------------


def test_split_sections_ignores_headings_in_code_and_subsections():
    headings = [heading for heading, _ in split_sections(README)]
    assert headings == [None, "## 1. Overview", "## 4. Technology Stack", "## 7. Implementation Plan", "## 9. Timeline"]


def test_apply_edits_changes_only_the_named_sections():
    new, changed = apply_edits(
        README,
        [{"heading": "## 4. Technology Stack", "content": "## 4. Technology Stack\n| Database | Firebase | free |"}],
    )
    assert changed == ["4. Technology Stack"]
    assert "Firebase" in new and "PostgreSQL" not in new
    assert "Share leftover canteen food." in new and "Week 1: setup." in new
    assert "## not a heading (inside code)" in new


def test_apply_edits_matches_loosely_adds_and_removes():
    new, changed = apply_edits(
        README,
        [
            {"heading": "Timeline", "content": "Week 1: everything."},  # no ## and no number
            {"heading": "## 13. Pitch", "content": "## 13. Pitch\nThree slides."},  # new
            {"heading": "## 1. Overview", "content": ""},  # removed
        ],
    )
    assert "## Timeline\nWeek 1: everything." in new or "Week 1: everything." in new
    assert new.rstrip().endswith("Three slides.")
    assert "## 1. Overview" not in new
    assert set(changed) == {"Timeline", "13. Pitch", "1. Overview"}


def test_unchanged_content_is_not_a_change():
    _, changed = apply_edits(README, [{"heading": "## 9. Timeline", "content": "## 9. Timeline\nWeek 1: setup."}])
    assert changed == []


def test_edit_readme_asks_again_when_not_understood():
    llm = FakeLLMClient([reply(understood=False, summary="What should I change?", edits=[])])
    result = edit_readme(llm, "m", "FoodShare", README, "hmm")
    assert not result.changed and result.readme_markdown == README
    assert result.summary == "What should I change?"


def test_edit_readme_sends_the_plan_and_the_request():
    llm = FakeLLMClient([reply(understood=True, summary="Switched to Firebase.", edits=[{"heading": "## 4. Technology Stack", "content": "## 4. Technology Stack\nFirebase"}])])
    result = edit_readme(llm, "m", "FoodShare", README, "use firebase instead", "Hindi")
    assert result.changed and result.summary == "Switched to Firebase."
    sent = llm.calls[0]["messages"]
    assert "Hindi" in sent[0]["content"]
    assert "use firebase instead" in sent[1]["content"] and "## 9. Timeline" in sent[1]["content"]


# ---------------- routes ----------------


def make_client(tmp_path, replies):
    app = FastAPI()
    app.include_router(router)
    app.state.authenticator = Authenticator(mode="header")
    app.state.project_repository = ProjectRepository(tmp_path / "projects.db")
    app.state.llm_models = {"qwen": (FakeLLMClient(replies), "m")}
    return app, TestClient(app)


def saved_project(app, owner="alice") -> str:
    repository = app.state.project_repository
    project = repository.create_manual(owner, "FoodShare", SectionsUpdate())
    project.readme_markdown = README
    repository._write(project)
    return project.project_id


ALICE = {"X-Veya-User": "alice"}


def test_edit_route_saves_the_change_and_undo_puts_it_back(tmp_path):
    app, client = make_client(
        tmp_path,
        [reply(understood=True, summary="Switched to Firebase.", edits=[{"heading": "## 4. Technology Stack", "content": "## 4. Technology Stack\nFirebase"}])],
    )
    project_id = saved_project(app)

    response = client.post(f"/projects/{project_id}/edit", json={"instruction": "use firebase", "model": "qwen"}, headers=ALICE)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["changed"] and body["changed_sections"] == ["4. Technology Stack"]
    assert "Firebase" in body["project"]["readme_markdown"] and body["project"]["can_undo_edit"]
    assert "previous_readme_markdown" not in body["project"]
    assert "Firebase" in client.get(f"/projects/{project_id}", headers=ALICE).json()["readme_markdown"]

    undone = client.post(f"/projects/{project_id}/edit/undo", headers=ALICE).json()
    assert undone["readme_markdown"] == README and not undone["can_undo_edit"]


def test_edit_route_is_per_user_and_checks_the_model(tmp_path):
    app, client = make_client(tmp_path, [])
    project_id = saved_project(app)
    assert client.post(f"/projects/{project_id}/edit", json={"instruction": "x"}, headers={"X-Veya-User": "bob"}).status_code == 404
    gemini = client.post(f"/projects/{project_id}/edit", json={"instruction": "x", "model": "gemini"}, headers=ALICE)
    assert gemini.status_code == 503 and "Gemini" in gemini.json()["detail"]


def test_edit_route_reports_a_model_failure(tmp_path):
    app, client = make_client(tmp_path, ["not json"])
    project_id = saved_project(app)
    response = client.post(f"/projects/{project_id}/edit", json={"instruction": "add dark mode"}, headers=ALICE)
    assert response.status_code == 422
    assert client.get(f"/projects/{project_id}", headers=ALICE).json()["readme_markdown"] == README
