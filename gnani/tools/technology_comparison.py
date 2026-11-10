TECHNOLOGIES = {
    "fastapi": {
        "category": "Backend",
        "strengths": ["Fast", "Python-based", "Async support"],
        "limitations": ["Requires separate frontend"],
        "best_for": ["AI applications", "ML APIs"]
    },
    "flask": {
        "category": "Backend",
        "strengths": ["Lightweight", "Simple", "Flexible"],
        "limitations": ["More manual configuration"],
        "best_for": ["Small applications", "Simple APIs"]
    },
    "django": {
        "category": "Backend",
        "strengths": ["Authentication", "ORM", "Admin panel"],
        "limitations": ["Heavier framework"],
        "best_for": ["Large web applications"]
    },
    "react": {
        "category": "Frontend",
        "strengths": ["Reusable components", "Large ecosystem"],
        "limitations": ["Requires JavaScript knowledge"],
        "best_for": ["Interactive web applications"]
    },
    "streamlit": {
        "category": "Frontend",
        "strengths": ["Python-based", "Rapid development"],
        "limitations": ["Limited UI customization"],
        "best_for": ["ML demos", "Data applications"]
    },
    "gradio": {
        "category": "Frontend",
        "strengths": ["Quick AI demos", "Python-based"],
        "limitations": ["Limited UI customization"],
        "best_for": ["AI prototypes"]
    },
    "postgresql": {
        "category": "Database",
        "strengths": ["Reliable", "Relational", "Advanced queries"],
        "limitations": ["Requires database setup"],
        "best_for": ["Structured application data"]
    },
    "sqlite": {
        "category": "Database",
        "strengths": ["Lightweight", "Simple setup"],
        "limitations": ["Limited concurrent write performance"],
        "best_for": ["Prototypes", "Local applications"]
    }
}


def compare_technologies(technologies: list, project_requirements: str):
    """Compare technologies against project requirements."""

    comparisons = []

    for technology in technologies:
        key = technology.lower().strip()

        comparisons.append({
            "technology": technology,
            "details": TECHNOLOGIES.get(key),
            "found": key in TECHNOLOGIES
        })

    return {
        "success": True,
        "project_requirements": project_requirements,
        "comparisons": comparisons
    }