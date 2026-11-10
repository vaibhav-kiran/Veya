from datetime import date, timedelta


def estimate_project_timeline(
    project_name: str,
    complexity: str,
    available_hours_per_day: float,
    deadline_days: int
):
    """
    Estimate a project development timeline based on complexity,
    available daily development hours, and deadline.
    """

    complexity = complexity.lower().strip()

    if complexity not in ["low", "medium", "high"]:
        return {
            "success": False,
            "error": "Complexity must be low, medium, or high."
        }

    if available_hours_per_day <= 0:
        return {
            "success": False,
            "error": "Available hours per day must be greater than zero."
        }

    if deadline_days <= 0:
        return {
            "success": False,
            "error": "Deadline must be greater than zero days."
        }

    # Development phases and their percentage of total effort
    phases = {
        "low": [
            ("Planning and requirements", 10),
            ("Technology and dataset setup", 15),
            ("Core development", 40),
            ("Testing and debugging", 20),
            ("Documentation and deployment", 15)
        ],

        "medium": [
            ("Planning and research", 10),
            ("Dataset and technology selection", 15),
            ("Backend development", 20),
            ("Core implementation", 25),
            ("Frontend development and integration", 15),
            ("Testing and documentation", 15)
        ],

        "high": [
            ("Planning and research", 10),
            ("Dataset collection and preprocessing", 15),
            ("Model development and evaluation", 20),
            ("Backend development", 15),
            ("Frontend development", 15),
            ("System integration", 10),
            ("Testing, deployment and documentation", 15)
        ]
    }

    total_available_hours = (
        available_hours_per_day * deadline_days
    )

    selected_phases = phases[complexity]

    schedule = []
    current_day = 1

    for phase_name, percentage in selected_phases:

        estimated_hours = (
            total_available_hours * percentage / 100
        )

        phase_days = max(
            1,
            round(estimated_hours / available_hours_per_day)
        )

        start_day = current_day
        end_day = min(
            deadline_days,
            current_day + phase_days - 1
        )

        schedule.append({
            "phase": phase_name,
            "effort_percentage": percentage,
            "estimated_hours": round(estimated_hours, 2),
            "start_day": start_day,
            "end_day": end_day
        })

        current_day = end_day + 1

    # Check whether the estimated effort fits the deadline.
    estimated_total_days = sum(
        max(
            1,
            round(
                total_available_hours * percentage / 100
                / available_hours_per_day
            )
        )
        for _, percentage in selected_phases
    )

    feasible = estimated_total_days <= deadline_days

    return {
        "success": True,
        "project_name": project_name,
        "complexity": complexity,
        "available_hours_per_day": available_hours_per_day,
        "deadline_days": deadline_days,
        "total_available_hours": round(total_available_hours, 2),
        "estimated_total_days": estimated_total_days,
        "deadline_feasible": feasible,
        "schedule": schedule,
        "recommendation": (
            "The estimated schedule fits within the available deadline."
            if feasible
            else "The estimated work may exceed the deadline. "
                 "Consider reducing scope or increasing development hours."
        )
    }