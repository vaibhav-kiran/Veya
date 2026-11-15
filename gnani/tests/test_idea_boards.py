"""Idea pages: research what a page is for, then rate its ideas against it."""

import json

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import services.idea_boards.service as service
from services.idea_boards.schemas import BoardContext, Criterion, IdeaInput
from services.idea_boards.sources import Gathered, Page, excerpt
from tests.conftest import FakeLLMClient
from webapp.auth import Authenticator
from webapp.board_routes import router

SIH_PAGES = [
    Page(title="SIH 2025", url="https://www.sih.gov.in/sih2025", text="Smart India Hackathon 2025. Themes: Space, Health.", origin="web"),
    Page(title="Other hackathon", url="https://other.devpost.com/", text="Unrelated hackathon.", origin="devpost"),
]


def extraction(**overrides):
    data = {
        "found": True,
        "page_ids": ["P1", "P9"],
        "name": "Smart India Hackathon 2025",
        "url": "https://made-up.example",
        "summary": "A national hackathon.",
        "themes": ["Space", "Health"],
        "tracks": ["Hardware", "Software"],
        "judging_criteria": [
            {"name": "Novelty", "description": "", "weight": 40},
            {"name": "Feasibility", "description": "", "weight": 30},
            {"name": "Impact", "description": "", "weight": 30},
        ],
        "dates": "8-12 December 2025",
        "prizes": "1 lakh",
        "rules": ["Teams of 6"],
    }
    data.update(overrides)
    return json.dumps(data)


@pytest.fixture
def pages(monkeypatch):
    def use(found_pages, warnings=()):
        monkeypatch.setattr(service, "gather", lambda query: Gathered(pages=list(found_pages), warnings=list(warnings)))

    return use


# =========================================================
# RESEARCH
# =========================================================


def test_hackathon_facts_come_only_from_pages_that_were_read(pages):
    pages(SIH_PAGES)
    llm = FakeLLMClient([extraction()])

    context = service.research(llm, "m", "hackathon", "Smart India Hackathon 2025")

    assert context.found and context.criteria_source == "official"
    assert context.themes == ["Space", "Health"]
    # Links come from the page, not the model; the unknown page id P9 is dropped.
    assert context.url == "https://www.sih.gov.in/sih2025"
    assert [source.url for source in context.sources] == ["https://www.sih.gov.in/sih2025"]
    assert [c.weight for c in context.judging_criteria] == [40, 30, 30]


def test_without_official_criteria_typical_ones_are_used_and_labelled(pages):
    pages(SIH_PAGES)
    llm = FakeLLMClient([extraction(judging_criteria=[])])

    context = service.research(llm, "m", "hackathon", "SIH")

    assert context.criteria_source == "typical"
    assert "Innovation" in [c.name for c in context.judging_criteria]
    assert any("typical hackathon criteria" in warning for warning in context.warnings)


def test_one_published_criterion_is_topped_up(pages):
    pages(SIH_PAGES)
    llm = FakeLLMClient([extraction(judging_criteria=[{"name": "Environmental Impact", "weight": 100}])])

    context = service.research(llm, "m", "hackathon", "Green Shift")

    assert [c.name for c in context.judging_criteria][0] == "Environmental Impact"
    assert len(context.judging_criteria) >= 3
    assert all(c.weight is None for c in context.judging_criteria)
    assert any("lists only 1 judging criteria" in warning for warning in context.warnings)


def test_unknown_hackathon_is_not_invented(pages):
    pages(SIH_PAGES)
    llm = FakeLLMClient([extraction(found=False, page_ids=[])])

    context = service.research(llm, "m", "hackathon", "Some Tiny Hackathon")

    assert context.found is False
    assert context.themes == [] and context.sources == []
    assert "Paste the link" in context.summary


def test_nothing_found_needs_no_model_call(pages):
    pages([], warnings=["Devpost search didn't respond."])
    llm = FakeLLMClient([])

    context = service.research(llm, "m", "hackathon", "Nothing")

    assert context.found is False and llm.calls == []
    assert "Devpost search didn't respond." in context.warnings


def test_other_purposes_use_their_own_criteria_without_searching():
    llm = FakeLLMClient([])

    college = service.research(llm, "m", "college_project", notes="Final year, guide wants IoT")
    startup = service.research(llm, "m", "startup")

    assert "Documentation and research" in [c.name for c in college.judging_criteria]
    assert college.notes == "Final year, guide wants IoT"
    assert "Business model" in [c.name for c in startup.judging_criteria]
    assert llm.calls == []


def test_hackathon_needs_a_name_or_link():
    with pytest.raises(service.BoardError):
        service.research(FakeLLMClient([]), "m", "hackathon", "  ")


def test_long_pages_keep_the_judging_section():
    text = "intro " * 3000 + "Judging Criteria: Environmental Impact matters most." + " filler" * 3000

    kept = excerpt(text, 3000)

    assert "Judging Criteria: Environmental Impact" in kept
    assert len(kept) < 3500


# =========================================================
# RATING
# =========================================================

CONTEXT = BoardContext(
    purpose="hackathon",
    name="Green Shift",
    judging_criteria=[Criterion(name="Impact", weight=75), Criterion(name="Innovation", weight=25)],
)
IDEAS = [IdeaInput(id="a", title="Smart dustbin"), IdeaInput(id="b", title="Food waste tracker")]


def rating_json(*ratings):
    return json.dumps({"ratings": list(ratings)})


def rated(idea_id, impact, innovation):
    return {
        "idea_id": idea_id,
        "scores": [{"criterion": "Impact", "score": impact, "reason": "r"}, {"criterion": "innovation", "score": innovation}],
        "verdict": "v",
        "improvements": ["Tie it to the Food track"],
        "other_uses": ["College project"],
    }


def test_totals_and_the_best_idea_are_computed_in_code():
    llm = FakeLLMClient([rating_json(rated("a", 4, 10), rated("b", 8, 4))])

    result = service.rate(llm, "m", CONTEXT, IDEAS)

    # a: 0.75*4 + 0.25*10 = 5.5 -> 55; b: 0.75*8 + 0.25*4 = 7 -> 70.
    assert [(r.idea_id, r.total) for r in result.ratings] == [("b", 70), ("a", 55)]
    assert result.best_idea_id == "b"
    assert result.best_reason.startswith("Food waste tracker scores highest (70/100)")
    assert result.ratings[0].improvements == ["Tie it to the Food track"]


def test_echoed_labels_and_missing_scores_are_handled():
    first = rated("IDEA a", 6, 6)
    second = {"idea_id": "something else", "scores": [{"criterion": "Impact", "score": 9}]}
    llm = FakeLLMClient([rating_json(first, second)])

    result = service.rate(llm, "m", CONTEXT, IDEAS)

    by_id = {r.idea_id: r for r in result.ratings}
    assert by_id["a"].total == 60
    # b matched by position; its missing Innovation score counts as 5.
    assert by_id["b"].total == round((0.75 * 9 + 0.25 * 5) * 10)


def test_a_failed_rating_is_a_clear_error():
    with pytest.raises(service.BoardError):
        service.rate(FakeLLMClient(["not json"]), "m", CONTEXT, IDEAS)


# =========================================================
# ROUTES
# =========================================================


@pytest.fixture
def board_client():
    app = FastAPI()
    app.include_router(router)
    app.state.authenticator = Authenticator(mode="header")
    app.state.llm_models = {"qwen": (FakeLLMClient([rating_json(rated("a", 7, 7), rated("b", 5, 5))]), "m")}
    return TestClient(app)


def test_rate_route(board_client):
    response = board_client.post(
        "/boards/rate",
        json={"context": CONTEXT.model_dump(), "ideas": [i.model_dump() for i in IDEAS], "model": "qwen"},
        headers={"X-Veya-User": "u1"},
    )

    assert response.status_code == 200, response.text
    assert response.json()["best_idea_id"] == "a"


def test_research_route_for_a_college_project(board_client):
    response = board_client.post("/boards/research", json={"purpose": "college_project"}, headers={"X-Veya-User": "u1"})

    assert response.status_code == 200
    assert response.json()["name"] == "College project"


def test_gemini_without_a_key_is_a_clear_error(board_client):
    response = board_client.post("/boards/research", json={"purpose": "startup", "model": "gemini"}, headers={"X-Veya-User": "u1"})

    assert response.status_code == 503
    assert "Gemini" in response.json()["detail"]


# =========================================================
# IDEA CHECK FOR AN ITEM ON A PAGE
# =========================================================


def test_check_details_carry_the_page_context():
    context = BoardContext(
        purpose="hackathon",
        name="Green Shift",
        themes=["Sustainability"],
        tracks=["Waste"],
        judging_criteria=[Criterion(name="Environmental Impact")],
        dates="Nov 17, 2026",
        rules=["Students only"],
    )
    item = IdeaInput(id="project:p1", title="Food waste tracker", description="Canteens log leftovers", problem="Waste")

    details = service.check_details(item, context)

    assert details["initial_idea"] == "Food waste tracker: Canteens log leftovers"
    assert details["problem_statement"] == "Waste"
    assert details["deadline"] == "Nov 17, 2026"
    assert details["constraints"] == ["Students only"]
    assert "Hackathon themes: Sustainability" in details["additional_instructions"]
    assert "Judging criteria: Environmental Impact" in details["additional_instructions"]


def test_check_route_runs_idea_check(board_client, monkeypatch):
    from services.idea_check.schemas import IdeaCheck

    seen = {}

    class FakeChecker:
        def __init__(self, client, model):
            pass

        def check(self, details):
            seen.update(details)
            return IdeaCheck(idea=details["initial_idea"], label="potentially_differentiated", label_text="Some similar work exists")

    monkeypatch.setattr("webapp.board_routes.IdeaChecker", FakeChecker)

    response = board_client.post(
        "/boards/check",
        json={"item": {"id": "idea:1", "title": "Study planner"}, "context": CONTEXT.model_dump(), "model": "qwen"},
        headers={"X-Veya-User": "u1"},
    )

    assert response.status_code == 200, response.text
    assert response.json()["label"] == "potentially_differentiated"
    assert seen["project_type"] == "hackathon"


# =========================================================
# MAKE IT BETTER
# =========================================================


def improve_json(*titles: str) -> str:
    return json.dumps({
        "summary": "Lean into the waste track.",
        "changes": [{"title": t, "detail": f"Do {t}.", "helps_with": "Impact"} for t in titles],
    })


def test_improve_returns_changes_and_an_instruction_for_the_plan_editor():
    llm = FakeLLMClient([improve_json("Live surplus alerts", "NGO pickup map")])
    plan = service.improve(llm, "m", CONTEXT, IDEAS[0], None)

    assert [c.title for c in plan.changes] == ["Live surplus alerts", "NGO pickup map"]
    assert CONTEXT.name in plan.instruction
    assert "1. Live surplus alerts: Do Live surplus alerts. (helps with Impact)" in plan.instruction
    assert "2. NGO pickup map" in plan.instruction
    sent = llm.calls[0]["messages"][1]["content"]
    assert IDEAS[0].title in sent


def test_improve_sends_the_rating_so_weak_criteria_get_fixed():
    from services.idea_boards.schemas import CriterionScore, IdeaRating

    llm = FakeLLMClient([improve_json("A")])
    rating = IdeaRating(idea_id="a", total=41, scores=[CriterionScore(criterion="Impact", score=3, reason="small reach")], verdict="Weak impact")
    service.improve(llm, "m", CONTEXT, IDEAS[0], rating)

    sent = llm.calls[0]["messages"][1]["content"]
    assert "41/100" in sent and "Impact: 3/10. small reach" in sent


def test_improve_without_changes_is_an_error():
    with pytest.raises(service.BoardError):
        service.improve(FakeLLMClient([json.dumps({"summary": "x", "changes": []})]), "m", CONTEXT, IDEAS[0], None)


def test_improve_route(board_client):
    board_client.app.state.llm_models = {"qwen": (FakeLLMClient([improve_json("A", "B", "C")]), "m")}
    response = board_client.post(
        "/boards/improve",
        json={"item": IDEAS[0].model_dump(), "context": CONTEXT.model_dump(), "model": "qwen"},
        headers={"X-Veya-User": "u1"},
    )
    assert response.status_code == 200, response.text
    assert len(response.json()["changes"]) == 3 and response.json()["instruction"]


def test_improve_uses_what_already_exists_and_keeps_only_real_competitors():
    from services.idea_check.schemas import IdeaCheck, SimilarProject

    check = IdeaCheck(
        idea="food",
        label="significant_existing_overlap",
        explanation="Very close to existing apps.",
        similar_projects=[SimilarProject(id="S1", source="devpost", title="LeftoverLink", url="https://devpost.com/software/x", winner=True)],
    )
    reply = json.dumps({
        "summary": "Beat LeftoverLink.",
        "changes": [
            {"title": "Live CO2 meter", "detail": "Show CO2 saved.", "helps_with": "Impact", "beats": "leftoverlink"},
            {"title": "Made-up rival", "detail": "x", "helps_with": "", "beats": "SomeAppThatWasNeverFound"},
        ],
    })
    llm = FakeLLMClient([reply])
    plan = service.improve(llm, "m", CONTEXT, IDEAS[0], None, check)

    sent = llm.calls[0]["messages"][1]["content"]
    assert "WHAT ALREADY EXISTS" in sent and "LeftoverLink (Devpost, won a prize)" in sent
    assert plan.changes[0].beats == "LeftoverLink"  # matched to the real title
    assert plan.changes[1].beats == ""  # never invented
    assert "better than the existing project LeftoverLink" in plan.instruction
