"""
Pydantic models used by the VEYA Conversation Manager.

Everything that moves between the API, the conversation state and the
Qwen model is described here, so it is always validated.
"""

import logging
import secrets
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

logger = logging.getLogger(__name__)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


# =========================================================
# STATUS AND ACTIONS
# =========================================================


class ConversationStatus(str, Enum):
    CREATED = "created"
    COLLECTING_INFORMATION = "collecting_information"
    AWAITING_CONFIRMATION = "awaiting_confirmation"
    READY_TO_GENERATE = "ready_to_generate"
    GENERATING_PROJECT = "generating_project"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    ERROR = "error"


class ConversationAction(str, Enum):
    """The only actions the Qwen model is allowed to choose."""

    ASK_QUESTION = "ask_question"
    PROVIDE_GUIDANCE = "provide_guidance"
    UPDATE_INFORMATION = "update_information"
    REQUEST_CLARIFICATION = "request_clarification"
    SUMMARISE = "summarise"
    REQUEST_CONFIRMATION = "request_confirmation"
    GENERATE_PROJECT = "generate_project"
    CANCEL_CONVERSATION = "cancel_conversation"


# Actions where the spoken reply is written by code, not by the model.
ACTIONS_WITH_CODE_WRITTEN_REPLY = {
    ConversationAction.SUMMARISE,
    ConversationAction.REQUEST_CONFIRMATION,
    ConversationAction.GENERATE_PROJECT,
    ConversationAction.CANCEL_CONVERSATION,
}

ProjectType = Literal[
    "hackathon",
    "college_project",
    "academic_research",
    "personal_project",
    "startup",
    "other",
]

# Languages offered in the existing frontend dropdown, mapped to the
# language codes used by Gnani TTS.
SUPPORTED_OUTPUT_LANGUAGES: dict[str, str] = {
    "English": "en-IN",
    "Hindi": "hi-IN",
    "Tamil": "ta-IN",
    "Telugu": "te-IN",
    "Kannada": "kn-IN",
    "Malayalam": "ml-IN",
    "Bengali": "bn-IN",
    "Marathi": "mr-IN",
    "Gujarati": "gu-IN",
    "Punjabi": "pa-IN",
}


# =========================================================
# PROJECT DETAILS
# =========================================================


# Words the model writes when it has NO information. They are treated as
# "not provided", so VEYA never says "your deadline is Not specified".
PLACEHOLDER_VALUES = {
    "", "null", "none", "n/a", "na", "unknown", "not specified", "unspecified",
    "not mentioned", "not provided", "not given", "not known", "not sure",
}


def _is_placeholder(text: str) -> bool:
    return text.strip().strip(".").lower() in PLACEHOLDER_VALUES


def _as_string_list(value: Any) -> Any:
    """
    Small models sometimes return "Python, React" instead of
    ["Python", "React"]. Accept both forms, and drop placeholder items.
    """

    if value is None:
        return None

    if isinstance(value, str):
        parts = [part.strip() for part in value.split(",")]
        return [part for part in parts if not _is_placeholder(part)]

    if isinstance(value, list):
        items = [str(item).strip() for item in value]
        return [item for item in items if not _is_placeholder(item)]

    return value


def _as_optional_text(value: Any) -> Any:
    """Treat empty strings and placeholder words as "not provided"."""

    if value is None:
        return None

    if isinstance(value, (int, float)):
        return str(value)

    if isinstance(value, str):
        cleaned = value.strip()
        if _is_placeholder(cleaned):
            return None
        return cleaned

    return value


class ProjectDetails(BaseModel):
    """
    Information collected about the user's project.

    Every field is optional. None means "not known yet".
    The same model is used for the facts the model extracts in a
    single turn, where None means "no change".
    """

    initial_idea: Optional[str] = Field(default=None, description="The idea in the user's own words.")
    problem_statement: Optional[str] = Field(default=None, description="Problem the project solves.")
    proposed_solution: Optional[str] = Field(default=None, description="How the user wants to solve it.")
    project_type: Optional[ProjectType] = Field(default=None, description="Why the project is being built.")
    target_users: Optional[list[str]] = Field(default=None, description="Who will use the project.")
    expected_outcome: Optional[str] = Field(default=None, description="What the user wants to have at the end.")
    deadline: Optional[str] = Field(default=None, description="Submission date or deadline, as the user said it.")
    available_time: Optional[str] = Field(default=None, description="How much time the user can spend.")
    team_size: Optional[str] = Field(default=None, description="Number of people working on it.")
    preferred_technologies: Optional[list[str]] = Field(default=None, description="Technologies the user wants to use.")
    technical_skills: Optional[list[str]] = Field(default=None, description="Technologies the user already knows.")
    available_hardware: Optional[list[str]] = Field(default=None, description="Hardware the user already has.")
    available_software: Optional[list[str]] = Field(default=None, description="Software or tools the user has.")
    budget: Optional[str] = Field(default=None, description="Approximate budget.")
    preferred_features: Optional[list[str]] = Field(default=None, description="Features the user wants.")
    constraints: Optional[list[str]] = Field(default=None, description="Restrictions or limitations.")
    recommendations_requested: Optional[list[str]] = Field(
        default=None,
        description="Areas where the user asked VEYA to recommend something.",
    )
    veya_recommendations: Optional[list[str]] = Field(
        default=None,
        description="Suggestions made by VEYA. These are NOT confirmed user preferences.",
    )
    additional_instructions: Optional[list[str]] = Field(default=None, description="Anything else the user asked for.")

    @field_validator(
        "target_users",
        "preferred_technologies",
        "technical_skills",
        "available_hardware",
        "available_software",
        "preferred_features",
        "constraints",
        "recommendations_requested",
        "veya_recommendations",
        "additional_instructions",
        mode="before",
    )
    @classmethod
    def convert_to_list(cls, value: Any) -> Any:
        return _as_string_list(value)

    @field_validator(
        "initial_idea",
        "problem_statement",
        "proposed_solution",
        "expected_outcome",
        "deadline",
        "available_time",
        "team_size",
        "budget",
        mode="before",
    )
    @classmethod
    def clean_text(cls, value: Any) -> Any:
        return _as_optional_text(value)

    @field_validator("project_type", mode="before")
    @classmethod
    def normalise_project_type(cls, value: Any) -> Any:
        """Map loose model output such as "Hackathon" or "college" to a known type."""

        value = _as_optional_text(value)
        if value is None:
            return None

        text = str(value).lower().replace("-", " ").replace("_", " ")

        keyword_to_type = [
            ("hackathon", "hackathon"),
            ("college", "college_project"),
            ("university", "college_project"),
            ("school", "college_project"),
            ("research", "academic_research"),
            ("academic", "academic_research"),
            ("personal", "personal_project"),
            ("hobby", "personal_project"),
            ("startup", "startup"),
            ("product", "startup"),
            ("business", "startup"),
        ]

        for keyword, project_type in keyword_to_type:
            if keyword in text:
                return project_type

        return "other"


# All field names of ProjectDetails, used to validate model output.
PROJECT_FIELD_NAMES: list[str] = list(ProjectDetails.model_fields.keys())

# Fields that hold a list of items (technologies, features, ...).
# Only these can have items removed by a correction.
LIST_FIELD_NAMES: list[str] = [
    "target_users",
    "preferred_technologies",
    "technical_skills",
    "available_hardware",
    "available_software",
    "preferred_features",
    "constraints",
    "recommendations_requested",
    "veya_recommendations",
    "additional_instructions",
]

# Fields that are required before VEYA may ask for confirmation.
REQUIRED_FIELDS: list[str] = ["initial_idea"]

# Fields that VEYA itself fills. They are never "missing" information.
VEYA_OWNED_FIELDS: list[str] = ["veya_recommendations"]

# Fields covered by VEYA's three fixed questions (timeline, technologies).
# These are the only ones the user can say they are unsure about.
FIXED_QUESTION_FIELDS: list[str] = [
    "deadline",
    "available_time",
    "preferred_technologies",
    "technical_skills",
]


def _keep_known_field_names(values: Any) -> list[str]:
    """Drop field names the model invented."""

    if not isinstance(values, list):
        return []

    known_names = []
    for name in values:
        if isinstance(name, str) and name in PROJECT_FIELD_NAMES:
            known_names.append(name)
        else:
            logger.info("Ignoring unknown field name from model: %r", name)

    return known_names


# =========================================================
# MESSAGES AND STATE
# =========================================================


class ConversationMessage(BaseModel):
    message_id: str = Field(default_factory=lambda: secrets.token_hex(8))
    role: Literal["user", "assistant"]
    text: str
    timestamp: datetime = Field(default_factory=utc_now)
    language: Optional[str] = Field(default=None, description="Language detected or used for this message.")
    message_type: Optional[str] = Field(default=None, description="For example answer, ask_question or summarise.")
    english_text: Optional[str] = Field(
        default=None,
        description="English version of the message, used when talking to Qwen.",
    )


class FixedAnswer(BaseModel):
    """The user's answer to one of VEYA's three fixed questions."""

    question: str = Field(description="The question in English, as VEYA asked it.")
    answer: str = Field(description="The answer exactly as transcribed or typed.")
    language: Optional[str] = Field(default=None, description="Language detected by Gnani STT, if known.")


class FieldCorrection(BaseModel):
    field_name: str
    old_value: Any
    new_value: Any
    timestamp: datetime = Field(default_factory=utc_now)


class ProjectGenerationResult(BaseModel):
    """Output of the existing Perception + Reasoning workflow."""

    project_name: str
    response: str
    readme_markdown: str = ""
    readme_filename: Optional[str] = None
    workflow_diagram: Optional[str] = None
    image_generation_available: bool = False
    perception_input: str
    perception: dict[str, Any] = Field(default_factory=dict)


class ConversationState(BaseModel):
    """Everything the backend knows about one conversation session."""

    session_id: str
    status: ConversationStatus = ConversationStatus.CREATED
    preferred_language: str = "English"
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)

    project_details: ProjectDetails = Field(default_factory=ProjectDetails)
    messages: list[ConversationMessage] = Field(default_factory=list)

    # Answers to the three fixed questions (idea, timeline, technologies).
    # They are only sent to Qwen once all three are in.
    fixed_answers: list[FixedAnswer] = Field(default_factory=list)
    # The wording of the three questions for this conversation (varied for
    # returning users). Empty means the original FIXED_QUESTIONS.
    fixed_questions: list[str] = Field(default_factory=list)
    # True after Qwen has processed the fixed answers and VEYA has read
    # the first summary. From then on, answers are corrections or "yes".
    initial_summary_done: bool = False
    asked_topics: list[str] = Field(default_factory=list)
    skipped_fields: list[str] = Field(default_factory=list)
    corrections: list[FieldCorrection] = Field(default_factory=list)
    confirmed_at: Optional[datetime] = None

    generation_result: Optional[ProjectGenerationResult] = None
    # Id of the saved project, once generation succeeded and was stored.
    project_id: Optional[str] = None
    last_error: Optional[str] = None

    # Subscription plan of the user, fixed when the conversation starts.
    plan: str = "free"

    # Internal data that is never sent to the frontend.
    # User id from the X-Veya-User header; the saved project belongs to it.
    owner_id: Optional[str] = Field(default=None, exclude=True, repr=False)
    latest_audio: Optional[bytes] = Field(default=None, exclude=True, repr=False)
    visual_generation_input: Optional[dict[str, Any]] = Field(default=None, exclude=True, repr=False)

    def user_turn_count(self) -> int:
        return sum(1 for message in self.messages if message.role == "user")

    def unknown_fields(self) -> list[str]:
        """Fields that have no value and were not skipped by the user."""

        details = self.project_details.model_dump()
        return [
            name
            for name in PROJECT_FIELD_NAMES
            if details[name] in (None, [])
            and name not in self.skipped_fields
            and name not in VEYA_OWNED_FIELDS
        ]


# =========================================================
# QWEN DECISION
# =========================================================


class ConversationDecision(BaseModel):
    """The structured decision Qwen must return after every user message."""

    extracted_information: ProjectDetails = Field(
        default_factory=ProjectDetails,
        description="New facts from the latest message.",
    )
    corrected_information: ProjectDetails = Field(
        default_factory=ProjectDetails,
        description="Text facts that replace something the user said earlier.",
    )
    removed_information: dict[str, list[str]] = Field(
        default_factory=dict,
        description=(
            "List items the user no longer wants, by field name. "
            "'Flutter instead of React' removes React here and adds Flutter "
            "in extracted_information. Small models handle this far more "
            "reliably than re-writing the whole corrected list."
        ),
    )
    skipped_fields: list[str] = Field(
        default_factory=list,
        description="Fields the user does not know or does not want to answer.",
    )
    next_action: ConversationAction
    next_question: Optional[str] = None
    question_topic: Optional[str] = Field(
        default=None,
        description="The project field the next question is about.",
    )
    ready_for_confirmation: bool = False
    missing_information: list[str] = Field(default_factory=list)
    response: str = Field(default="", description="What VEYA says to the user.")

    @field_validator("extracted_information", "corrected_information", mode="before")
    @classmethod
    def empty_details_when_missing(cls, value: Any) -> Any:
        return value if value is not None else {}

    @field_validator("skipped_fields", mode="before")
    @classmethod
    def only_known_skipped_fields(cls, value: Any) -> list[str]:
        return _keep_known_field_names(value)

    @field_validator("removed_information", mode="before")
    @classmethod
    def only_known_list_fields(cls, value: Any) -> dict[str, list[str]]:
        """Keep only real list fields, each with a clean list of strings."""

        if not isinstance(value, dict):
            return {}

        cleaned: dict[str, list[str]] = {}
        for field_name, items in value.items():
            if field_name not in LIST_FIELD_NAMES:
                logger.info("Ignoring removal for unknown list field: %r", field_name)
                continue
            item_list = _as_string_list(items)
            if isinstance(item_list, list) and item_list:
                cleaned[field_name] = item_list

        return cleaned

    @field_validator("missing_information", mode="before")
    @classmethod
    def missing_information_as_list(cls, value: Any) -> Any:
        return _as_string_list(value) or []

    @field_validator("question_topic", mode="before")
    @classmethod
    def only_known_question_topic(cls, value: Any) -> Optional[str]:
        if isinstance(value, str) and value in PROJECT_FIELD_NAMES:
            return value
        return None

    @field_validator("next_question", mode="before")
    @classmethod
    def clean_next_question(cls, value: Any) -> Any:
        return _as_optional_text(value)

    @field_validator("response", mode="before")
    @classmethod
    def clean_response(cls, value: Any) -> Any:
        return value.strip() if isinstance(value, str) else value

    @model_validator(mode="after")
    def make_sure_there_is_something_to_say(self) -> "ConversationDecision":
        if not self.response and self.next_question:
            self.response = self.next_question

        # For these actions the code writes what VEYA says (the summary,
        # the "building your project" message, the goodbye), so the model
        # may leave the response empty.
        if not self.response and self.next_action in ACTIONS_WITH_CODE_WRITTEN_REPLY:
            return self

        if not self.response:
            raise ValueError("The decision must contain a response for the user.")

        return self


class AnswerExtraction(BaseModel):
    """What Qwen returns after reading the three fixed answers."""

    project_details: ProjectDetails = Field(default_factory=ProjectDetails)
    skipped_fields: list[str] = Field(
        default_factory=list,
        description="Fields the user said they don't know or aren't sure about.",
    )

    @field_validator("project_details", mode="before")
    @classmethod
    def empty_details_when_missing(cls, value: Any) -> Any:
        return value if value is not None else {}

    @field_validator("skipped_fields", mode="before")
    @classmethod
    def only_fields_veya_asked_about(cls, value: Any) -> list[str]:
        # The user can only be "not sure" about something VEYA asked.
        # Testing showed the model otherwise marks budget, hardware, team
        # and more as skipped, and the summary would mention all of them.
        return [name for name in _keep_known_field_names(value) if name in FIXED_QUESTION_FIELDS]

    @model_validator(mode="after")
    def never_accept_veya_recommendations(self) -> "AnswerExtraction":
        # VEYA has not suggested anything yet at this point, so the model
        # must not fill this field from the user's answers.
        self.project_details.veya_recommendations = None
        return self


# =========================================================
# API REQUESTS AND RESPONSES
# =========================================================


class StartConversationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    preferred_language: str = "English"
    # True when this user has already heard VEYA's full introduction:
    # VEYA then opens with a short greeting instead.
    returning_user: bool = False

    @field_validator("preferred_language")
    @classmethod
    def language_must_be_supported(cls, value: str) -> str:
        value = value.strip()
        for language_name in SUPPORTED_OUTPUT_LANGUAGES:
            if value.lower() == language_name.lower():
                return language_name
        raise ValueError(
            "Unsupported language. Choose one of: "
            + ", ".join(SUPPORTED_OUTPUT_LANGUAGES)
        )


class ConversationTurnResponse(BaseModel):
    """Returned after VEYA says something (start or user turn)."""

    session_id: str
    status: ConversationStatus
    message: str
    next_action: Optional[ConversationAction] = None
    transcript: Optional[str] = None
    detected_language: Optional[str] = None
    audio_available: bool = False
    audio_error: Optional[str] = None
    project_details: ProjectDetails
    skipped_fields: list[str] = Field(default_factory=list)
    # True after the last fixed answer: VEYA said "Okay, got it..." and the
    # frontend should now call POST /conversation/{id}/summary.
    summary_pending: bool = False


class PublicMessage(BaseModel):
    role: Literal["user", "assistant"]
    text: str
    timestamp: datetime
    message_type: Optional[str] = None


class ConversationStateResponse(BaseModel):
    session_id: str
    status: ConversationStatus
    preferred_language: str
    project_details: ProjectDetails
    skipped_fields: list[str]
    messages: list[PublicMessage]
    generation_result: Optional[ProjectGenerationResult] = None
    project_id: Optional[str] = None
    last_error: Optional[str] = None


class ConfirmConversationResponse(BaseModel):
    session_id: str
    status: ConversationStatus
    result: ProjectGenerationResult
    # None when project storage is not configured or saving failed.
    project_id: Optional[str] = None


class CancelConversationResponse(BaseModel):
    session_id: str
    status: ConversationStatus


class GenerateImageResponse(BaseModel):
    session_id: str
    image_url: str
    filename: str
