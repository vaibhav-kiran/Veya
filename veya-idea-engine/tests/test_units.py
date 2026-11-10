from app.repositories.database import Database
from app.repositories.evidence_repository import EvidenceRepository
from app.schemas.evidence import Claim, SourceRecord
from app.schemas.gaps import Gap
from app.schemas.ideas import CandidateIdea, Critique, EvaluatedIdea, FeasibilityAssessment, SimilarityAssessment
from app.services.gap_analyzer import evidence_strength
from app.services.profile_review import review_profile
from app.schemas.student import StudentProfile
from app.services.ranking import rank_and_select, score_idea
from app.core.config import DEFAULT_WEIGHTS
from tests.fakes import GOOD_SCORES, idea


def test_evidence_ids_dedupe_and_invented_ids_are_downgraded():
    repo = EvidenceRepository(Database(":memory:"))
    record = SourceRecord(title="t", url="https://www.example.com/a/", source_type="web_page", provider="x")
    first = repo.add("s1", record)
    again = repo.add("s1", record.model_copy(update={"url": "http://example.com/a"}))
    assert first.evidence_id == again.evidence_id == "E1"
    claims = repo.validate_claims("s1", [Claim(statement="fact", status="verified_fact", evidence_ids=["E9"]),
                                         Claim(statement="ok", status="verified_fact", evidence_ids=["[e1]"])])
    assert claims[0].status == "unverified_hypothesis" and claims[0].evidence_ids == []
    assert claims[1].evidence_ids == ["E1"]


def test_profile_review_asks_only_about_missing_fields():
    review = review_profile(StudentProfile(interests=["agriculture"], deadline="4 weeks"))
    assert "deadline" not in review.missing_fields and "budget" in review.missing_fields
    assert len(review.clarifying_questions) <= 5
    assert any("low budget" in a for a in review.assumptions)


def test_evidence_strength_counts_real_sources():
    assert evidence_strength([])[0] == "insufficient"
    claims = [Claim(statement=s, status="reported_limitation", evidence_ids=[i]) for s, i in [("a", "E1"), ("b", "E2"), ("c", "E3")]]
    assert evidence_strength(claims)[0] == "strong"


def _evaluated(label: str, scores=GOOD_SCORES) -> EvaluatedIdea:
    return EvaluatedIdea(
        idea=CandidateIdea(**idea("X"), idea_id="i1", session_id="s"),
        feasibility=FeasibilityAssessment(verdict="feasible", feasibility_score=8),
        similarity=SimilarityAssessment(label=label, label_text=label),
        critique=Critique(verdict="accept", scores=scores),
    )


def test_overlap_caps_differentiation_and_breakdown_adds_up():
    gap = Gap(gap_id="G1", problem_id="P1", gap_title="g", description="d", evidence_strength="strong")
    score, breakdown = score_idea(_evaluated("significant_existing_overlap"), gap, DEFAULT_WEIGHTS)
    diff = next(b for b in breakdown if b.criterion == "differentiation")
    assert diff.score_0_10 == 3.5
    assert abs(score - sum(b.contribution for b in breakdown)) < 0.2
    better, _ = score_idea(_evaluated("strongly_differentiated"), gap, DEFAULT_WEIGHTS)
    assert better > score


def test_selection_never_pads():
    gap = Gap(gap_id="G1", problem_id="P1", gap_title="g", description="d", evidence_strength="strong")
    ideas = [_evaluated("potentially_differentiated"), _evaluated("potentially_differentiated", {k: 2 for k in GOOD_SCORES})]
    rank_and_select(ideas, [gap], DEFAULT_WEIGHTS, 55, 3)
    assert [e.status for e in ideas] == ["selected", "rejected"]
