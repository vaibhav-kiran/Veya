"""
FastAPI routes for saved VEYA projects.

Projects belong to the signed-in user (verified Clerk token, see
webapp/auth.py); one user can never see or change another's projects.
"""

import asyncio
import logging
import re
from typing import Annotated

from fastapi import APIRouter, HTTPException, Path, Request, Response

from services.conversation_manager.conversation_service import ConversationService
from webapp.auth import CurrentUser
from services.conversation_manager.errors import (
    ConversationError,
    ImageGenerationError,
    InvalidConversationStateError,
    PlanLimitError,
)
from services.plans import PlanResolver, plan_config
from services.llm_providers import model_unavailable_message
from services.project_edit import ProjectEditError, edit_readme
from services.project_store import ProjectNotFoundError, ProjectRepository
from services.project_store.schemas import (
    CreateProjectRequest,
    EditProjectRequest,
    EditProjectResponse,
    ProjectImageResponse,
    ProjectListResponse,
    StoredProject,
    UpdateProjectRequest,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/projects", tags=["projects"])

ProjectId = Annotated[str, Path(pattern=r"^[a-f0-9]{32}$")]


def get_repository(request: Request) -> ProjectRepository:
    return request.app.state.project_repository


def get_service(request: Request) -> ConversationService:
    return request.app.state.conversation_service


def get_plan_resolver(request: Request) -> PlanResolver:
    return request.app.state.plan_resolver


def not_found() -> HTTPException:
    return HTTPException(status_code=404, detail=ProjectNotFoundError.user_message)


@router.get("", response_model=ProjectListResponse)
def list_projects(request: Request, owner: CurrentUser) -> ProjectListResponse:
    return ProjectListResponse(projects=get_repository(request).list(owner))


@router.post("", response_model=StoredProject, status_code=201)
def create_project(request: Request, body: CreateProjectRequest, owner: CurrentUser) -> StoredProject:
    """Create a project from an idea the user wrote in the app."""
    repository = get_repository(request)
    limit = plan_config(get_plan_resolver(request).plan_for(owner)).entitlements.max_projects
    if limit is not None and repository.count(owner) >= limit:
        raise HTTPException(
            status_code=403,
            detail=f"Your plan includes {limit} saved project{'s' if limit != 1 else ''}. Delete one or upgrade to create more.",
        )
    return repository.create_manual(owner, body.title, body.sections)


@router.get("/{project_id}", response_model=StoredProject)
def get_project(request: Request, project_id: ProjectId, owner: CurrentUser) -> StoredProject:
    try:
        return get_repository(request).get(owner, project_id)
    except ProjectNotFoundError:
        raise not_found()


@router.patch("/{project_id}", response_model=StoredProject)
def update_project(
    request: Request,
    project_id: ProjectId,
    body: UpdateProjectRequest,
    owner: CurrentUser,
) -> StoredProject:
    try:
        changes: dict = {"title": body.title, "sections": body.sections}
        # Only touch the deadline when it was sent (null clears it).
        if "deadline_date" in body.model_fields_set:
            changes["deadline_date"] = body.deadline_date
        return get_repository(request).update(owner, project_id, **changes)
    except ProjectNotFoundError:
        raise not_found()


@router.delete("/{project_id}", status_code=204)
def delete_project(request: Request, project_id: ProjectId, owner: CurrentUser) -> Response:
    try:
        get_repository(request).delete(owner, project_id)
    except ProjectNotFoundError:
        raise not_found()
    return Response(status_code=204)


@router.get("/{project_id}/readme")
def download_readme(request: Request, project_id: ProjectId, owner: CurrentUser) -> Response:
    """The README as a Markdown file download. No server paths are exposed."""

    try:
        project = get_repository(request).get(owner, project_id)
    except ProjectNotFoundError:
        raise not_found()

    if not project.readme_markdown.strip():
        raise HTTPException(status_code=404, detail="This project has no README yet.")

    safe_name = re.sub(r"[^A-Za-z0-9_-]", "", project.title.replace(" ", "_")) or "Project"
    filename = project.readme_filename or f"{safe_name}_README.md"
    return Response(
        content=project.readme_markdown,
        media_type="text/markdown; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/{project_id}/edit", response_model=EditProjectResponse)
async def edit_project(request: Request, project_id: ProjectId, body: EditProjectRequest, owner: CurrentUser) -> EditProjectResponse:
    """Change the plan (README) as the student asked, by voice or text."""

    repository = get_repository(request)
    try:
        project = repository.get(owner, project_id)
    except ProjectNotFoundError:
        raise not_found()

    models = getattr(request.app.state, "llm_models", {})
    if body.model not in models:
        raise HTTPException(status_code=503, detail=model_unavailable_message(body.model))
    client, model = models[body.model]

    try:
        result = await asyncio.to_thread(
            edit_readme, client, model, project.title, project.readme_markdown, body.instruction, body.language
        )
    except ProjectEditError as error:
        raise HTTPException(status_code=422, detail=error.user_message) from error

    if result.changed:
        project = repository.set_readme(owner, project_id, result.readme_markdown)
    return EditProjectResponse(
        project=project, summary=result.summary, changed=result.changed, changed_sections=result.changed_sections
    )


@router.post("/{project_id}/edit/undo", response_model=StoredProject)
def undo_project_edit(request: Request, project_id: ProjectId, owner: CurrentUser) -> StoredProject:
    """Put the plan back to how it was before the last change."""
    try:
        return get_repository(request).undo_readme(owner, project_id)
    except ProjectNotFoundError:
        raise not_found()


@router.post("/{project_id}/generate-image", response_model=ProjectImageResponse)
async def generate_project_image(
    request: Request,
    project_id: ProjectId,
    owner: CurrentUser,
) -> ProjectImageResponse:
    """Stable Diffusion runs ONLY when the user explicitly asks for it."""

    try:
        image_url, filename = await get_service(request).generate_project_image(owner, project_id)
    except ProjectNotFoundError:
        raise not_found()
    except PlanLimitError as error:
        raise HTTPException(status_code=403, detail=error.user_message) from error
    except InvalidConversationStateError as error:
        raise HTTPException(status_code=409, detail=error.user_message) from error
    except ImageGenerationError as error:
        raise HTTPException(status_code=500, detail=error.user_message) from error
    except ConversationError as error:
        raise HTTPException(status_code=500, detail=error.user_message) from error

    return ProjectImageResponse(project_id=project_id, image_url=image_url, filename=filename)
