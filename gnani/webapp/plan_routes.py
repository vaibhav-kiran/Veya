"""
GET /plan — the signed-in user's plan and what it includes, so the app can
show plan badges, limits and upgrade prompts.
"""

from typing import Annotated, Optional

from fastapi import APIRouter, Header, Request
from pydantic import BaseModel

from services.plans import PlanResolver, plan_config

router = APIRouter(tags=["plan"])

OwnerHeader = Annotated[Optional[str], Header(alias="X-Veya-User", max_length=128)]


class EntitlementsResponse(BaseModel):
    image_generation: bool
    max_projects: Optional[int]


class PlanResponse(BaseModel):
    plan: str
    label: str
    entitlements: EntitlementsResponse
    projects_used: int


@router.get("/plan", response_model=PlanResponse)
def get_plan(request: Request, owner: OwnerHeader = None) -> PlanResponse:
    resolver: PlanResolver = request.app.state.plan_resolver
    config = plan_config(resolver.plan_for(owner))
    repository = getattr(request.app.state, "project_repository", None)
    return PlanResponse(
        plan=config.plan.value,
        label=config.label,
        entitlements=EntitlementsResponse(
            image_generation=config.entitlements.image_generation,
            max_projects=config.entitlements.max_projects,
        ),
        projects_used=repository.count(owner) if repository is not None else 0,
    )
