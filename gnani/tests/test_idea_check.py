"""Idea Check: similar projects, ways to stand out and feasibility, between the summary and the plan."""

import json

import pytest

from services.conversation_manager.project_generation import build_project_brief
from services.idea_check.checker import IdeaChecker, chosen_direction, parse_choice, speech_for
from services.idea_check.schemas import Feasibility, IdeaCheck, SimilarProject, StandOutAngle
from services.idea_check.sources import Found, SourceError
from tests.conftest import FakeLLMClient
from tests.test_conversation_api import FIXED_ANSWERS, extraction_json, start

DETAILS = {
    "initial_idea": "A smart dustbin that opens by itself and beeps when full",
    "deadline": "two weeks",
    "preferred_technologies": ["Arduino", "ultrasonic sensor"],
}

GITHUB = [
    Found("github", "juilirk/Smart-Dustbin-using-Arduino", "Smart dustbin using Arduino and ultrasonic sensor", "https://github.com/juilirk/x", stars=3),
    Found("github", "someone/weather-app", "A weather forecast app", "https://github.com/someone/weather"),
]
DEVPOST = [Found("devpost", "BinBuddy", "Smart dustbin that sorts waste and alerts when full", "https://devpost.com/software/binbuddy", winner=True)]


def assessment(**overrides):
    data = {
        "label": "significant_existing_overlap",
        "closest_ids": ["S1", "S2", "S99"],
        "explanation": "BinBuddy and Smart-Dustbin-using-Arduino already do this.",
        "angles": [
            {"title": "Waste sorting with a camera", "description": "Sort wet and dry waste.", "why": "Judges like impact."},
            {"title": "Fill-level dashboard for hostels", "description": "Show every bin on a web map.", "why": "Useful for staff."},
        ],
        "feasibility": {"verdict": "stretch", "reason": "Two weeks is tight for sorting.", "smaller_version": "Only the auto lid and buzzer."},
        "hackathon_fit": "",
    }
    data.update(overrides)
    return json.dumps(data)


def checker(*replies, github=None, devpost=None):
    llm = FakeLLMClient(list(replies))
    return IdeaChecker(
        llm,
        "test-model",
        github=github or (lambda query: GITHUB),
        devpost=devpost or (lambda query: DEVPOST),
    ), llm


# =========================================================
# THE CHECK
# =========================================================


def test_check_cites_only_real_search_results():
    check_, llm = checker(json.dumps({"queries": ["smart dustbin", "automatic lid bin"]}), assessment())

    result = check_.check(DETAILS)

    titles = [project.title for project in result.similar_projects]
    assert "BinBuddy" in titles and "juilirk/Smart-Dustbin-using-Arduino" in titles
    # The unrelated weather app never reaches the student, and S99 (invented) is dropped.
    assert all("weather" not in title for title in titles)
    assert all(project.url.startswith("https://") for project in result.similar_projects)
    assert result.label == "significant_existing_overlap"
    assert [angle.title for angle in result.angles] == ["Waste sorting with a camera", "Fill-level dashboard for hostels"]
    assert result.feasibility.smaller_version == "Only the auto lid and buzzer."
    # The model saw the real results by ID, not links.
    assert "S1" in llm.calls[1]["messages"][1]["content"]


def test_nothing_found_is_not_called_new():
    check_, _ = checker(
        json.dumps({"queries": ["smart dustbin"]}),
        assessment(label="strongly_differentiated", closest_ids=[]),
        github=lambda query: [],
        devpost=lambda query: [],
    )

    result = check_.check(DETAILS)

    assert result.label == "insufficient_evidence"
    assert result.similar_projects == []
    assert "didn't find a close match" in speech_for(result)


def test_high_overlap_cannot_be_strongly_differentiated():
    check_, _ = checker(json.dumps({"queries": ["smart dustbin"]}), assessment(label="strongly_differentiated"))

    assert check_.check(DETAILS).label == "potentially_differentiated"


def test_a_failing_source_becomes_a_warning():
    def rate_limited(query):
        raise SourceError("GitHub search limit reached; try again in a minute.")

    check_, _ = checker(json.dumps({"queries": ["smart dustbin"]}), assessment(), github=rate_limited)

    result = check_.check(DETAILS)

    assert result.warnings == ["GitHub search limit reached; try again in a minute."]
    assert [project.title for project in result.similar_projects] == ["BinBuddy"]


def test_bad_queries_fall_back_to_keywords():
    seen = []
    check_, _ = checker("not json", assessment(), devpost=lambda query: seen.append(query) or DEVPOST)

    check_.check(DETAILS)

    assert seen and "dustbin" in seen[0]


# =========================================================
# WHAT VEYA SAYS AND THE STUDENT'S CHOICE
# =========================================================

CHECK = IdeaCheck(
    idea="smart dustbin",
    label="significant_existing_overlap",
    similar_projects=[SimilarProject(id="S1", source="devpost", title="BinBuddy", url="https://devpost.com/software/binbuddy", winner=True)],
    angles=[StandOutAngle(title="Waste sorting"), StandOutAngle(title="Hostel dashboard"), StandOutAngle(title="Solar powered")],
    feasibility=Feasibility(verdict="stretch", reason="Two weeks is tight.", smaller_version="Only the auto lid."),
)


def test_speech_mentions_matches_angles_and_feasibility():
    speech = speech_for(CHECK)

    assert "BinBuddy, which won a hackathon prize" in speech
    assert "one, Waste sorting; two, Hostel dashboard; three, Solar powered" in speech
    assert "It's a stretch for your time. Two weeks is tight." in speech
    assert speech.endswith("Tick one on the screen, or say, for example, the first one.")


@pytest.mark.parametrize(
    "text, choice",
    [
        ("The second one", "angle:1"),
        ("Let's go with the first idea", "angle:0"),
        ("Option 3", "angle:2"),
        ("3", "angle:2"),
        ("Build the smaller version", "smaller"),
        ("Yes, build it as it is", None),
        ("Not the first one, change the deadline", None),
        ("The fourth one", None),
    ],
)
def test_parse_choice(text, choice):
    assert parse_choice(text, CHECK) == choice


def test_chosen_direction():
    assert chosen_direction(CHECK, "angle:1").title == "Hostel dashboard"
    assert chosen_direction(CHECK, "smaller").description == "Only the auto lid."
    assert chosen_direction(CHECK, "as_is") is None
    assert chosen_direction(CHECK, "angle:7") is None


# =========================================================
# IN THE CONVERSATION
# =========================================================


class FakeChecker:
    def __init__(self, result=CHECK, error=None):
        self.result, self.error, self.calls = result, error, 0

    def check(self, details):
        self.calls += 1
        if self.error:
            raise self.error
        return self.result.model_copy(update={"idea": details["initial_idea"]})


def summarise(client, fakes, service, checker_):
    service.models["qwen"].idea_checker = checker_
    session_id = start(client)["session_id"]
    for answer in FIXED_ANSWERS:
        client.post(f"/conversation/{session_id}/respond", data={"text": answer})
    fakes.llm.queue(extraction_json({"initial_idea": "A wearable health monitor"}))
    return session_id, client.post(f"/conversation/{session_id}/summary").json()


def test_summary_comes_with_the_idea_check(client, fakes, service):
    session_id, summary = summarise(client, fakes, service, FakeChecker())

    assert summary["status"] == "awaiting_confirmation"
    assert summary["message"].startswith("Here's what I've understood so far.")
    assert "I checked GitHub and Devpost" in summary["message"]
    assert "Shall I start building your project plan, or would you like to change anything?" not in summary["message"]
    assert summary["idea_check"]["similar_projects"][0]["title"] == "BinBuddy"


def test_saying_the_second_one_builds_with_that_angle(client, fakes, service):
    session_id, _ = summarise(client, fakes, service, FakeChecker())
    calls_before = len(fakes.llm.calls)

    data = client.post(f"/conversation/{session_id}/respond", data={"text": "The second one"}).json()

    assert data["status"] == "ready_to_generate"
    assert len(fakes.llm.calls) == calls_before  # decided in code
    state = service.store.get_conversation(session_id)
    assert state.chosen_direction.title == "Hostel dashboard"
    assert "THE STUDENT CHOSE THIS DIRECTION" in build_project_brief(state)
    assert "[BinBuddy](https://devpost.com/software/binbuddy)" in build_project_brief(state)


def test_confirm_button_with_a_choice(client, fakes, service):
    session_id, _ = summarise(client, fakes, service, FakeChecker())

    data = client.post(f"/conversation/{session_id}/confirm", json={"choice": "smaller"}).json()

    assert data["status"] == "completed"
    assert service.store.get_conversation(session_id).chosen_direction.title == "Smaller version"
    assert client.post(f"/conversation/{session_id}/confirm", json={"choice": "angle:9"}).status_code == 422


def test_a_failed_idea_check_never_blocks_the_summary(client, fakes, service):
    _, summary = summarise(client, fakes, service, FakeChecker(error=RuntimeError("model down")))

    assert summary["status"] == "awaiting_confirmation"
    assert summary["message"].endswith("Shall I start building your project plan, or would you like to change anything?")
    assert summary["idea_check"] is None


def test_the_check_runs_once_per_idea(client, fakes, service):
    checker_ = FakeChecker()
    session_id, _ = summarise(client, fakes, service, checker_)
    fakes.llm.queue(json.dumps({
        "extracted_information": {}, "corrected_information": {"deadline": "three weeks"}, "skipped_fields": [],
        "next_action": "request_confirmation", "ready_for_confirmation": True, "response": "",
    }))

    data = client.post(f"/conversation/{session_id}/respond", data={"text": "Make the deadline three weeks"}).json()

    assert checker_.calls == 1  # the idea itself didn't change
    assert data["message"].endswith("Shall I build it as it is, or with one of the ideas I suggested?")
