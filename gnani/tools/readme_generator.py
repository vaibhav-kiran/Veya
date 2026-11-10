from pathlib import Path
import re


BASE_DIR = Path(__file__).resolve().parent.parent
README_DIR = BASE_DIR / "readme"


def generate_readme(project_name: str, project_details: dict):
    """Generate and save project README."""

    README_DIR.mkdir(parents=True, exist_ok=True)

    safe_name = re.sub(r"[^a-zA-Z0-9_-]", "_", project_name)

    if not safe_name:
        return {"success": False, "error": "Invalid project name."}

    sections = [
        f"# {project_name}",
        "",
        "## Project Overview",
        str(project_details.get("overview", "Not specified.")),
        "",
        "## Problem Statement",
        str(project_details.get("problem_statement", "Not specified.")),
        "",
        "## Proposed Solution",
        str(project_details.get("proposed_solution", "Not specified.")),
        "",
        "## Target Users",
        str(project_details.get("target_users", "Not specified.")),
        "",
        "## Core Features"
    ]

    for feature in project_details.get("core_features", []):
        sections.append(f"- {feature}")

    sections.extend(["", "## Technologies"])

    for technology in project_details.get("technologies", []):
        sections.append(f"- {technology}")

    sections.extend([
        "",
        "## Implementation Plan",
        str(project_details.get("implementation_plan", "Not specified.")),
        "",
        "## Expected Outcome",
        str(project_details.get("expected_outcome", "Not specified.")),
        ""
    ])

    readme_path = README_DIR / f"{safe_name}.md"

    try:
        readme_path.write_text("\n".join(sections), encoding="utf-8")

        return {
            "success": True,
            "project_name": project_name,
            "readme_path": str(readme_path)
        }

    except Exception as error:
        return {"success": False, "error": str(error)}