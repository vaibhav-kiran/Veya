"""Stage 1 input: what we know about the student. Every field is optional."""

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field, field_validator

from app.schemas.common import as_list, as_text

ProjectType = Literal[
    "hackathon",
    "final_year_project",
    "academic_mini_project",
    "research_project",
    "startup_concept",
    "personal_learning",
    "other",
]


class StudentProfile(BaseModel):
    academic_field: Optional[str] = None
    academic_level: Optional[str] = None
    interests: list[str] = Field(default_factory=list)
    technical_skills: list[str] = Field(default_factory=list)
    preferred_domains: list[str] = Field(default_factory=list)
    available_hardware: list[str] = Field(default_factory=list)
    available_software: list[str] = Field(default_factory=list)
    budget: Optional[str] = Field(default=None, description='Free text, e.g. "₹5000" or "none".')
    deadline: Optional[str] = Field(default=None, description='Free text, e.g. "6 weeks" or "15 March".')
    team_size: Optional[int] = Field(default=None, ge=1, le=50)
    project_type: Optional[ProjectType] = None
    preferred_technology: list[str] = Field(default_factory=list)
    constraints: list[str] = Field(default_factory=list)
    additional_information: list[str] = Field(default_factory=list)

    @field_validator(
        "interests", "technical_skills", "preferred_domains", "available_hardware", "available_software",
        "preferred_technology", "constraints", "additional_information", mode="before",
    )
    @classmethod
    def _lists(cls, value: Any) -> Any:
        return as_list(value)

    @field_validator("academic_field", "academic_level", "budget", "deadline", mode="before")
    @classmethod
    def _text(cls, value: Any) -> Any:
        return as_text(value)

    def merged_with(self, update: "StudentProfile") -> "StudentProfile":
        """Fields given in `update` replace ours; lists are merged without duplicates."""
        data = self.model_dump()
        for key, value in update.model_dump(exclude_unset=True).items():
            if isinstance(value, list):
                data[key] = list(dict.fromkeys([*data.get(key, []), *value]))
            elif value is not None:
                data[key] = value
        return StudentProfile.model_validate(data)


class ProfileReview(BaseModel):
    """What is missing, which questions are worth asking, and what we assume meanwhile."""

    missing_fields: list[str] = Field(default_factory=list)
    clarifying_questions: list[str] = Field(default_factory=list)
    assumptions: list[str] = Field(default_factory=list)
