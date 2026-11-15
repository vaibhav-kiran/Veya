"""
FastAPI routes for VEYA's text chat (separate from /conversation, the voice flow).

    POST /chat/start                 open a chat, get VEYA's greeting
    POST /chat/{id}/message          {"text": ...} -> VEYA's next question / summary
    GET  /chat/{id}                  messages, collected details, result
    POST /chat/{id}/confirm          generate and save the project
    POST /chat/{id}/cancel           end the chat
"""

from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Path, Request

from services.chat_manager import ChatService
from services.chat_manager.schemas import ChatMessageRequest, ChatTurnResponse, StartChatRequest
from services.conversation_manager.errors import ConversationError
from services.conversation_manager.schemas import (
    CancelConversationResponse,
    ConfirmConversationRequest,
    ConfirmConversationResponse,
    ConversationStateResponse,
)
from webapp.auth import CurrentUser
from webapp.conversation_routes import to_http_error

router = APIRouter(prefix="/chat", tags=["chat"])

SessionId = Annotated[str, Path(pattern=r"^[A-Za-z0-9_-]{20,64}$")]


def owned_session_id(request: Request, session_id: SessionId, user: CurrentUser) -> str:
    """The chat's id, after checking it belongs to the signed-in user."""
    try:
        get_chat_service(request).ensure_owner(session_id, user)
    except ConversationError as error:
        raise to_http_error(error) from error
    return session_id


OwnedSessionId = Annotated[str, Depends(owned_session_id)]


def get_chat_service(request: Request) -> ChatService:
    return request.app.state.chat_service


@router.post("/start", response_model=ChatTurnResponse)
async def start_chat(
    request: Request,
    user: CurrentUser,
    body: Optional[StartChatRequest] = None,
) -> ChatTurnResponse:
    body = body or StartChatRequest()
    try:
        return await get_chat_service(request).start_chat(body.preferred_language, owner_id=user, model=body.model)
    except ConversationError as error:
        raise to_http_error(error) from error


@router.post("/{session_id}/message", response_model=ChatTurnResponse)
async def send_message(request: Request, session_id: OwnedSessionId, body: ChatMessageRequest) -> ChatTurnResponse:
    try:
        return await get_chat_service(request).send_message(session_id, body.text)
    except ConversationError as error:
        raise to_http_error(error) from error


@router.get("/{session_id}", response_model=ConversationStateResponse)
async def get_chat(request: Request, session_id: OwnedSessionId) -> ConversationStateResponse:
    try:
        return get_chat_service(request).get_conversation_view(session_id)
    except ConversationError as error:
        raise to_http_error(error) from error


@router.post("/{session_id}/confirm", response_model=ConfirmConversationResponse)
async def confirm_chat(
    request: Request, session_id: OwnedSessionId, body: Optional[ConfirmConversationRequest] = None
) -> ConfirmConversationResponse:
    """Build the project. Optional body: {"choice": "as_is" | "smaller" | "angle:0..2"} from Idea Check."""
    try:
        return await get_chat_service(request).confirm_and_generate(session_id, choice=body.choice if body else None)
    except ConversationError as error:
        raise to_http_error(error) from error


@router.post("/{session_id}/cancel", response_model=CancelConversationResponse)
async def cancel_chat(request: Request, session_id: OwnedSessionId) -> CancelConversationResponse:
    try:
        return get_chat_service(request).cancel(session_id)
    except ConversationError as error:
        raise to_http_error(error) from error
