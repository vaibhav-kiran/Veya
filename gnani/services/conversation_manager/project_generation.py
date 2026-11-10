"""
Hands a confirmed conversation to the EXISTING project-generation workflow.

    confirmed details -> project brief (English text)
                      -> Perception Layer  (ProjectUnderstanding)
                      -> Reasoning Layer   (plan, project name, README, visual data)
                      -> Mermaid diagram   (existing DiagramGenerator)

Stable Diffusion is NOT called here. The visual data is kept so the
user can request an image explicitly later.
"""

import logging
from pathlib import Path
from typing import Any

from services.conversation_manager.schemas import (
    ConversationState,
    ProjectDetails,
    ProjectGenerationResult,
)
from services.perception_layer.schemas import ProjectUnderstanding
from tools.readme_generator import generate_readme

logger = logging.getLogger(__name__)

# Perception intents that make the Reasoning Layer produce visual data.
PROJECT_INTENTS = {"develop_new_project_idea", "improve_existing_project"}

PROJECT_TYPE_LABELS = {
    "hackathon": "Hackathon",
    "college_project": "College project",
    "academic_research": "Academic research",
    "personal_project": "Personal project",
    "startup": "Startup / product development",
    "other": "Other",
}

FIELD_LABELS = {
    "initial_idea": "Project idea",
    "problem_statement": "Problem to solve",
    "proposed_solution": "Proposed solution",
    "project_type": "Project type",
    "target_users": "Target users",
    "expected_outcome": "Expected outcome",
    "deadline": "Deadline",
    "available_time": "Available time",
    "team_size": "Team size",
    "preferred_technologies": "Technologies the user wants to use",
    "technical_skills": "User's existing technical skills",
    "available_hardware": "Hardware already available",
    "available_software": "Software and tools already available",
    "budget": "Approximate budget",
    "preferred_features": "Features the user wants",
    "constraints": "Constraints",
    "recommendations_requested": "The user wants recommendations for",
    "veya_recommendations": "Suggestions made by VEYA during the conversation (not confirmed preferences)",
    "additional_instructions": "Additional instructions",
}


def _format_value(field_name: str, value: Any) -> str:
    if field_name == "project_type":
        return PROJECT_TYPE_LABELS.get(value, str(value))
    if isinstance(value, list):
        return ", ".join(value)
    return str(value)


def build_project_brief(state: ConversationState) -> str:
    """Turn the confirmed details into a clear English brief."""

    details: ProjectDetails = state.project_details
    lines = ["Confirmed project brief collected by VEYA:"]

    for field_name, label in FIELD_LABELS.items():
        value = getattr(details, field_name)
        if value in (None, []):
            continue
        lines.append(f"- {label}: {_format_value(field_name, value)}")

    if state.skipped_fields:
        skipped_labels = [FIELD_LABELS.get(name, name) for name in state.skipped_fields]
        lines.append("- The user is not sure about (treat as unknown, do not invent): " + ", ".join(skipped_labels))

    if state.corrections:
        changes = [
            f"{FIELD_LABELS.get(item.field_name, item.field_name)} changed to {_format_value(item.field_name, item.new_value)}"
            for item in state.corrections
        ]
        lines.append("- Corrections the user made (the values above are already final): " + "; ".join(changes))

    return "\n".join(lines)


def build_reasoning_request(brief: str) -> str:
    # The Reasoning prompt only fills project_prompt (the README) "when
    # README generation is explicitly requested", so it is requested
    # explicitly here. Without this, qwen2.5:7b leaves it empty.
    return (
        "Create a complete, practical project plan and README for this confirmed project. "
        "Respect the deadline, available time, budget, team size, existing skills, available "
        "hardware and constraints. Use the technologies the user chose. Where the user asked "
        "for recommendations, recommend suitable options and explain why. Do not invent "
        "resources the user did not mention.\n\n"
        "README generation IS explicitly requested: put the complete Markdown README in the "
        "project_prompt field. project_prompt must NOT be empty.\n\n"
        + brief
    )


def build_fallback_readme(
    project_name: str,
    understanding: ProjectUnderstanding,
    details: ProjectDetails,
    visual_generation: dict[str, Any] | None,
) -> Path | None:
    """
    Write a README with the project's existing README tool, using only
    confirmed facts. Used when the Reasoning Layer returns an empty one.
    """

    implementation_steps = []
    if isinstance(visual_generation, dict):
        implementation_steps = visual_generation.get("implementation_steps") or []

    readme_result = generate_readme(
        project_name,
        {
            "overview": details.initial_idea or understanding.proposed_solution or "Not specified.",
            "problem_statement": understanding.problem_statement or details.problem_statement or "Not specified.",
            "proposed_solution": understanding.proposed_solution or details.proposed_solution or "Not specified.",
            "target_users": ", ".join(understanding.target_users) or "Not specified.",
            "core_features": understanding.core_features,
            "technologies": understanding.technologies,
            "implementation_plan": "\n".join(
                f"{number}. {step}" for number, step in enumerate(implementation_steps, start=1)
            ) or "Not specified.",
            "expected_outcome": details.expected_outcome or "Not specified.",
        },
    )

    if not isinstance(readme_result, dict) or not readme_result.get("success"):
        logger.error("Fallback README could not be written.")
        return None

    return Path(readme_result["readme_path"])


def add_confirmed_facts(understanding: ProjectUnderstanding, details: ProjectDetails) -> ProjectUnderstanding:
    """
    Make sure facts the user confirmed are not lost if the Perception
    model leaves them out.
    """

    # A confirmed VEYA conversation is always about building a project.
    if understanding.intent not in PROJECT_INTENTS:
        understanding.intent = "develop_new_project_idea"

    if not understanding.problem_statement and details.problem_statement:
        understanding.problem_statement = details.problem_statement

    if not understanding.proposed_solution and (details.proposed_solution or details.initial_idea):
        understanding.proposed_solution = details.proposed_solution or details.initial_idea

    def add_missing(target: list[str], new_items: list[str] | None) -> None:
        existing = {item.lower() for item in target}
        for item in new_items or []:
            if item.lower() not in existing:
                target.append(item)
                existing.add(item.lower())

    add_missing(understanding.target_users, details.target_users)
    add_missing(understanding.core_features, details.preferred_features)
    add_missing(understanding.technologies, details.preferred_technologies)

    constraint_facts = list(details.constraints or [])
    if details.deadline:
        constraint_facts.append(f"Deadline: {details.deadline}")
    if details.available_time:
        constraint_facts.append(f"Available time: {details.available_time}")
    if details.budget:
        constraint_facts.append(f"Budget: {details.budget}")
    if details.team_size:
        constraint_facts.append(f"Team size: {details.team_size}")
    if details.available_hardware:
        constraint_facts.append("Available hardware: " + ", ".join(details.available_hardware))
    add_missing(understanding.constraints, constraint_facts)

    return understanding


class ProjectGenerator:
    """Runs the existing Perception, Reasoning and diagram components."""

    def __init__(self, perception_pipeline: Any, reasoning_pipeline: Any, diagram_generator: Any):
        self.perception_pipeline = perception_pipeline
        self.reasoning_pipeline = reasoning_pipeline
        self.diagram_generator = diagram_generator

    def generate(self, state: ConversationState) -> tuple[ProjectGenerationResult, dict[str, Any] | None]:
        """
        Blocking call (several model requests). Run it in a thread.

        Returns the result for the user and the visual data needed for
        on-demand image generation (or None).
        """

        brief = build_project_brief(state)
        logger.info("Running Perception for conversation %s...", state.session_id[:8])

        understanding = self.perception_pipeline.understand(brief)
        understanding = add_confirmed_facts(understanding, state.project_details)

        logger.info("Running Reasoning for conversation %s...", state.session_id[:8])
        reasoning_result = self.reasoning_pipeline.reason(
            understanding,
            user_message=build_reasoning_request(brief),
        )

        if not isinstance(reasoning_result, dict):
            raise ValueError("Reasoning Layer did not return a dictionary.")

        project_name = reasoning_result.get("project_name") or ""

        # ---- diagram (same steps as the existing /analyse endpoint) ----
        workflow_diagram = None
        visual_input = None
        visual_generation = reasoning_result.get("visual_generation")

        if isinstance(visual_generation, dict) and project_name:
            visual_input = {"project_name": project_name, **visual_generation}
            diagram_result = self.diagram_generator.generate_diagram(visual_input)
            if isinstance(diagram_result, dict):
                workflow_diagram = diagram_result.get("mermaid_code")

        # ---- README written by the Reasoning Layer ----
        readme_markdown = ""
        readme_filename = None
        readme_path = reasoning_result.get("readme_path")
        if readme_path and Path(readme_path).is_file():
            readme_markdown = Path(readme_path).read_text(encoding="utf-8")
            readme_filename = Path(readme_path).name

        # The local model sometimes leaves the README empty even when it
        # is requested. Never hand the user an empty README file.
        if not readme_markdown.strip() and project_name:
            logger.warning("Reasoning returned an empty README. Building it from confirmed facts instead.")
            fallback_path = build_fallback_readme(
                project_name, understanding, state.project_details, visual_generation
            )
            if fallback_path and fallback_path.is_file():
                readme_markdown = fallback_path.read_text(encoding="utf-8")
                readme_filename = fallback_path.name

        result = ProjectGenerationResult(
            project_name=project_name,
            response=reasoning_result.get("response", ""),
            readme_markdown=readme_markdown,
            readme_filename=readme_filename,
            workflow_diagram=workflow_diagram,
            image_generation_available=visual_input is not None,
            perception_input=brief,
            perception=understanding.model_dump(),
        )

        return result, visual_input
