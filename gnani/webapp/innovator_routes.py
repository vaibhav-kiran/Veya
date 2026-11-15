"""
/innovator/* — the app's door to the Idea Discovery Engine (veya-idea-engine/).

The engine runs inside this backend (started with it, see
webapp/idea_engine.py), or as a separate service if IDEA_ENGINE_URL is set.
The app only ever talks to this backend, so phones need one server address
and the engine never has to be exposed.

Session and idea ids are random and unguessable; the engine itself has no
accounts, so treat it as an internal service.
"""

import re
from typing import Any, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field

from services.llm_providers import ModelName, model_unavailable_message
from webapp.auth import current_user
from webapp.idea_engine import current_model

# Research costs search-API calls and model time, so only signed-in users may use it.
router = APIRouter(prefix="/innovator", tags=["innovator"], dependencies=[Depends(current_user)])

UNREACHABLE = "Innovator isn't available on the Veya server right now. Restart the backend and try again."
# Refining re-runs feasibility, similarity and the critic on a local model.
SLOW_TIMEOUT = httpx.Timeout(600.0, connect=5.0)
FAST_TIMEOUT = httpx.Timeout(30.0, connect=5.0)
SAFE_ID = r"^[A-Za-z0-9_-]{1,64}$"


class InnovatorProfile(BaseModel):
    """What the app's form collects. Mirrors the engine's StudentProfile (all optional)."""

    model_config = ConfigDict(extra="forbid")

    academic_field: Optional[str] = Field(default=None, max_length=200)
    academic_level: Optional[str] = Field(default=None, max_length=100)
    interests: list[str] = Field(default_factory=list, max_length=20)
    technical_skills: list[str] = Field(default_factory=list, max_length=30)
    preferred_domains: list[str] = Field(default_factory=list, max_length=20)
    available_hardware: list[str] = Field(default_factory=list, max_length=30)
    budget: Optional[str] = Field(default=None, max_length=100)
    deadline: Optional[str] = Field(default=None, max_length=100)
    team_size: Optional[int] = Field(default=None, ge=1, le=50)
    project_type: Optional[str] = Field(default=None, max_length=50)
    constraints: list[str] = Field(default_factory=list, max_length=20)


class StartRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    profile: InnovatorProfile
    # The model picked in the app; the whole research runs on it.
    model: ModelName = "qwen"


class RefineRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    feedback: str = Field(min_length=3, max_length=2000)
    # The model the search started with.
    model: ModelName = "qwen"


def _client(request: Request) -> httpx.AsyncClient:
    """The engine, started with the backend (see webapp/idea_engine.py)."""
    client = getattr(request.app.state, "innovator_http", None)
    if client is None:
        raise HTTPException(503, UNREACHABLE)
    return client


async def _call(
    request: Request, method: str, path: str, *, json: Any = None, slow: bool = False, model: Optional[str] = None
) -> Any:
    client = _client(request)
    switch = getattr(client, "model_switch", None)
    if model and switch is not None and not switch.available(model):
        raise HTTPException(503, model_unavailable_message(model))
    # The engine runs in-process: research it starts inherits this choice.
    token = current_model.set(model) if model else None
    try:
        response = await client.request(method, path, json=json, timeout=SLOW_TIMEOUT if slow else FAST_TIMEOUT)
    except httpx.TimeoutException:
        raise HTTPException(504, "Innovator is taking too long. Please try again.")
    except httpx.HTTPError:
        raise HTTPException(503, UNREACHABLE)
    finally:
        if token is not None:
            current_model.reset(token)

    if response.is_success:
        return response.json()
    try:
        detail = response.json().get("detail")
    except ValueError:
        detail = None
    if response.status_code == 404:
        raise HTTPException(404, "That Innovator session has expired. Start a new search.")
    if response.status_code == 422 or not isinstance(detail, str):
        detail = "Innovator couldn't handle that request."
    raise HTTPException(response.status_code if response.status_code < 500 else 502, detail)


def _check_id(value: str) -> str:
    if not re.match(SAFE_ID, value):
        raise HTTPException(404, "Not found.")
    return value


@router.get("/health")
async def health(request: Request) -> Any:
    return await _call(request, "GET", "/health")


@router.post("/start", status_code=201)
async def start(body: StartRequest, request: Request) -> Any:
    """Create a discovery session and start researching straight away."""
    # Only what the student filled in; the engine fills the rest with stated assumptions.
    profile = {key: value for key, value in body.profile.model_dump().items() if value not in (None, "", [])}
    return await _call(
        request, "POST", "/api/v1/idea-discovery/start", json={"profile": profile, "auto_start": True}, model=body.model
    )


@router.get("/{session_id}/status")
async def status(session_id: str, request: Request) -> Any:
    return await _call(request, "GET", f"/api/v1/idea-discovery/{_check_id(session_id)}/status")


@router.get("/{session_id}/results")
async def results(session_id: str, request: Request) -> Any:
    return await _call(request, "GET", f"/api/v1/idea-discovery/{_check_id(session_id)}/results")


@router.post("/ideas/{idea_id}/refine")
async def refine(idea_id: str, body: RefineRequest, request: Request) -> Any:
    return await _call(
        request, "POST", f"/api/v1/ideas/{_check_id(idea_id)}/refine",
        json={"feedback": body.feedback}, slow=True, model=body.model,
    )
