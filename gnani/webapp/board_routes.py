"""
/boards/* — idea pages (one per hackathon or purpose).

    POST /boards/research     what the page is for; for a hackathon, researched on the web
    POST /boards/rate         rate the page's ideas against it, best first
    POST /boards/check        Idea Check for one idea or project on a page
    POST /boards/improve      changes that make one item a better fit (and the instruction to apply them)
    POST /boards/transcribe   speech to text, for answering by voice

Boards and their ideas are kept on the device; these routes do the work.
"""

import asyncio
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile

from services.conversation_manager.conversation_service import MAX_AUDIO_BYTES, stt_language_hint
from services.conversation_manager.errors import ConversationError
from services.idea_boards.schemas import (
    BoardContext,
    BoardRating,
    CheckRequest,
    ImprovePlan,
    ImproveRequest,
    RateRequest,
    ResearchRequest,
    TranscriptResponse,
)
from services.idea_check import IdeaCheck, IdeaChecker
from openai import RateLimitError

from services.llm_providers import model_unavailable_message, rate_limit_message
from services.idea_boards.service import BoardError, check_details, improve, rate, research
from webapp.auth import current_user

# Research and rating use search sites and model time: signed-in users only.
router = APIRouter(prefix="/boards", tags=["boards"], dependencies=[Depends(current_user)])


def _model(request: Request, name: str):
    models = getattr(request.app.state, "llm_models", {})
    if name not in models:
        raise HTTPException(503, model_unavailable_message(name))
    return models[name]


@router.post("/research", response_model=BoardContext)
async def research_board(request: Request, body: ResearchRequest) -> BoardContext:
    client, model = _model(request, body.model)
    try:
        return await asyncio.to_thread(research, client, model, body.purpose, body.query, body.notes)
    except BoardError as error:
        raise HTTPException(502, str(error)) from error


@router.post("/rate", response_model=BoardRating)
async def rate_board(request: Request, body: RateRequest) -> BoardRating:
    client, model = _model(request, body.model)
    try:
        return await asyncio.to_thread(rate, client, model, body.context, body.ideas)
    except BoardError as error:
        raise HTTPException(502, str(error)) from error


@router.post("/check", response_model=IdeaCheck)
async def check_item(request: Request, body: CheckRequest) -> IdeaCheck:
    """Similar projects on GitHub and Devpost, ways to stand out, and feasibility for the page's purpose."""
    client, model = _model(request, body.model)
    try:
        return await asyncio.to_thread(IdeaChecker(client, model).check, check_details(body.item, body.context))
    except RateLimitError as error:
        # e.g. Groq's free tier: 200,000 tokens a day per model. Retrying soon won't help.
        raise HTTPException(429, rate_limit_message(body.model)) from error
    except Exception as error:
        raise HTTPException(502, "The idea couldn't be checked right now. Please try again.") from error


@router.post("/improve", response_model=ImprovePlan)
async def improve_item(request: Request, body: ImproveRequest) -> ImprovePlan:
    """Concrete changes that make one idea or project a stronger fit for the page's purpose."""
    client, model = _model(request, body.model)
    try:
        return await asyncio.to_thread(improve, client, model, body.context, body.item, body.rating, body.check)
    except BoardError as error:
        raise HTTPException(502, str(error)) from error


@router.post("/transcribe", response_model=TranscriptResponse)
async def transcribe(
    request: Request,
    audio_file: UploadFile = File(...),
    preferred_language: Optional[str] = Form(default="English"),
) -> TranscriptResponse:
    audio = await audio_file.read(MAX_AUDIO_BYTES + 1)
    if not audio or len(audio) > MAX_AUDIO_BYTES:
        raise HTTPException(400, "The recording is empty or too long. Please try again.")
    service = request.app.state.conversation_service
    try:
        text, _ = await service._transcribe(audio, audio_file.filename, stt_language_hint(preferred_language or "English"))
    except ConversationError as error:
        raise HTTPException(422, error.user_message) from error
    return TranscriptResponse(text=text)
