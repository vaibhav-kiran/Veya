"""
FastAPI routes for multi-turn VEYA conversations.

The routes stay small: they validate the request, call the
ConversationService and turn its errors into HTTP responses.
All conversation logic lives in services/conversation_manager.
"""

import logging
from typing import Annotated, Optional

from fastapi import APIRouter, File, Form, Header, HTTPException, Path, Request, UploadFile
from fastapi.responses import Response

from services.conversation_manager.conversation_service import (
    MAX_AUDIO_BYTES,
    ConversationService,
)
from services.conversation_manager.errors import (
    ConversationBusyError,
    ConversationError,
    ConversationNotFoundError,
    EmptyTranscriptError,
    ImageGenerationError,
    InvalidAudioError,
    InvalidConversationStateError,
    LanguageModelError,
    PlanLimitError,
    ProjectGenerationError,
    SpeechRecognitionError,
)
from services.conversation_manager.schemas import (
    CancelConversationResponse,
    ConfirmConversationResponse,
    ConversationStateResponse,
    ConversationTurnResponse,
    GenerateImageResponse,
    StartConversationRequest,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/conversation", tags=["conversation"])

# Session IDs are created with secrets.token_urlsafe(32).
SessionId = Annotated[str, Path(pattern=r"^[A-Za-z0-9_-]{20,64}$")]

ERROR_STATUS_CODES: dict[type[ConversationError], int] = {
    ConversationNotFoundError: 404,
    InvalidConversationStateError: 409,
    ConversationBusyError: 409,
    InvalidAudioError: 400,
    EmptyTranscriptError: 422,
    SpeechRecognitionError: 502,
    LanguageModelError: 503,
    ProjectGenerationError: 502,
    ImageGenerationError: 500,
    PlanLimitError: 403,
}


def get_service(request: Request) -> ConversationService:
    """The service is created once in app.py and stored on app.state."""
    return request.app.state.conversation_service


def to_http_error(error: ConversationError) -> HTTPException:
    status_code = ERROR_STATUS_CODES.get(type(error), 500)
    return HTTPException(status_code=status_code, detail=error.user_message)


# =========================================================
# ROUTES
# =========================================================


@router.post("/start", response_model=ConversationTurnResponse)
async def start_conversation(
    request: Request,
    body: Optional[StartConversationRequest] = None,
    x_veya_user: Annotated[Optional[str], Header(max_length=128)] = None,
) -> ConversationTurnResponse:
    body = body or StartConversationRequest()
    try:
        # The project generated from this conversation is saved for this user.
        return await get_service(request).start_conversation(
            body.preferred_language, owner_id=x_veya_user, returning_user=body.returning_user
        )
    except ConversationError as error:
        raise to_http_error(error) from error


@router.post("/{session_id}/respond", response_model=ConversationTurnResponse)
async def respond(
    request: Request,
    session_id: SessionId,
    audio_file: Optional[UploadFile] = File(default=None),
    text: Optional[str] = Form(default=None),
) -> ConversationTurnResponse:
    """Send ONE answer: either a recording (audio_file) or typed text (text)."""

    has_audio = audio_file is not None
    has_text = text is not None and text.strip() != ""

    if has_audio == has_text:
        raise HTTPException(status_code=422, detail="Send either a recording or a typed answer.")

    service = get_service(request)

    try:
        if has_audio:
            # Read one byte more than allowed so oversized files are detected.
            audio_bytes = await audio_file.read(MAX_AUDIO_BYTES + 1)
            return await service.respond_with_audio(
                session_id,
                audio_bytes=audio_bytes,
                filename=audio_file.filename,
                content_type=audio_file.content_type,
            )

        return await service.respond_with_text(session_id, text)

    except ConversationError as error:
        raise to_http_error(error) from error


@router.post("/{session_id}/summary", response_model=ConversationTurnResponse)
async def create_summary(request: Request, session_id: SessionId) -> ConversationTurnResponse:
    """
    After the three fixed questions: Qwen reads all answers once and VEYA
    reads back the summary. Can be called again if Qwen failed.
    """

    try:
        return await get_service(request).create_summary(session_id)
    except ConversationError as error:
        raise to_http_error(error) from error


@router.get("/{session_id}", response_model=ConversationStateResponse)
async def get_conversation(request: Request, session_id: SessionId) -> ConversationStateResponse:
    try:
        return get_service(request).get_conversation_view(session_id)
    except ConversationError as error:
        raise to_http_error(error) from error


@router.get("/{session_id}/audio")
async def get_latest_audio(request: Request, session_id: SessionId) -> Response:
    """The WAV audio of VEYA's latest reply."""

    try:
        audio_bytes = get_service(request).get_latest_audio(session_id)
    except ConversationError as error:
        raise to_http_error(error) from error

    if not audio_bytes:
        raise HTTPException(status_code=404, detail="No audio is available for the latest reply.")

    return Response(
        content=audio_bytes,
        media_type="audio/wav",
        headers={"Cache-Control": "no-store"},
    )


@router.post("/{session_id}/confirm", response_model=ConfirmConversationResponse)
async def confirm_conversation(request: Request, session_id: SessionId) -> ConfirmConversationResponse:
    try:
        return await get_service(request).confirm_and_generate(session_id)
    except ConversationError as error:
        raise to_http_error(error) from error


@router.post("/{session_id}/cancel", response_model=CancelConversationResponse)
async def cancel_conversation(request: Request, session_id: SessionId) -> CancelConversationResponse:
    try:
        return get_service(request).cancel(session_id)
    except ConversationError as error:
        raise to_http_error(error) from error


@router.post("/{session_id}/generate-image", response_model=GenerateImageResponse)
async def generate_image(request: Request, session_id: SessionId) -> GenerateImageResponse:
    """Stable Diffusion runs ONLY when the user explicitly asks for it."""

    try:
        return await get_service(request).generate_concept_image(session_id)
    except ConversationError as error:
        raise to_http_error(error) from error
