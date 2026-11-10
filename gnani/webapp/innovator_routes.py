"""
/innovator/* — the app's door to the Idea Discovery Engine (veya-idea-engine/).

The engine runs as its own service (IDEA_ENGINE_URL, default
http://localhost:8100). The app only ever talks to this backend, so phones
need one server address and the engine never has to be exposed.

Session and idea ids are random and unguessable; the engine itself has no
accounts, so treat it as an internal service.
"""

import os
import re
from typing import Any, Optional

import httpx
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field

router = APIRouter(prefix="/innovator", tags=["innovator"])

ENGINE_URL = os.getenv("IDEA_ENGINE_URL", "http://localhost:8100").rstrip("/")
UNREACHABLE = (
    "The Innovator service isn't running. Start veya-idea-engine "
    "(uv run uvicorn app.main:app --port 8100) and try again."
)
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


class RefineRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    feedback: str = Field(min_length=3, max_length=2000)


def _client(request: Request) -> httpx.AsyncClient:
    client = getattr(request.app.state, "innovator_http", None)
    if client is None:
        client = httpx.AsyncClient(base_url=ENGINE_URL)
        request.app.state.innovator_http = client
    return client


async def _call(request: Request, method: str, path: str, *, json: Any = None, slow: bool = False) -> Any:
    try:
        response = await _client(request).request(
            method, path, json=json, timeout=SLOW_TIMEOUT if slow else FAST_TIMEOUT
        )
    except httpx.TimeoutException:
        raise HTTPException(504, "Innovator is taking too long. Please try again.")
    except httpx.HTTPError:
        raise HTTPException(503, UNREACHABLE)

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
        request, "POST", "/api/v1/idea-discovery/start", json={"profile": profile, "auto_start": True}
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
        json={"feedback": body.feedback}, slow=True,
    )
