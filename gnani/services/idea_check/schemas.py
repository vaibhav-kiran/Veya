"""What Idea Check returns. Links and titles always come from the search APIs, never from the model."""

from typing import Literal, Optional

from pydantic import BaseModel, Field

SimilarityLabel = Literal[
    "strongly_differentiated",
    "potentially_differentiated",
    "significant_existing_overlap",
    "insufficient_evidence",
]

# Same wording as the Idea Discovery Engine: never claims an idea is "completely new".
SIMILARITY_LABEL_TEXT: dict[str, str] = {
    "strongly_differentiated": "Looks different from what's out there",
    "potentially_differentiated": "Some similar work exists",
    "significant_existing_overlap": "Very similar projects already exist",
    "insufficient_evidence": "Not enough evidence to tell",
}


class SimilarProject(BaseModel):
    id: str  # S1, S2, ... (what the model may cite)
    source: Literal["github", "devpost"]
    title: str
    description: str = ""
    url: str
    stars: Optional[int] = None  # GitHub
    winner: Optional[bool] = None  # Devpost: won a hackathon prize
    overlap: float = 0.0  # share of the idea's key words this project also mentions


class StandOutAngle(BaseModel):
    title: str = Field(max_length=120)
    description: str = Field(default="", max_length=600)
    why: str = Field(default="", max_length=400)


class Feasibility(BaseModel):
    verdict: Literal["feasible", "stretch", "not_feasible"] = "stretch"
    reason: str = ""
    smaller_version: str = ""  # a version that fits, when it doesn't


class IdeaCheck(BaseModel):
    # The idea text that was checked; a new check runs only if the idea changes.
    idea: str
    label: SimilarityLabel = "insufficient_evidence"
    label_text: str = SIMILARITY_LABEL_TEXT["insufficient_evidence"]
    explanation: str = ""
    similar_projects: list[SimilarProject] = Field(default_factory=list)
    angles: list[StandOutAngle] = Field(default_factory=list)
    feasibility: Feasibility = Field(default_factory=Feasibility)
    hackathon_fit: str = ""
    # Sources that failed (rate limit, offline). The check still runs.
    warnings: list[str] = Field(default_factory=list)
