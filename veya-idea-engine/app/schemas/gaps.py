"""Stage 5: potential gaps between the problem and what already exists."""

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field, field_validator

from app.schemas.common import as_list
from app.schemas.evidence import Claim

GapType = Literal[
    "cost", "accessibility", "usability", "technical", "performance", "integration", "data_availability",
    "deployment", "geographic", "underserved_users", "research", "other",
]
EvidenceStrength = Literal["strong", "moderate", "weak", "insufficient"]


class GapDraft(BaseModel):
    problem_id: str
    gap_title: str
    gap_type: GapType = "other"
    description: str
    existing_approaches: list[str] = Field(default_factory=list)
    supporting_claims: list[Claim] = Field(default_factory=list)
    unverified_assumptions: list[str] = Field(default_factory=list)
    further_research_required: list[str] = Field(default_factory=list)
    contradiction_query: Optional[str] = Field(
        default=None, description="A search that could DISPROVE this gap (e.g. finds an existing fix)."
    )

    _lists = field_validator("existing_approaches", "unverified_assumptions", "further_research_required", mode="before")(
        lambda cls, v: as_list(v)
    )

    @field_validator("gap_type", mode="before")
    @classmethod
    def _type(cls, value: Any) -> Any:
        allowed = {"cost", "accessibility", "usability", "technical", "performance", "integration", "data_availability",
                   "deployment", "geographic", "underserved_users", "research", "other"}
        text = str(value or "").strip().lower().replace(" ", "_")
        return text if text in allowed else "other"


class GapDrafts(BaseModel):
    gaps: list[GapDraft] = Field(default_factory=list)


class ContradictionCheck(BaseModel):
    """The model's reading of the counter-evidence search for one gap."""

    contradicted: bool = False
    contradicting_evidence_ids: list[str] = Field(default_factory=list)
    explanation: str = ""
    revised_confidence: float = Field(default=0.5, ge=0.0, le=1.0)


class Gap(BaseModel):
    gap_id: str
    problem_id: str
    gap_title: str
    gap_type: GapType = "other"
    description: str
    existing_approaches: list[str] = Field(default_factory=list)
    supporting_evidence: list[Claim] = Field(default_factory=list)
    contradicting_evidence: list[Claim] = Field(default_factory=list)
    evidence_strength: EvidenceStrength = "insufficient"
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    unverified_assumptions: list[str] = Field(default_factory=list)
    further_research_required: list[str] = Field(default_factory=list)
    status: Literal["open", "weakened", "discarded"] = "open"
