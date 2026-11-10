from pydantic import BaseModel, Field
from typing import Optional
from pydantic import field_validator

class ProjectUnderstanding(BaseModel):
    """
    Structured understanding of a user's project idea.
    """


    @field_validator("target_users", mode="before")

    @classmethod

    def handle_target_users(cls, value):

        return value if value is not None else []

    raw_input: str = Field(
        description="Original, unmodified input from the user."
    )

    intent: str = Field(
        description="What the user wants to accomplish."
    )

    domain: Optional[str] = Field(
        default=None,
        description="Domain or industry of the project, if identifiable."
    )

    problem_statement: Optional[str] = Field(
        default=None,
        description="Problem the proposed project aims to solve."
    )

    proposed_solution: Optional[str] = Field(
        default=None,
        description="High-level solution proposed or implied by the user."
    )

    target_users: list[str] = Field(
        default_factory=list,
        description="People or organizations expected to use the solution."
    )

    core_features: list[str] = Field(
        default_factory=list,
        description="Features explicitly mentioned or reasonably inferred."
    )

    technologies: list[str] = Field(
        default_factory=list,
        description="Technologies explicitly mentioned or inferred."
    )

    constraints: list[str] = Field(
        default_factory=list,
        description="Technical, financial, time, or resource constraints."
    )

    explicit_information: list[str] = Field(
        default_factory=list,
        description="Information directly stated by the user."
    )

    inferred_information: list[str] = Field(
        default_factory=list,
        description="Information reasonably inferred from the user's input."
    )

    assumptions: list[str] = Field(
        default_factory=list,
        description="Unconfirmed assumptions made while interpreting the idea."
    )

    missing_information: list[str] = Field(
        default_factory=list,
        description="Important details that are not yet known."
    )

    confidence: float = Field(
        ge=0.0,
        le=1.0,
        description="Overall confidence in the interpretation."
    )