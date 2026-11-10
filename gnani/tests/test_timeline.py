"""
Deadlines and phase timelines: phrase parsing, phase choice, and the API.
"""

from datetime import date, timedelta

import pytest

from services.conversation_manager.schemas import ProjectDetails
from services.project_store.timeline import build_timeline, parse_deadline
from tests.conftest import FIXED_ANSWERS, extraction_json

TUESDAY = date(2026, 11, 10)
USER = {"X-Veya-User": "user_timeline"}


@pytest.mark.parametrize(
    ("phrase", "expected"),
    [
        ("this weekend", date(2026, 11, 15)),
        ("in 10 days", date(2026, 11, 20)),
        ("two weeks", date(2026, 11, 24)),
        ("2-3 weeks", date(2026, 12, 1)),
        ("15 March", date(2027, 3, 15)),
        ("March 15th", date(2027, 3, 15)),
        ("14th of this month", date(2026, 11, 14)),
        ("3rd of next month", date(2026, 12, 3)),
        ("next Friday", date(2026, 11, 13)),
        ("tomorrow", date(2026, 11, 11)),
        ("end of the month", date(2026, 11, 30)),
        ("15/12/2026", date(2026, 12, 15)),
        ("2026-12-01", date(2026, 12, 1)),
        ("sometime soon", None),
        (None, None),
    ],
)
def test_parse_deadline(phrase, expected):
    assert parse_deadline(phrase, TUESDAY) == expected


def test_phases_fit_the_project_and_fill_the_days():
    details = ProjectDetails(initial_idea="A safety app with login", project_type="hackathon")
    plan = "**Frontend**: React Native\n**Backend**: Flask\n**AI/ML Models**: Not required\n**Hardware and Sensors**: None required"
    timeline = build_timeline(TUESDAY, TUESDAY + timedelta(days=9), details, plan)

    names = [phase.name for phase in timeline.phases]
    assert names == ["Plan & set up", "UI / Frontend", "Backend & database", "Authentication", "Core features", "Test & polish", "Demo & submission"]
    assert sum(phase.days for phase in timeline.phases) == timeline.total_days == 10
    assert timeline.phases[0].start_date == TUESDAY
    assert timeline.phases[-1].end_date == TUESDAY + timedelta(days=9)
    assert "Use React Native" in timeline.phases[1].focus


def test_hardware_and_ai_phases_only_when_needed():
    robot = ProjectDetails(initial_idea="Plant watering robot with a disease detection model", preferred_technologies=["Arduino", "TensorFlow"])
    names = [p.name for p in build_timeline(TUESDAY, TUESDAY + timedelta(days=20), robot).phases]
    assert "Hardware & sensors" in names and "AI / ML model" in names
    # Words in field names ("available_hardware") or resource lines don't count.
    web = ProjectDetails(initial_idea="A recipe website", available_hardware=["Laptop"])
    names = [p.name for p in build_timeline(TUESDAY, TUESDAY + timedelta(days=20), web).phases]
    assert "Hardware & sensors" not in names


def test_short_deadline_merges_phases_one_per_day():
    timeline = build_timeline(TUESDAY, TUESDAY + timedelta(days=1), ProjectDetails(initial_idea="An app with login"))
    assert len(timeline.phases) == 2
    assert all(phase.days == 1 for phase in timeline.phases)
    assert " + " in timeline.phases[0].name


def generate(client, fakes) -> dict:
    session_id = client.post("/conversation/start", json={}, headers=USER).json()["session_id"]
    for answer in FIXED_ANSWERS:
        client.post(f"/conversation/{session_id}/respond", data={"text": answer})
    fakes.llm.queue(extraction_json())  # deadline: "ten days"
    client.post(f"/conversation/{session_id}/summary")
    project_id = client.post(f"/conversation/{session_id}/confirm").json()["project_id"]
    return client.get(f"/projects/{project_id}", headers=USER).json()


def test_generated_project_gets_deadline_and_timeline(client, fakes):
    project = generate(client, fakes)
    created = date.fromisoformat(project["created_at"][:10])
    assert project["deadline_date"] == (created + timedelta(days=10)).isoformat()
    assert project["timeline"]["total_days"] == 11
    assert project["timeline"]["phases"][-1]["end_date"] == project["deadline_date"]
    summary = client.get("/projects", headers=USER).json()["projects"][0]
    assert summary["deadline_date"] == project["deadline_date"]


def test_set_change_and_clear_deadline(client):
    project_id = client.post("/projects", json={"title": "Garden"}, headers=USER).json()["project_id"]
    assert client.get(f"/projects/{project_id}", headers=USER).json()["timeline"] is None

    target = (date.today() + timedelta(days=6)).isoformat()
    updated = client.patch(f"/projects/{project_id}", json={"deadline_date": target}, headers=USER).json()
    assert updated["deadline_date"] == target
    assert updated["timeline"]["phases"][-1]["end_date"] == target

    # Other edits leave the deadline alone; null clears it for good.
    assert client.patch(f"/projects/{project_id}", json={"title": "Garden 2"}, headers=USER).json()["deadline_date"] == target
    cleared = client.patch(f"/projects/{project_id}", json={"deadline_date": None}, headers=USER).json()
    assert cleared["deadline_date"] is None and cleared["timeline"] is None
    assert client.get(f"/projects/{project_id}", headers=USER).json()["deadline_date"] is None
