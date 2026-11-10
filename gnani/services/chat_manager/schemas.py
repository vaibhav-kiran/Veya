"""Request and response models for the text chat API."""

from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from services.conversation_manager.schemas import (
    ConversationAction,
    ConversationStatus,
    ProjectDetails,
    StartConversationRequest,
)


class StartChatRequest(StartConversationRequest):
    """Same as voice: the language VEYA replies in."""


class ChatMessageRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str = Field(min_length=1, max_length=4000)


class ChatTurnResponse(BaseModel):
    session_id: str
    status: ConversationStatus
    message: str
    next_action: Optional[ConversationAction] = None
    project_details: ProjectDetails
    skipped_fields: list[str] = Field(default_factory=list)
