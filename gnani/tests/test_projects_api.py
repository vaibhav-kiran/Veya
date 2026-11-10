"""
Saved projects: stored after a confirmed conversation, scoped by the
X-Veya-User header, editable, with README download and on-demand image.
"""

from tests.conftest import FIXED_ANSWERS, extraction_json

ALICE = {"X-Veya-User": "user_alice"}
BOB = {"X-Veya-User": "user_bob"}


def generate_project(client, fakes, headers=ALICE) -> dict:
    start = client.post("/conversation/start", json={"preferred_language": "English"}, headers=headers)
    assert start.status_code == 200, start.text
    session_id = start.json()["session_id"]
    for answer in FIXED_ANSWERS:
        assert client.post(f"/conversation/{session_id}/respond", data={"text": answer}).status_code == 200
    fakes.llm.queue(extraction_json())
    assert client.post(f"/conversation/{session_id}/summary").status_code == 200
    confirm = client.post(f"/conversation/{session_id}/confirm")
    assert confirm.status_code == 200, confirm.text
    return confirm.json()


def test_confirm_saves_project_for_the_user(client, fakes):
    confirmed = generate_project(client, fakes)
    project_id = confirmed["project_id"]
    assert project_id

    listing = client.get("/projects", headers=ALICE).json()["projects"]
    assert [item["project_id"] for item in listing] == [project_id]
    assert listing[0]["has_readme"] and listing[0]["has_diagram"]

    project = client.get(f"/projects/{project_id}", headers=ALICE).json()
    assert project["title"] == "HealthBand"
    assert project["source"] == "conversation"
    assert project["readme_markdown"].startswith("# HealthBand")
    assert project["workflow_diagram"].startswith("flowchart")
    assert project["sections"]["overview"] == "Health band"
    assert "Python" in project["sections"]["tech_stack"]
    assert project["sections"]["architecture"] == "1. build"
    # Internal data never leaves the server.
    assert "owner_id" not in project and "visual_generation_input" not in project


def test_second_confirm_returns_same_project(client, fakes):
    confirmed = generate_project(client, fakes)
    again = client.post(f"/conversation/{confirmed['session_id']}/confirm").json()
    assert again["project_id"] == confirmed["project_id"]
    assert len(client.get("/projects", headers=ALICE).json()["projects"]) == 1


def test_projects_are_separated_by_user(client, fakes):
    project_id = generate_project(client, fakes)["project_id"]
    assert client.get("/projects", headers=BOB).json()["projects"] == []
    assert client.get(f"/projects/{project_id}", headers=BOB).status_code == 404
    assert client.get(f"/projects/{project_id}").status_code == 404


def test_create_update_delete_manual_project(client):
    created = client.post("/projects", json={"title": "  Garden bot ", "sections": {"overview": "Waters plants"}}, headers=ALICE)
    assert created.status_code == 201, created.text
    project = created.json()
    assert project["title"] == "Garden bot" and project["source"] == "manual"
    project_id = project["project_id"]

    updated = client.patch(f"/projects/{project_id}", json={"sections": {"tech_stack": "ESP32"}}, headers=ALICE).json()
    assert updated["sections"]["tech_stack"] == "ESP32"
    assert updated["sections"]["overview"] == "Waters plants"

    assert client.patch(f"/projects/{project_id}", json={"title": "  "}, headers=ALICE).status_code == 422
    assert client.patch(f"/projects/{project_id}", json={"sections": {"unknown": "x"}}, headers=ALICE).status_code == 422

    assert client.delete(f"/projects/{project_id}", headers=ALICE).status_code == 204
    assert client.get(f"/projects/{project_id}", headers=ALICE).status_code == 404


def test_readme_download(client, fakes):
    project_id = generate_project(client, fakes)["project_id"]
    response = client.get(f"/projects/{project_id}/readme", headers=ALICE)
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/markdown")
    assert 'filename="HealthBand_README.md"' in response.headers["content-disposition"]
    assert response.text.startswith("# HealthBand")


def test_readme_missing_for_manual_project(client):
    project_id = client.post("/projects", json={"title": "Empty"}, headers=ALICE).json()["project_id"]
    assert client.get(f"/projects/{project_id}/readme", headers=ALICE).status_code == 404


def test_image_generated_only_on_request(client, fakes):
    project_id = generate_project(client, fakes)["project_id"]
    assert fakes.image.calls == []

    response = client.post(f"/projects/{project_id}/generate-image", headers=ALICE)
    assert response.status_code == 200, response.text
    assert response.json()["image_url"] == "/generated_images/HealthBand.png"
    assert len(fakes.image.calls) == 1
    assert client.get(f"/projects/{project_id}", headers=ALICE).json()["image_url"] == "/generated_images/HealthBand.png"


def test_image_needs_visual_data(client):
    project_id = client.post("/projects", json={"title": "Manual"}, headers=ALICE).json()["project_id"]
    assert client.post(f"/projects/{project_id}/generate-image", headers=ALICE).status_code == 409


def test_session_image_is_attached_to_saved_project(client, fakes):
    confirmed = generate_project(client, fakes)
    assert client.post(f"/conversation/{confirmed['session_id']}/generate-image").status_code == 200
    project = client.get(f"/projects/{confirmed['project_id']}", headers=ALICE).json()
    assert project["image_url"] == "/generated_images/HealthBand.png"


def test_invalid_project_id_is_rejected(client):
    assert client.get("/projects/not-a-real-id", headers=ALICE).status_code == 422
