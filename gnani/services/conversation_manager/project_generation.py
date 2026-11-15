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

    lines.extend(idea_check_brief(state))
    return "\n".join(lines)


def idea_check_brief(state: ConversationState) -> list[str]:
    """What Idea Check found and what the student chose, for the plan."""

    check = state.idea_check
    if check is None:
        return []
    lines = ["", "Idea Check (done before the plan; use it in section 2 of the README):"]
    if check.similar_projects:
        lines.append("- Similar existing projects (real search results; link to them exactly as given):")
        for project in check.similar_projects:
            extra = ", won a hackathon prize" if project.winner else (f", {project.stars} GitHub stars" if project.stars else "")
            lines.append(f"  - [{project.title}]({project.url}) ({project.source}{extra}): {project.description or 'no description'}")
    else:
        lines.append("- No close existing projects were found on GitHub or Devpost (that is not proof that none exist).")
    if check.explanation:
        lines.append(f"- Comparison: {check.explanation}")
    lines.append(f"- Feasibility for this student: {check.feasibility.verdict.replace('_', ' ')}. {check.feasibility.reason}".rstrip())
    direction = state.chosen_direction
    if direction is not None:
        lines.append(
            f"- THE STUDENT CHOSE THIS DIRECTION. Build the whole plan around it: {direction.title}: "
            f"{direction.description} {direction.why}".rstrip()
        )
    else:
        lines.append("- The student chose to build the idea as it is.")
        if check.angles:
            lines.append("- Other ways to stand out that were suggested (mention under Next Steps): " + "; ".join(a.title for a in check.angles))
    return lines


# The structure of the README for a confirmed project. It is the user's
# implementation guide, so it must say HOW to build the project, not just
# what it is. (The general Reasoning prompt asks for a short README for
# other requests; this request overrides that.)
IMPLEMENTATION_README_STRUCTURE = """
# <Project Name>

## 1. Overview
What it is, the problem it solves, and who it is for (2-4 sentences).

## 2. What Makes It Different
The similar projects from the Idea Check (as Markdown links, exactly as given) and, for each, how this project differs. If the student chose a direction, explain how it makes the project stand out. If nothing similar was found, say so honestly.

## 3. Features
Bullet list. Mark each as **Must have** or **Nice to have**. The features of the chosen direction are Must have.

## 4. Technology Stack
A table: | Part | Technology | Why |. Say which the user chose and which are your recommendations.

## 5. What You Need
Hardware (with quantities), software, libraries, accounts or APIs. Include rough costs only if the user gave a budget.

## 6. How It Works
The architecture: the main components and how data or signals flow between them, step by step.

## 7. Step-by-Step Implementation
Numbered phases in build order (setup, each feature, integration). For EVERY phase give:
- **Goal:** what is working at the end of the phase.
- **Steps:** concrete numbered actions: commands to run, libraries to install, files to create.
- **Details:** for hardware, the exact wiring (component pin -> board pin); for software, the key functions, endpoints or screens.
- **Code:** a short code snippet for the core logic of that phase, in the chosen language.
- **Test it:** how to check the phase works before moving on.

## 8. Timeline
A day-by-day or week-by-week plan that fits the user's deadline and available time, using the phases above.

## 9. Testing and Demo Checklist
Checkbox list covering every Must have feature, plus what to show in the demo.

## 10. Common Problems and Tips
The 3-5 most likely problems (for example wiring, power, permissions, API limits) and how to fix each.

## 11. Next Steps
Improvements after the first version works.
"""


# Gemini only: adds the full Implementation Plan (project structure, frontend,
# backend, data, hardware, connections, deployment). Too long for the local
# Qwen model, which keeps the structure above.
DETAILED_IMPLEMENTATION_README_STRUCTURE = """
# <Project Name>

## 1. Overview
What it is, the problem it solves, and who it is for (2-4 sentences).

## 2. What Makes It Different
The similar projects from the Idea Check (as Markdown links, exactly as given) and, for each, how this project differs. If the student chose a direction, explain how it makes the project stand out. If nothing similar was found, say so honestly.

## 3. Features
Bullet list. Mark each as **Must have** or **Nice to have**. The features of the chosen direction are Must have.

## 4. Technology Stack
A table: | Part | Technology | Why |. One row for each part (frontend, backend, database, AI/ML, hardware, hosting) that this project has. Say which the user chose and which are your recommendations.

## 5. What You Need
Hardware (with quantities), software, libraries, accounts or APIs. Include rough costs only if the user gave a budget.

## 6. How It Works
The architecture: the main components and how data or signals flow between them, step by step. Include a simple text diagram, for example `Phone app -> REST API -> Database`.

## 7. Implementation Plan
How to build each part of the project. Write EVERY subsection below. When the project does not have a part, write one line saying why it is not needed (for example "No backend: the app keeps its data on the phone") instead of skipping the heading.

### 7.1 Project Structure
The complete folder and file tree in a code block, covering every part (for example `frontend/`, `backend/`, `firmware/`, `ml/`, `docs/`), with a short `# comment` after each file saying what it contains. Then the commands that create the project skeleton.

### 7.2 Frontend
The app or website the user sees.
- **Setup:** the commands to create and run it.
- **Screens / pages:** a list of each one, what it shows, and what the user can do there.
- **Components:** the main reusable components.
- **State and data:** where data is kept, and how the frontend calls the backend (which endpoints, when).
- **Code:** a snippet of the most important screen or component.

### 7.3 Backend
The server, API or cloud functions.
- **Setup:** the commands to create and run it.
- **API endpoints:** a table: | Method | Path | What it does | Request | Response |.
- **Business logic:** the main modules or services and what each does.
- **Authentication and security:** how users log in, and how secrets (API keys) are kept out of the code.
- **Code:** a snippet of the most important endpoint.

### 7.4 Database and Data
The data models: a table or schema for each one (fields, types, relations), and where data is stored. For AI/ML: the dataset (source, size, how to prepare it), the model, and how it is trained and served.

### 7.5 Hardware and Firmware
For hardware projects: the circuit (wiring table: | Component | Pin | Board pin |), the power supply, the firmware structure, and a snippet of the main loop. Otherwise one line saying no hardware is needed.

### 7.6 Connecting the Parts
How the frontend, backend, database and hardware talk to each other (HTTP, WebSocket, MQTT, Bluetooth...), the message or JSON format, and an example of one request going through the whole system.

### 7.7 Running and Deploying
The environment variables (`.env` names only, never real values), how to run everything locally, and how to deploy each part (with free options where possible).

## 8. Step-by-Step Build Order
Numbered phases in build order (setup, each feature, integration), building on the parts in section 7. For EVERY phase give:
- **Goal:** what is working at the end of the phase.
- **Steps:** concrete numbered actions: commands to run, libraries to install, files to create (using the paths from 7.1).
- **Code:** a short code snippet for the core logic of that phase, in the chosen language, when section 7 does not already show it.
- **Test it:** how to check the phase works before moving on.

## 9. Timeline
A day-by-day or week-by-week plan that fits the user's deadline and available time, using the phases above. If the user has a team, say who builds which part.

## 10. Testing and Demo Checklist
Checkbox list covering every Must have feature, plus what to show in the demo.

## 11. Common Problems and Tips
The 3-5 most likely problems (for example wiring, power, permissions, CORS, API limits) and how to fix each.

## 12. Next Steps
Improvements after the first version works.
"""


def build_reasoning_request(brief: str, detailed: bool = False) -> str:
    # The Reasoning prompt only fills project_prompt (the README) "when
    # README generation is explicitly requested", so it is requested
    # explicitly here. Without this, qwen2.5:7b leaves it empty.
    # detailed=True (Gemini) asks for the full Implementation Plan as well.
    if detailed:
        covers = "project structure, frontend, backend, data, wiring, libraries, commands, code snippets, test steps"
        structure = DETAILED_IMPLEMENTATION_README_STRUCTURE
    else:
        covers = "wiring, libraries, commands, code snippets, test steps"
        structure = IMPLEMENTATION_README_STRUCTURE
    return (
        "Create a complete, practical project plan and README for this confirmed project. "
        "Respect the deadline, available time, budget, team size, existing skills, available "
        "hardware and constraints. Use the technologies the user chose. Where the user asked "
        "for recommendations, recommend suitable options and explain why. Do not invent "
        "requirements or resources the user did not mention.\n\n"
        "README generation IS explicitly requested: put the complete Markdown README in the "
        "project_prompt field. project_prompt must NOT be empty.\n\n"
        "This README is the user's IMPLEMENTATION GUIDE, so for this request it must be detailed, "
        f"not concise: give concrete implementation details ({covers}). That is not inventing "
        "requirements; it is explaining how to build what the user asked for. Use exactly this "
        "structure and fill every section with content specific to this project (no placeholders):\n"
        + structure
        + "\nThe `response` field is a short message to the user (3-5 sentences): what the plan "
        "contains and the first thing to do. Only mention what is really in the README.\n\n"
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

    def __init__(
        self,
        perception_pipeline: Any,
        reasoning_pipeline: Any,
        diagram_generator: Any,
        detailed_plan: bool = False,
    ):
        # detailed_plan: ask for the full Implementation Plan (Gemini only).
        self.detailed_plan = detailed_plan
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
            user_message=build_reasoning_request(brief, detailed=self.detailed_plan),
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
