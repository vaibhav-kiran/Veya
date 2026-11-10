"""Single ideas: read, refine with feedback, re-evaluate."""

from fastapi import APIRouter, Depends

from app.api.dependencies import Engine, get_engine
from app.schemas.ideas import EvaluatedIdea
from app.schemas.session import EvaluateRequest, RefineRequest

router = APIRouter(prefix="/api/v1/ideas", tags=["ideas"])


@router.get("/{idea_id}", response_model=EvaluatedIdea)
async def get_idea(idea_id: str, engine: Engine = Depends(get_engine)) -> EvaluatedIdea:
    return engine.pipeline.get_idea(idea_id)


@router.post("/{idea_id}/refine", response_model=EvaluatedIdea)
async def refine_idea(idea_id: str, body: RefineRequest, engine: Engine = Depends(get_engine)) -> EvaluatedIdea:
    """Revise the idea using the student's feedback, then re-check feasibility, similarity and the critic, and re-rank.
    Takes a minute or two with a local model."""
    return await engine.pipeline.refine(idea_id, body.feedback)


@router.post("/{idea_id}/evaluate", response_model=EvaluatedIdea)
async def evaluate_idea(idea_id: str, body: EvaluateRequest | None = None, engine: Engine = Depends(get_engine)) -> EvaluatedIdea:
    """Re-evaluate the idea as it is, optionally with an updated profile (new budget, deadline, skills…)."""
    return await engine.pipeline.reevaluate(idea_id, body.profile_update if body else None)
