"""
Evidence: every source the engine looked at, and every claim that depends on it.

Sources come ONLY from research API responses (never from the model). The model
refers to them by evidence id; unknown ids are dropped during validation.
"""

from datetime import datetime, timezone
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field, field_validator

EvidenceStatus = Literal[
    "verified_fact",
    "reported_limitation",
    "supported_inference",
    "unverified_hypothesis",
    "contradicted_claim",
]

SourceType = Literal[
    "web_page",
    "news",
    "github_repository",
    "github_issue",
    "academic_paper",
    "mock",
]

# Statuses that need at least one real source behind them.
SOURCED_STATUSES = {"verified_fact", "reported_limitation", "contradicted_claim"}


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class SourceRecord(BaseModel):
    """One search result as returned by a research API (before it gets an evidence id)."""

    title: str
    url: str
    source_type: SourceType
    provider: str
    excerpt: str = ""
    published_date: Optional[str] = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class Evidence(SourceRecord):
    evidence_id: str
    session_id: str
    query: str = ""
    retrieved_at: datetime = Field(default_factory=utc_now)
    accessible: bool = True


class EvidenceRef(BaseModel):
    """Compact reference used inside results."""

    evidence_id: str
    title: str
    url: str
    source_type: SourceType
    published_date: Optional[str] = None


class Claim(BaseModel):
    statement: str
    status: EvidenceStatus = "unverified_hypothesis"
    evidence_ids: list[str] = Field(default_factory=list)

    @field_validator("evidence_ids", mode="before")
    @classmethod
    def _ids(cls, value: Any) -> Any:
        if value is None:
            return []
        if isinstance(value, str):
            return [part.strip() for part in value.split(",") if part.strip()]
        return value

    @field_validator("status", mode="before")
    @classmethod
    def _status(cls, value: Any) -> Any:
        allowed = {"verified_fact", "reported_limitation", "supported_inference", "unverified_hypothesis", "contradicted_claim"}
        text = str(value or "").strip().lower().replace(" ", "_")
        return text if text in allowed else "unverified_hypothesis"
