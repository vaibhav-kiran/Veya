"""Discovery sessions and the REST API request/response models."""

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.evidence import EvidenceRef, utc_now
from app.schemas.gaps import Gap
from app.schemas.ideas import EvaluatedIdea
from app.schemas.research import Problem, ResearchPlan, SolutionLandscape
from app.schemas.student import ProfileReview, StudentProfile

SessionStatus = Literal["created", "running", "completed", "failed"]

STAGES = [
    "profile", "planning", "problem_discovery", "solution_research", "gap_analysis",
    "candidate_generation", "feasibility", "similarity", "critic", "ranking", "done",
]


class DiscoverySession(BaseModel):
    session_id: str
    status: SessionStatus = "created"
    stage: str = "profile"
    progress: float = 0.0
    profile: StudentProfile
    review: ProfileReview = Field(default_factory=ProfileReview)
    plan: Optional[ResearchPlan] = None
    problems: list[Problem] = Field(default_factory=list)
    landscapes: list[SolutionLandscape] = Field(default_factory=list)
    gaps: list[Gap] = Field(default_factory=list)
    ideas: list[EvaluatedIdea] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    error: Optional[str] = None
    research_rounds_used: int = 0
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)

    def warn(self, message: str) -> None:
        if message not in self.warnings:
            self.warnings.append(message)


# ---------------- API models ----------------


class StartDiscoveryRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    profile: StudentProfile = Field(default_factory=StudentProfile)
    auto_start: bool = Field(default=False, description="Start research immediately instead of waiting for answers.")


class StartDiscoveryResponse(BaseModel):
    session_id: str
    status: SessionStatus
    missing_fields: list[str]
    clarifying_questions: list[str]
    assumptions: list[str]


class ResearchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    profile_update: Optional[StudentProfile] = Field(
        default=None, description="Answers to the clarifying questions, merged into the profile."
    )


class StatusResponse(BaseModel):
    session_id: str
    status: SessionStatus
    stage: str
    progress: float
    counts: dict[str, int]
    warnings: list[str]
    error: Optional[str] = None
    updated_at: datetime


class ResultsResponse(BaseModel):
    session_id: str
    status: SessionStatus
    profile: StudentProfile
    assumptions: list[str]
    recommended_ideas: list[EvaluatedIdea]
    rejected_ideas: list[EvaluatedIdea]
    problems: list[Problem]
    gaps: list[Gap]
    existing_solutions: list[SolutionLandscape]
    evidence: list[EvidenceRef]
    warnings: list[str]
    disclaimer: str = (
        "Scores are a transparent ranking aid, not a measure of novelty. "
        "No idea is claimed to be completely novel: searches can miss existing work."
    )


class RefineRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    feedback: str = Field(min_length=3, max_length=2000)


class EvaluateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    profile_update: Optional[StudentProfile] = None
