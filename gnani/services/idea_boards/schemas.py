"""Boards: what an idea page is for, what Veya found out about it, and how its ideas rate."""

from typing import Literal, Optional

from services.idea_check.schemas import IdeaCheck
from services.llm_providers import ModelName

from pydantic import BaseModel, ConfigDict, Field

Purpose = Literal["hackathon", "college_project", "startup", "personal", "other"]


class Source(BaseModel):
    title: str
    url: str


class Criterion(BaseModel):
    name: str = Field(max_length=120)
    description: str = Field(default="", max_length=400)
    # Share of the total score in percent (None = equal weights).
    weight: Optional[float] = Field(default=None, ge=0, le=100)


class BoardContext(BaseModel):
    """What the page is for. For a hackathon, researched on the web."""

    purpose: Purpose
    name: str
    url: str = ""
    summary: str = ""
    themes: list[str] = Field(default_factory=list)
    tracks: list[str] = Field(default_factory=list)
    judging_criteria: list[Criterion] = Field(default_factory=list)
    # "official": found in the hackathon's own pages; "typical": usual criteria (nothing official found).
    criteria_source: Literal["official", "typical"] = "typical"
    dates: str = ""
    prizes: str = ""
    rules: list[str] = Field(default_factory=list)
    # Only pages that were actually read. Titles and links come from the sources, never the model.
    sources: list[Source] = Field(default_factory=list)
    found: bool = True  # False: the hackathon couldn't be identified
    warnings: list[str] = Field(default_factory=list)
    notes: str = ""  # what the student said about it (course, domain, expectations)


class ResearchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    purpose: Purpose
    # Hackathon name or link (required for a hackathon).
    query: str = Field(default="", max_length=500)
    # Anything else: course and guide expectations, startup domain, ...
    notes: str = Field(default="", max_length=2000)
    model: ModelName = "qwen"


class IdeaInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(max_length=64)
    title: str = Field(max_length=300)
    description: str = Field(default="", max_length=4000)
    problem: str = Field(default="", max_length=2000)
    solution: str = Field(default="", max_length=2000)
    target_users: str = Field(default="", max_length=1000)


class RateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    context: BoardContext
    ideas: list[IdeaInput] = Field(min_length=1, max_length=12)
    model: ModelName = "qwen"


class CriterionScore(BaseModel):
    criterion: str
    score: int = Field(ge=1, le=10)
    reason: str = ""


class IdeaRating(BaseModel):
    idea_id: str
    total: int = Field(ge=0, le=100)  # weighted, computed in code from the criterion scores
    scores: list[CriterionScore] = Field(default_factory=list)
    verdict: str = ""
    strengths: list[str] = Field(default_factory=list)
    risks: list[str] = Field(default_factory=list)
    improvements: list[str] = Field(default_factory=list)  # for THIS hackathon / purpose
    other_uses: list[str] = Field(default_factory=list)  # where else the idea could work


class BoardRating(BaseModel):
    ratings: list[IdeaRating]  # best first
    best_idea_id: Optional[str] = None
    best_reason: str = ""


class CheckRequest(BaseModel):
    """Idea Check for one idea or project on a page, judged against the page's purpose."""

    model_config = ConfigDict(extra="forbid")

    item: "IdeaInput"
    context: Optional[BoardContext] = None
    model: ModelName = "qwen"


class TranscriptResponse(BaseModel):
    text: str


class Improvement(BaseModel):
    title: str
    detail: str = ""
    # Which judging criterion (or theme) it helps with.
    helps_with: str = ""
    # The similar existing project this makes it better than (from the Idea Check).
    beats: str = ""


class ImproveRequest(BaseModel):
    """Make one idea or project a better fit for what the page is for."""

    model_config = ConfigDict(extra="forbid")

    item: IdeaInput
    context: BoardContext
    # Its rating on the page, if it was rated: the weak criteria get fixed first.
    rating: Optional[IdeaRating] = None
    # Its Idea Check (similar projects that already exist): the changes make it
    # stand out from them, not copy them.
    check: Optional[IdeaCheck] = None
    model: ModelName = "qwen"


class ImprovePlan(BaseModel):
    summary: str = ""
    changes: list[Improvement] = Field(default_factory=list)
    # The same changes as one instruction for the plan editor (POST /projects/{id}/edit).
    instruction: str = ""
