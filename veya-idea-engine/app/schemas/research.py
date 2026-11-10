"""Stages 2–4: research plan, discovered problems and existing solutions."""

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field, field_validator

from app.schemas.common import as_list, as_text
from app.schemas.evidence import Claim, EvidenceRef

Relevance = Literal["high", "medium", "low"]


def _relevance(value: Any) -> str:
    text = str(value or "").strip().lower()
    return text if text in {"high", "medium", "low"} else "medium"


class ResearchPlan(BaseModel):
    domains: list[str] = Field(default_factory=list)
    problem_categories: list[str] = Field(default_factory=list)
    web_queries: list[str] = Field(default_factory=list)
    github_queries: list[str] = Field(default_factory=list)
    academic_queries: list[str] = Field(default_factory=list)
    research_keywords: list[str] = Field(default_factory=list)
    priorities: list[str] = Field(default_factory=list)
    research_depth: Literal["quick", "standard", "deep"] = "standard"
    expected_evidence: list[str] = Field(default_factory=list)

    @field_validator(
        "domains", "problem_categories", "web_queries", "github_queries", "academic_queries",
        "research_keywords", "priorities", "expected_evidence", mode="before",
    )
    @classmethod
    def _lists(cls, value: Any) -> Any:
        return as_list(value)

    @field_validator("research_depth", mode="before")
    @classmethod
    def _depth(cls, value: Any) -> Any:
        text = str(value or "").strip().lower()
        return text if text in {"quick", "standard", "deep"} else "standard"


class ProblemDraft(BaseModel):
    """What the model extracts from search results."""

    problem_title: str
    description: str
    affected_users: list[str] = Field(default_factory=list)
    domain: Optional[str] = None
    geographical_context: Optional[str] = None
    evidence_ids: list[str] = Field(default_factory=list)
    impact_claims: list[Claim] = Field(default_factory=list)
    initial_relevance: Relevance = "medium"
    unanswered_questions: list[str] = Field(default_factory=list)

    _lists = field_validator("affected_users", "unanswered_questions", mode="before")(lambda cls, v: as_list(v))
    _texts = field_validator("domain", "geographical_context", mode="before")(lambda cls, v: as_text(v))
    _rel = field_validator("initial_relevance", mode="before")(lambda cls, v: _relevance(v))


class ProblemExtraction(BaseModel):
    problems: list[ProblemDraft] = Field(default_factory=list)


class Problem(BaseModel):
    problem_id: str
    problem_title: str
    description: str
    affected_users: list[str] = Field(default_factory=list)
    domain: Optional[str] = None
    geographical_context: Optional[str] = None
    source_references: list[EvidenceRef] = Field(default_factory=list)
    frequency_or_impact_evidence: list[Claim] = Field(default_factory=list)
    initial_relevance: Relevance = "medium"
    unanswered_questions: list[str] = Field(default_factory=list)
    independent_source_count: int = 0


SolutionType = Literal[
    "github_repository", "academic_paper", "commercial_product", "open_source_tool", "research_prototype", "other",
]


class SolutionDraft(BaseModel):
    solution_name: str
    solution_type: SolutionType = "other"
    description: str = ""
    evidence_id: Optional[str] = None
    technology_stack: list[str] = Field(default_factory=list)
    features: list[str] = Field(default_factory=list)
    target_users: list[str] = Field(default_factory=list)
    hardware_requirements: list[str] = Field(default_factory=list)
    documented_limitations: list[Claim] = Field(default_factory=list)
    cost_information: Optional[str] = None

    _lists = field_validator("technology_stack", "features", "target_users", "hardware_requirements", mode="before")(
        lambda cls, v: as_list(v)
    )
    _texts = field_validator("cost_information", "description", mode="before")(lambda cls, v: as_text(v) or "")

    @field_validator("solution_type", mode="before")
    @classmethod
    def _type(cls, value: Any) -> Any:
        allowed = {"github_repository", "academic_paper", "commercial_product", "open_source_tool", "research_prototype", "other"}
        text = str(value or "").strip().lower().replace(" ", "_")
        return text if text in allowed else "other"


class SolutionAnalysis(BaseModel):
    solutions: list[SolutionDraft] = Field(default_factory=list)
    already_solved: list[str] = Field(default_factory=list)
    served_users: list[str] = Field(default_factory=list)
    common_technologies: list[str] = Field(default_factory=list)
    uncertain_limitations: list[str] = Field(default_factory=list)
    unsuitable_approaches: list[str] = Field(default_factory=list)
    newer_work_query: Optional[str] = Field(
        default=None, description="A query to check if newer work fixed a documented limitation (optional)."
    )

    _lists = field_validator(
        "already_solved", "served_users", "common_technologies", "uncertain_limitations", "unsuitable_approaches",
        mode="before",
    )(lambda cls, v: as_list(v))


class ExistingSolution(BaseModel):
    solution_name: str
    solution_type: SolutionType
    description: str = ""
    source_url: Optional[str] = None
    evidence_id: Optional[str] = None
    technology_stack: list[str] = Field(default_factory=list)
    features: list[str] = Field(default_factory=list)
    target_users: list[str] = Field(default_factory=list)
    hardware_requirements: list[str] = Field(default_factory=list)
    documented_limitations: list[Claim] = Field(default_factory=list)
    cost_information: Optional[str] = None
    last_updated: Optional[str] = None


class SolutionLandscape(BaseModel):
    problem_id: str
    solutions: list[ExistingSolution] = Field(default_factory=list)
    already_solved: list[str] = Field(default_factory=list)
    served_users: list[str] = Field(default_factory=list)
    common_technologies: list[str] = Field(default_factory=list)
    uncertain_limitations: list[str] = Field(default_factory=list)
    unsuitable_approaches: list[str] = Field(default_factory=list)
    evidence_ids: list[str] = Field(default_factory=list, description="Every source looked at for this problem.")
    newer_work: list[EvidenceRef] = Field(
        default_factory=list, description="Newer papers found while checking whether a reported limitation was fixed."
    )
