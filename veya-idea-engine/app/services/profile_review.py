"""
Stage 1: look at the student profile, list what is missing, ask a few useful
questions and state the assumptions used until the student answers.

Deterministic on purpose: it is instant, predictable and needs no model call.
"""

from app.schemas.student import ProfileReview, StudentProfile

# field -> (question, assumption used while it is missing)
CHECKS: list[tuple[str, str, str]] = [
    ("interests", "Which topics or problems interest you most (for example healthcare, agriculture, climate, education)?",
     "No interests given: research will start from the academic field."),
    ("academic_field", "What are you studying (field and year)?",
     "Academic field unknown: ideas will avoid field-specific prerequisites."),
    ("technical_skills", "Which programming languages, tools or hardware have you used before?",
     "Skills unknown: ideas will assume beginner-to-intermediate programming."),
    ("deadline", "When does the project need to be finished?",
     "No deadline given: assuming about 8 weeks of part-time work."),
    ("budget", "Roughly how much can you spend on hardware or services?",
     "No budget given: assuming a low budget (free software, inexpensive hardware only)."),
    ("team_size", "How many people are in your team?",
     "Team size unknown: assuming a single student."),
    ("project_type", "What is the project for (hackathon, final-year project, research, startup idea, personal learning)?",
     "Project type unknown: assuming an academic project that needs a working prototype."),
    ("available_hardware", "What hardware do you already have (laptop only, Arduino, Raspberry Pi, sensors, GPU)?",
     "Hardware unknown: assuming only a laptop."),
]

MAX_QUESTIONS = 5


def review_profile(profile: StudentProfile) -> ProfileReview:
    missing, questions, assumptions = [], [], []
    for field_name, question, assumption in CHECKS:
        value = getattr(profile, field_name)
        if value in (None, "", []):
            missing.append(field_name)
            questions.append(question)
            assumptions.append(assumption)
    if not profile.interests and not profile.preferred_domains and not profile.academic_field:
        assumptions.append("Nothing about the student's interests is known yet, so results will be broad.")
    return ProfileReview(missing_fields=missing, clarifying_questions=questions[:MAX_QUESTIONS], assumptions=assumptions)


def has_research_direction(profile: StudentProfile) -> bool:
    """Research needs at least one starting point."""
    return bool(profile.interests or profile.preferred_domains or profile.academic_field)
