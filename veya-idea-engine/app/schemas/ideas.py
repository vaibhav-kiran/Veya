"""Stages 6–10: candidate ideas, feasibility, similarity, critique and ranking."""

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field, field_validator

from app.schemas.common import as_list, as_text
from app.schemas.evidence import Claim, EvidenceRef

_LIST_FIELDS = (
    "target_users", "existing_solutions", "required_technologies", "hardware_requirements",
    "software_requirements", "risks", "assumptions",
)


class CandidateDraft(BaseModel):
    title: str
    problem_statement: str
    gap_id: Optional[str] = None
    target_users: list[str] = Field(default_factory=list)
    proposed_solution: str
    technical_approach: str = ""
    approach_type: str = ""
    existing_solutions: list[str] = Field(default_factory=list)
    identified_gap: str = ""
    differentiator: str = ""
    supporting_claims: list[Claim] = Field(default_factory=list)
    required_technologies: list[str] = Field(default_factory=list)
    hardware_requirements: list[str] = Field(default_factory=list)
    software_requirements: list[str] = Field(default_factory=list)
    estimated_budget: str = ""
    estimated_timeline: str = ""
    prototype_scope: str = ""
    risks: list[str] = Field(default_factory=list)
    assumptions: list[str] = Field(default_factory=list)

    _lists = field_validator(*_LIST_FIELDS, mode="before")(lambda cls, v: as_list(v))
    _texts = field_validator(
        "technical_approach", "approach_type", "identified_gap", "differentiator", "estimated_budget",
        "estimated_timeline", "prototype_scope", mode="before",
    )(lambda cls, v: as_text(v) or "")


class CandidateDrafts(BaseModel):
    candidates: list[CandidateDraft] = Field(default_factory=list)


class CandidateIdea(CandidateDraft):
    idea_id: str
    session_id: str
    revision: int = 0
    supporting_evidence: list[EvidenceRef] = Field(default_factory=list)


class FeasibilityAssessment(BaseModel):
    verdict: Literal["feasible", "stretch", "not_feasible"] = "stretch"
    feasibility_score: float = Field(default=5.0, ge=0, le=10)
    buildable_within_deadline: list[str] = Field(default_factory=list)
    exclude_from_prototype: list[str] = Field(default_factory=list)
    required_components: list[str] = Field(default_factory=list)
    skills_to_learn: list[str] = Field(default_factory=list)
    minimum_credible_demo: str = ""
    testing_plan: list[str] = Field(default_factory=list)
    blockers: list[str] = Field(default_factory=list)
    dataset_availability: str = ""
    safety_or_regulatory_notes: list[str] = Field(default_factory=list)
    dataset_leads: list[EvidenceRef] = Field(
        default_factory=list, description="Datasets found by a follow-up search when data looked unavailable."
    )

    _lists = field_validator(
        "buildable_within_deadline", "exclude_from_prototype", "required_components", "skills_to_learn",
        "testing_plan", "blockers", "safety_or_regulatory_notes", mode="before",
    )(lambda cls, v: as_list(v))
    _texts = field_validator("minimum_credible_demo", "dataset_availability", mode="before")(lambda cls, v: as_text(v) or "")

    @field_validator("verdict", mode="before")
    @classmethod
    def _verdict(cls, value: Any) -> Any:
        text = str(value or "").strip().lower().replace(" ", "_")
        return text if text in {"feasible", "stretch", "not_feasible"} else "stretch"

    @field_validator("feasibility_score", mode="before")
    @classmethod
    def _score(cls, value: Any) -> Any:
        try:
            return min(10.0, max(0.0, float(value)))
        except (TypeError, ValueError):
            return 5.0


SimilarityLabel = Literal[
    "strongly_differentiated", "potentially_differentiated", "significant_existing_overlap", "insufficient_evidence",
]

SIMILARITY_LABEL_TEXT = {
    "strongly_differentiated": "Strongly differentiated based on available evidence",
    "potentially_differentiated": "Potentially differentiated",
    "significant_existing_overlap": "Significant existing overlap",
    "insufficient_evidence": "Insufficient evidence to assess",
}


class SimilarityJudgement(BaseModel):
    label: SimilarityLabel = "insufficient_evidence"
    closest_evidence_ids: list[str] = Field(default_factory=list)
    differences: list[str] = Field(default_factory=list)
    explanation: str = ""

    @field_validator("label", mode="before")
    @classmethod
    def _label(cls, value: Any) -> Any:
        text = str(value or "").strip().lower().replace(" ", "_").replace("-", "_")
        allowed = set(SIMILARITY_LABEL_TEXT)
        return text if text in allowed else "insufficient_evidence"

    _lists = field_validator("differences", "closest_evidence_ids", mode="before")(lambda cls, v: as_list(v))


class SimilarMatch(BaseModel):
    evidence: EvidenceRef
    lexical_overlap: float


class SimilarityAssessment(BaseModel):
    label: SimilarityLabel
    label_text: str
    closest_matches: list[SimilarMatch] = Field(default_factory=list)
    differences: list[str] = Field(default_factory=list)
    explanation: str = ""


CRITERIA = (
    "problem_relevance", "evidence_strength", "differentiation", "feasibility", "impact", "learning_value", "prototype_clarity",
)


class Critique(BaseModel):
    verdict: Literal["accept", "revise", "reject"] = "revise"
    strongest_rejection_reason: str = ""
    issues: list[str] = Field(default_factory=list)
    revision_instructions: list[str] = Field(default_factory=list)
    scores: dict[str, float] = Field(default_factory=dict, description="0–10 per criterion")

    _lists = field_validator("issues", "revision_instructions", mode="before")(lambda cls, v: as_list(v))

    @field_validator("verdict", mode="before")
    @classmethod
    def _verdict(cls, value: Any) -> Any:
        text = str(value or "").strip().lower()
        return text if text in {"accept", "revise", "reject"} else "revise"

    @field_validator("scores", mode="before")
    @classmethod
    def _scores(cls, value: Any) -> Any:
        if not isinstance(value, dict):
            return {}
        cleaned = {}
        for key, score in value.items():
            try:
                cleaned[str(key)] = min(10.0, max(0.0, float(score)))
            except (TypeError, ValueError):
                continue
        return cleaned


class ScoreBreakdown(BaseModel):
    criterion: str
    score_0_10: float
    weight: float
    contribution: float
    basis: str


class EvaluatedIdea(BaseModel):
    idea: CandidateIdea
    feasibility: Optional[FeasibilityAssessment] = None
    similarity: Optional[SimilarityAssessment] = None
    critique: Optional[Critique] = None
    critic_rounds: int = 0
    status: Literal["candidate", "selected", "rejected"] = "candidate"
    rejection_reason: Optional[str] = None
    score: Optional[float] = None
    score_breakdown: list[ScoreBreakdown] = Field(default_factory=list)
    selection_reason: Optional[str] = None
