"""
SQLite storage for saved VEYA projects.

Uses Python's built-in sqlite3, so no extra dependency is needed.
Each project is stored as one JSON document, plus the columns needed
to list and filter projects.

Projects are scoped by owner_id, the user id the app sends in the
X-Veya-User header. This keeps accounts apart on a shared device but is
NOT authentication: anyone who can reach the API can send any header.
"""

import json
import logging
import sqlite3
import threading
import uuid
from pathlib import Path
from typing import Any, Optional

from services.conversation_manager.schemas import ProjectDetails, ProjectGenerationResult, utc_now
from services.project_store.timeline import build_timeline, deadline_from_details
from services.project_store.schemas import (
    ProjectSections,
    ProjectSummary,
    SectionsUpdate,
    StoredProject,
)

logger = logging.getLogger(__name__)


class ProjectNotFoundError(Exception):
    user_message = "This project does not exist or was deleted."


def _lines(items: Optional[list[str]]) -> str:
    return "\n".join(f"- {item}" for item in items or [])


def _join_blocks(*blocks: str) -> str:
    return "\n\n".join(block for block in blocks if block.strip())


def sections_from_generation(
    details: ProjectDetails,
    result: ProjectGenerationResult,
    visual_input: Optional[dict[str, Any]],
) -> ProjectSections:
    """
    Fill the plan sections from confirmed facts and the generated plan.
    Nothing is invented: empty facts give empty sections.
    """

    perception = result.perception or {}
    visual = visual_input or {}

    technologies: list[str] = []
    for item in (details.preferred_technologies or []) + list(perception.get("technologies") or []) + list(
        visual.get("technologies") or []
    ):
        if isinstance(item, str) and item.lower() not in {t.lower() for t in technologies}:
            technologies.append(item)

    goal_lines = []
    if details.expected_outcome:
        goal_lines.append(f"Expected outcome: {details.expected_outcome}")
    if details.target_users:
        goal_lines.append("Target users: " + ", ".join(details.target_users))
    if details.deadline:
        goal_lines.append(f"Deadline: {details.deadline}")
    if details.available_time:
        goal_lines.append(f"Available time: {details.available_time}")
    if details.team_size:
        goal_lines.append(f"Team size: {details.team_size}")
    if details.budget:
        goal_lines.append(f"Budget: {details.budget}")

    features = list(perception.get("core_features") or []) or list(details.preferred_features or [])
    steps = [step for step in visual.get("implementation_steps") or [] if isinstance(step, str)]

    return ProjectSections(
        overview=details.initial_idea or "",
        problem=perception.get("problem_statement") or details.problem_statement or "",
        solution=perception.get("proposed_solution") or details.proposed_solution or "",
        goals=_join_blocks("\n".join(goal_lines), "Features:\n" + _lines(features) if features else ""),
        tech_stack=_lines(technologies),
        architecture="\n".join(f"{number}. {step}" for number, step in enumerate(steps, start=1)),
        resources=_lines((details.available_hardware or []) + (details.available_software or [])),
    )


_UNSET = object()


def _stored_json(project: StoredProject) -> str:
    """What goes in the database: everything except the computed timeline and
    the columns stored separately, plus the internal deadline flag."""

    data = json.loads(project.model_dump_json(exclude={"timeline"}))
    data["deadline_resolved"] = project.deadline_resolved
    return json.dumps(data)


def with_timeline(project: StoredProject) -> StoredProject:
    """Fill in the phase timeline (deterministic, so it is computed on read)."""

    # Projects saved before deadlines existed: use what the user said.
    if not project.deadline_resolved and project.deadline_date is None:
        project.deadline_date = deadline_from_details(project.project_details, project.created_at.date())

    if project.deadline_date is None:
        project.timeline = None
        return project
    sections = project.sections
    extra = " ".join([project.title, sections.overview, sections.solution, sections.tech_stack, sections.architecture, sections.goals])
    project.timeline = build_timeline(
        start=project.created_at.date(),
        deadline=project.deadline_date,
        details=project.project_details,
        plan_text=project.plan_response,
        extra_text=extra,
    )
    return project


class ProjectRepository:

    def __init__(self, database_path: Path | str):
        self.database_path = str(database_path)
        if self.database_path != ":memory:":
            Path(self.database_path).parent.mkdir(parents=True, exist_ok=True)

        # FastAPI runs sync work in several threads; one connection guarded
        # by a lock is plenty for a single local server.
        self._connection = sqlite3.connect(self.database_path, check_same_thread=False)
        self._lock = threading.Lock()

        with self._lock, self._connection:
            self._connection.execute(
                """
                CREATE TABLE IF NOT EXISTS projects (
                    project_id TEXT PRIMARY KEY,
                    owner_id TEXT,
                    session_id TEXT,
                    updated_at TEXT NOT NULL,
                    data TEXT NOT NULL,
                    visual_input TEXT
                )
                """
            )
            self._connection.execute("CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_id)")

    # -----------------------------------------------------
    # WRITE
    # -----------------------------------------------------

    def _write(self, project: StoredProject) -> StoredProject:
        visual = json.dumps(project.visual_generation_input) if project.visual_generation_input else None
        with self._lock, self._connection:
            self._connection.execute(
                """
                INSERT INTO projects (project_id, owner_id, session_id, updated_at, data, visual_input)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(project_id) DO UPDATE SET
                    updated_at = excluded.updated_at,
                    data = excluded.data,
                    visual_input = excluded.visual_input
                """,
                (
                    project.project_id,
                    project.owner_id,
                    project.session_id,
                    project.updated_at.isoformat(),
                    _stored_json(project),
                    visual,
                ),
            )
        return project

    def create_manual(self, owner_id: Optional[str], title: str, sections: SectionsUpdate) -> StoredProject:
        project = StoredProject(
            project_id=uuid.uuid4().hex,
            owner_id=owner_id,
            title=title,
            source="manual",
            sections=ProjectSections(**sections.model_dump(exclude_none=True)),
        )
        return with_timeline(self._write(project))

    def save_generated(
        self,
        owner_id: Optional[str],
        session_id: str,
        details: ProjectDetails,
        result: ProjectGenerationResult,
        visual_input: Optional[dict[str, Any]],
    ) -> StoredProject:
        project = StoredProject(
            project_id=uuid.uuid4().hex,
            owner_id=owner_id,
            session_id=session_id,
            title=result.project_name or details.initial_idea or "Untitled project",
            source="conversation",
            sections=sections_from_generation(details, result, visual_input),
            project_details=details,
            plan_response=result.response,
            readme_markdown=result.readme_markdown,
            readme_filename=result.readme_filename,
            workflow_diagram=result.workflow_diagram,
            image_generation_available=result.image_generation_available,
            visual_generation_input=visual_input,
        )
        # "this weekend", "15 March", "in 10 days" -> a date (None if unclear).
        project.deadline_date = deadline_from_details(details, project.created_at.date())
        project.deadline_resolved = True
        return with_timeline(self._write(project))

    def update(
        self,
        owner_id: Optional[str],
        project_id: str,
        title: Optional[str] = None,
        sections: Optional[SectionsUpdate] = None,
        image_url: Optional[str] = None,
        deadline_date: Any = _UNSET,
    ) -> StoredProject:
        project = self.get(owner_id, project_id)
        if deadline_date is not _UNSET:
            project.deadline_date = deadline_date
            project.deadline_resolved = True
        if title is not None:
            project.title = title
        if sections is not None:
            project.sections = project.sections.model_copy(update=sections.model_dump(exclude_none=True))
        if image_url is not None:
            project.image_url = image_url
        project.updated_at = utc_now()
        return with_timeline(self._write(project))

    def delete(self, owner_id: Optional[str], project_id: str) -> None:
        self.get(owner_id, project_id)
        with self._lock, self._connection:
            self._connection.execute("DELETE FROM projects WHERE project_id = ?", (project_id,))

    # -----------------------------------------------------
    # READ
    # -----------------------------------------------------

    @staticmethod
    def _owner_clause(owner_id: Optional[str]) -> tuple[str, tuple[Any, ...]]:
        if owner_id is None:
            return "owner_id IS NULL", ()
        return "owner_id = ?", (owner_id,)

    def get(self, owner_id: Optional[str], project_id: str) -> StoredProject:
        clause, params = self._owner_clause(owner_id)
        with self._lock:
            row = self._connection.execute(
                f"SELECT owner_id, data, visual_input FROM projects WHERE project_id = ? AND {clause}",
                (project_id, *params),
            ).fetchone()

        if row is None:
            raise ProjectNotFoundError()

        project = StoredProject.model_validate_json(row[1])
        project.owner_id = row[0]
        project.visual_generation_input = json.loads(row[2]) if row[2] else None
        return with_timeline(project)

    def count(self, owner_id: Optional[str]) -> int:
        clause, params = self._owner_clause(owner_id)
        with self._lock:
            (total,) = self._connection.execute(f"SELECT COUNT(*) FROM projects WHERE {clause}", params).fetchone()
        return int(total)

    def list(self, owner_id: Optional[str]) -> list[ProjectSummary]:
        clause, params = self._owner_clause(owner_id)
        with self._lock:
            rows = self._connection.execute(
                f"SELECT data FROM projects WHERE {clause} ORDER BY updated_at DESC",
                params,
            ).fetchall()

        summaries = []
        for (data,) in rows:
            # with_timeline also fills in deadlines for projects saved before deadlines existed.
            project = with_timeline(StoredProject.model_validate_json(data))
            summaries.append(
                ProjectSummary(
                    project_id=project.project_id,
                    title=project.title,
                    source=project.source,
                    created_at=project.created_at,
                    updated_at=project.updated_at,
                    has_readme=bool(project.readme_markdown.strip()),
                    has_diagram=bool(project.workflow_diagram),
                    image_url=project.image_url,
                    deadline_date=project.deadline_date,
                )
            )
        return summaries
