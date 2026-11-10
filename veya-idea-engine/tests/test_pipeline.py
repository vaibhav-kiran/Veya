"""End-to-end pipeline runs with a scripted model and fake sources."""

from app.core.exceptions import SourceRateLimitedError, SourceUnavailableError
from app.services.discovery_pipeline import NOT_ENOUGH_EVIDENCE
from tests.conftest import PROFILE, run_session
from tests.fakes import GOOD_SCORES, FakeGitHub, FakeLLM, FakeWeb, fake_sources


def all_cited_ids(session) -> set[str]:
    ids = {r.evidence_id for p in session.problems for r in p.source_references}
    ids |= {i for g in session.gaps for c in [*g.supporting_evidence, *g.contradicting_evidence] for i in c.evidence_ids}
    ids |= {r.evidence_id for e in session.ideas for r in e.idea.supporting_evidence}
    return ids


def test_full_run_produces_grounded_ideas(make_engine):
    llm = FakeLLM()
    sources = fake_sources()
    engine = make_engine(llm, sources)
    session = run_session(engine, PROFILE)

    assert session.status == "completed", session.error
    assert session.stage == "done" and session.progress == 1.0
    assert session.problems and session.landscapes and session.gaps
    selected = [e for e in session.ideas if e.status == "selected"]
    assert 1 <= len(selected) <= 3
    for evaluated in selected:
        assert evaluated.score is not None and evaluated.score >= 55
        assert {b.criterion for b in evaluated.score_breakdown} == set(GOOD_SCORES)
        assert evaluated.selection_reason
        assert "novel" not in evaluated.similarity.label_text.lower()

    # Every cited id exists, and every URL came from a source (never from the model).
    stored = {e.evidence_id: e for e in engine.evidence.all(session.session_id)}
    assert all_cited_ids(session) <= set(stored)
    urls = {e.url for e in stored.values()}
    for landscape in session.landscapes:
        for solution in landscape.solutions:
            assert solution.source_url in urls
            assert "invented.example" not in (solution.source_url or "")

    # The idea pointing at a gap that was never investigated (G9) is dropped.
    assert all(e.idea.gap_id in {g.gap_id for g in session.gaps} for e in session.ideas)
    # Adaptive steps ran: repository README/issues and the newer-work paper search.
    assert ("readme", "org/rural-clinics-lack-continuous-vital-monitoring-healthcare-1") in sources["github"].calls
    assert any(from_date for _, from_date in sources["openalex"].calls)
    assert session.landscapes[0].newer_work


def test_repeated_searches_hit_the_cache(make_engine):
    sources = fake_sources()
    engine = make_engine(FakeLLM(), sources)
    run_session(engine, PROFILE)
    first = len(sources["web"].queries)
    run_session(engine, PROFILE)
    assert len(sources["web"].queries) == first  # identical queries are served from the cache


def test_malformed_model_output_is_retried(make_engine):
    llm = FakeLLM({"planner": lambda user, n: "not json at all" if n == 1 else None})
    session = run_session(make_engine(llm), PROFILE)
    assert session.status == "completed"
    assert llm.count("planner") == 2


def test_model_that_never_returns_json_fails_cleanly(make_engine):
    llm = FakeLLM({"planner": "```oops```"})
    session = run_session(make_engine(llm), PROFILE)
    assert session.status == "failed"
    assert "could not be understood" in session.error


def test_malformed_critic_rejects_only_that_idea(make_engine):
    def critic(user, n):
        return "garbage" if "Offline Vitals Band" in user else None

    session = run_session(make_engine(FakeLLM({"critic": critic})), PROFILE)
    assert session.status == "completed"
    band = next(e for e in session.ideas if e.idea.title.startswith("Offline Vitals Band"))
    assert band.status == "rejected" and "could not be understood" in band.rejection_reason
    assert any(e.status == "selected" for e in session.ideas)


def test_rate_limited_source_degrades_gracefully(make_engine):
    sources = fake_sources(github=FakeGitHub(error=SourceRateLimitedError()))
    session = run_session(make_engine(FakeLLM(), sources), PROFILE)
    assert session.status == "completed"
    assert any("rate limited" in w for w in session.warnings)


def test_unavailable_web_search_is_reported_not_faked(make_engine):
    web = FakeWeb(error=SourceUnavailableError("Web search is not configured (TAVILY_API_KEY is missing)."))
    session = run_session(make_engine(FakeLLM(), fake_sources(web=web)), PROFILE)
    assert session.status == "completed"
    assert any("TAVILY_API_KEY" in w for w in session.warnings)
    assert len(web.queries) == 1  # a source that failed hard is not retried within the session


def test_contradicted_gaps_are_discarded_and_no_ideas_are_invented(make_engine):
    def contradiction(user, n):
        ids = [i for i in __import__("re").findall(r"\[(E\d+)\]", user)]
        return {"contradicted": True, "contradicting_evidence_ids": ids[-1:], "explanation": "An existing tool does this.",
                "revised_confidence": 0.1}

    llm = FakeLLM({"contradiction": contradiction})
    session = run_session(make_engine(llm), PROFILE)
    assert session.status == "completed"
    assert session.gaps and all(g.status == "discarded" for g in session.gaps)
    assert all(g.contradicting_evidence[0].status == "contradicted_claim" for g in session.gaps)
    assert session.ideas == []
    assert NOT_ENOUGH_EVIDENCE in session.warnings
    assert llm.count("candidates") == 0


def test_contradiction_without_real_source_is_not_trusted(make_engine):
    llm = FakeLLM({"contradiction": {"contradicted": True, "contradicting_evidence_ids": ["E999"], "explanation": "I think so",
                                     "revised_confidence": 0.0}})
    session = run_session(make_engine(llm), PROFILE)
    assert all(g.status == "open" for g in session.gaps)
    assert any("unverified" in a for g in session.gaps for a in g.unverified_assumptions)


def test_problems_with_invented_citations_are_dropped(make_engine):
    llm = FakeLLM({"problems": {"problems": [{"problem_title": "Made up", "description": "x", "evidence_ids": ["E404"],
                                              "impact_claims": [{"statement": "90% of people", "status": "verified_fact",
                                                                 "evidence_ids": ["E405"]}]}]}})
    session = run_session(make_engine(llm), PROFILE)
    assert session.status == "completed"
    assert session.problems == [] and session.ideas == []
    assert session.research_rounds_used == 2  # tried a follow-up round before giving up
    assert NOT_ENOUGH_EVIDENCE in session.warnings


def test_infeasible_idea_gets_one_scope_reduction_then_is_rejected(make_engine):
    llm = FakeLLM({"feasibility": {"verdict": "not_feasible", "feasibility_score": 2, "blockers": ["needs an MRI machine"],
                                   "dataset_availability": "no public data"}})
    session = run_session(make_engine(llm), {**PROFILE, "budget": "0"})
    assert session.status == "completed"
    revisions = [u for s, u in llm.calls if s == "revision"]
    assert revisions and "Reduce the scope" in revisions[0] and "MRI" in revisions[0]
    assert all(e.status == "rejected" for e in session.ideas)
    assert all("Not feasible" in e.rejection_reason for e in session.ideas)
    assert all(e.feasibility.dataset_leads for e in session.ideas)  # looked for alternative datasets
    assert any("weaker ideas were not added" in w for w in session.warnings)


def test_critic_revision_loop_is_bounded(make_engine):
    llm = FakeLLM({"critic": {"verdict": "revise", "issues": ["too vague"], "scores": GOOD_SCORES}})
    session = run_session(make_engine(llm, max_critic_rounds=2), PROFILE)
    ideas = len(session.ideas)
    assert llm.count("critic") == ideas * 2
    assert llm.count("revision") == ideas  # one revision between the two critic rounds
    assert all(e.status == "rejected" for e in session.ideas)
    assert all(e.idea.revision == 1 for e in session.ideas)


def test_low_scores_return_fewer_ideas_instead_of_padding(make_engine):
    def critic(user, n):
        good = "Offline Vitals Band" in user
        return {"verdict": "accept", "scores": GOOD_SCORES if good else {k: 3 for k in GOOD_SCORES}}

    session = run_session(make_engine(FakeLLM({"critic": critic})), PROFILE)
    selected = [e for e in session.ideas if e.status == "selected"]
    assert [e.idea.title for e in selected] == ["Offline Vitals Band"]
    assert all("below the minimum" in e.rejection_reason for e in session.ideas if e.status == "rejected")
