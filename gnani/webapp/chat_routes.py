"""
FastAPI routes for VEYA's text chat (separate from /conversation, the voice flow).

    POST /chat/start                 open a chat, get VEYA's greeting
    POST /chat/{id}/message          {"text": ...} -> VEYA's next question / summary
    GET  /chat/{id}                  messages, collected details, result
    POST /chat/{id}/confirm          generate and save the project
    POST /chat/{id}/cancel           end the chat
"""

from typing import Annotated, Optional

from fastapi import APIRouter, Header, Path, Request

from services.chat_manager import ChatService
from services.chat_manager.schemas import ChatMessageRequest, ChatTurnResponse, StartChatRequest
from services.conversation_manager.errors import ConversationError
from services.conversation_manager.schemas import (
    CancelConversationResponse,
    ConfirmConversationResponse,
    ConversationStateResponse,
)
from webapp.conversation_routes import to_http_error

router = APIRouter(prefix="/chat", tags=["chat"])

SessionId = Annotated[str, Path(pattern=r"^[A-Za-z0-9_-]{20,64}$")]


def get_chat_service(request: Request) -> ChatService:
    return request.app.state.chat_service


@router.post("/start", response_model=ChatTurnResponse)
async def start_chat(
    request: Request,
    body: Optional[StartChatRequest] = None,
    x_veya_user: Annotated[Optional[str], Header(max_length=128)] = None,
) -> ChatTurnResponse:
    body = body or StartChatRequest()
    try:
        return await get_chat_service(request).start_chat(body.preferred_language, owner_id=x_veya_user)
    except ConversationError as error:
        raise to_http_error(error) from error


@router.post("/{session_id}/message", response_model=ChatTurnResponse)
async def send_message(request: Request, session_id: SessionId, body: ChatMessageRequest) -> ChatTurnResponse:
    try:
        return await get_chat_service(request).send_message(session_id, body.text)
    except ConversationError as error:
        raise to_http_error(error) from error


@router.get("/{session_id}", response_model=ConversationStateResponse)
async def get_chat(request: Request, session_id: SessionId) -> ConversationStateResponse:
    try:
        return get_chat_service(request).get_conversation_view(session_id)
    except ConversationError as error:
        raise to_http_error(error) from error


@router.post("/{session_id}/confirm", response_model=ConfirmConversationResponse)
async def confirm_chat(request: Request, session_id: SessionId) -> ConfirmConversationResponse:
    try:
        return await get_chat_service(request).confirm_and_generate(session_id)
    except ConversationError as error:
        raise to_http_error(error) from error


@router.post("/{session_id}/cancel", response_model=CancelConversationResponse)
async def cancel_chat(request: Request, session_id: SessionId) -> CancelConversationResponse:
    try:
        return get_chat_service(request).cancel(session_id)
    except ConversationError as error:
        raise to_http_error(error) from error
