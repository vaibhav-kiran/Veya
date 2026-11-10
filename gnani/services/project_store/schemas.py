"""
Pydantic models for saved VEYA projects.

A project is saved when a confirmed conversation finishes generating
(source "conversation"), or created by the user from an idea in the app
(source "manual"). Everything the API returns is described here.
"""

from datetime import date, datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

from services.conversation_manager.schemas import ProjectDetails, utc_now
from services.project_store.timeline import ProjectTimeline

MAX_TITLE_LENGTH = 120
MAX_SECTION_LENGTH = 20000

ProjectSource = Literal["conversation", "manual"]


class ProjectSections(BaseModel):
    """The editable plan sections shown on the project screen."""

    overview: str = ""
    problem: str = ""
    solution: str = ""
    goals: str = ""
    tech_stack: str = ""
    architecture: str = ""
    resources: str = ""


class SectionsUpdate(BaseModel):
    """Partial update: only the sections that are sent are changed."""

    model_config = ConfigDict(extra="forbid")

    overview: Optional[str] = Field(default=None, max_length=MAX_SECTION_LENGTH)
    problem: Optional[str] = Field(default=None, max_length=MAX_SECTION_LENGTH)
    solution: Optional[str] = Field(default=None, max_length=MAX_SECTION_LENGTH)
    goals: Optional[str] = Field(default=None, max_length=MAX_SECTION_LENGTH)
    tech_stack: Optional[str] = Field(default=None, max_length=MAX_SECTION_LENGTH)
    architecture: Optional[str] = Field(default=None, max_length=MAX_SECTION_LENGTH)
    resources: Optional[str] = Field(default=None, max_length=MAX_SECTION_LENGTH)


def _clean_title(value: Any) -> Any:
    if isinstance(value, str):
        value = value.strip()
        if not value:
            raise ValueError("The project title cannot be empty.")
    return value


class StoredProject(BaseModel):
    """A project as stored in the database and returned by the API."""

    project_id: str
    title: str
    source: ProjectSource
    sections: ProjectSections = Field(default_factory=ProjectSections)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)

    # Only set for projects generated from a conversation.
    session_id: Optional[str] = None
    project_details: Optional[ProjectDetails] = None
    plan_response: str = ""
    readme_markdown: str = ""
    readme_filename: Optional[str] = None
    workflow_diagram: Optional[str] = None
    image_url: Optional[str] = None
    image_generation_available: bool = False

    # Deadline as a date: read from what the user said, or set in the app.
    deadline_date: Optional[date] = None
    # Phase plan from today to the deadline. Computed on read, never stored.
    timeline: Optional[ProjectTimeline] = None

    # Never sent to the frontend.
    # True once the deadline was decided (read at creation, or set/cleared in
    # the app). Older projects are filled in from what the user said.
    deadline_resolved: bool = Field(default=False, exclude=True)
    owner_id: Optional[str] = Field(default=None, exclude=True)
    visual_generation_input: Optional[dict[str, Any]] = Field(default=None, exclude=True)


class ProjectSummary(BaseModel):
    project_id: str
    title: str
    source: ProjectSource
    created_at: datetime
    updated_at: datetime
    has_readme: bool
    has_diagram: bool
    image_url: Optional[str] = None
    deadline_date: Optional[date] = None


class ProjectListResponse(BaseModel):
    projects: list[ProjectSummary]


class CreateProjectRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(max_length=MAX_TITLE_LENGTH)
    sections: SectionsUpdate = Field(default_factory=SectionsUpdate)

    @field_validator("title", mode="before")
    @classmethod
    def title_not_empty(cls, value: Any) -> Any:
        return _clean_title(value)


class UpdateProjectRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: Optional[str] = Field(default=None, max_length=MAX_TITLE_LENGTH)
    sections: Optional[SectionsUpdate] = None
    # Send a date to set the deadline, or null to clear it. Omit to leave it unchanged.
    deadline_date: Optional[date] = None

    @field_validator("title", mode="before")
    @classmethod
    def title_not_empty(cls, value: Any) -> Any:
        return _clean_title(value)


class ProjectImageResponse(BaseModel):
    project_id: str
    image_url: str
    filename: str
