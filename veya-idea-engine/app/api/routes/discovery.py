"""Discovery sessions: start, run research, poll status, read results."""

from fastapi import APIRouter, Depends, status

from app.api.dependencies import Engine, get_engine
from app.schemas.evidence import EvidenceRef
from app.schemas.session import (
    ResearchRequest, ResultsResponse, StartDiscoveryRequest, StartDiscoveryResponse, StatusResponse, DiscoverySession,
)
from app.services.profile_review import has_research_direction

router = APIRouter(prefix="/api/v1/idea-discovery", tags=["idea discovery"])


def _start_response(session: DiscoverySession) -> StartDiscoveryResponse:
    return StartDiscoveryResponse(
        session_id=session.session_id, status=session.status, missing_fields=session.review.missing_fields,
        clarifying_questions=session.review.clarifying_questions, assumptions=session.review.assumptions,
    )


@router.post("/start", response_model=StartDiscoveryResponse, status_code=status.HTTP_201_CREATED)
async def start_discovery(body: StartDiscoveryRequest, engine: Engine = Depends(get_engine)) -> StartDiscoveryResponse:
    """Create a session from the student's profile. Returns clarifying questions and the assumptions in use.
    With `auto_start`, research begins immediately (if the profile gives a direction)."""
    session = engine.pipeline.create_session(body.profile)
    if body.auto_start and has_research_direction(session.profile):
        session = engine.pipeline.start(session.session_id)
    return _start_response(session)


@router.post("/{session_id}/research", response_model=StatusResponse, status_code=status.HTTP_202_ACCEPTED)
async def run_research(session_id: str, body: ResearchRequest | None = None, engine: Engine = Depends(get_engine)) -> StatusResponse:
    """Start (or restart) research in the background. Poll /status, then read /results."""
    session = engine.pipeline.start(session_id, body.profile_update if body else None)
    return _status(session)


def _status(session: DiscoverySession) -> StatusResponse:
    return StatusResponse(
        session_id=session.session_id, status=session.status, stage=session.stage, progress=session.progress,
        counts={
            "problems": len(session.problems), "existing_solutions": sum(len(l.solutions) for l in session.landscapes),
            "gaps": len(session.gaps), "candidate_ideas": len(session.ideas),
            "selected_ideas": sum(1 for e in session.ideas if e.status == "selected"),
            "research_rounds": session.research_rounds_used,
        },
        warnings=session.warnings, error=session.error, updated_at=session.updated_at,
    )


@router.get("/{session_id}/status", response_model=StatusResponse)
async def get_status(session_id: str, engine: Engine = Depends(get_engine)) -> StatusResponse:
    return _status(engine.pipeline.get_session(session_id))


@router.get("/{session_id}/results", response_model=ResultsResponse)
async def get_results(session_id: str, engine: Engine = Depends(get_engine)) -> ResultsResponse:
    """Everything found so far. Partial while research is running; final once status is `completed`."""
    session = engine.pipeline.get_session(session_id)
    selected = sorted((e for e in session.ideas if e.status == "selected"), key=lambda e: -(e.score or 0))
    evidence = [
        EvidenceRef(evidence_id=e.evidence_id, title=e.title, url=e.url, source_type=e.source_type, published_date=e.published_date)
        for e in engine.evidence.all(session_id)
    ]
    return ResultsResponse(
        session_id=session.session_id, status=session.status, profile=session.profile, assumptions=session.review.assumptions,
        recommended_ideas=selected, rejected_ideas=[e for e in session.ideas if e.status == "rejected"],
        problems=session.problems, gaps=session.gaps, existing_solutions=session.landscapes, evidence=evidence,
        warnings=session.warnings,
    )
