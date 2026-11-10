"""
Builds the spoken summary VEYA reads out before asking for confirmation.

The summary is written by code from the stored project details, not by
the model. That way it always matches what is shown on screen, and it
can never mention a budget, skill or deadline the user did not give.
"""

from services.conversation_manager.schemas import ConversationState

# How each project type is described in a sentence.
PROJECT_TYPE_PHRASES: dict[str, str] = {
    "hackathon": "for a hackathon",
    "college_project": "as a college project",
    "academic_research": "as academic research",
    "personal_project": "as a personal project",
    "startup": "as a startup or product",
}

# Friendlier names for recommendation areas.
RECOMMENDATION_AREA_NAMES: dict[str, str] = {
    "ai_models": "AI models",
    "implementation_approach": "an implementation approach",
}


def join_naturally(items: list[str]) -> str:
    """["A", "B", "C"] -> "A, B and C"."""

    if not items:
        return ""
    if len(items) == 1:
        return items[0]
    return ", ".join(items[:-1]) + " and " + items[-1]


def as_phrase(text: str) -> str:
    """
    Prepare a stored value for use inside a sentence.

    "A medicine reminder app." -> "a medicine reminder app"
    Acronyms such as "AI ..." keep their capital letters.
    """

    text = text.strip().rstrip(".")
    if len(text) < 2 or not text[0].isupper() or text.startswith("I "):
        return text

    # "A ..." or "Medicine ..." -> lowercase. "AI ..." -> unchanged.
    second_character = text[1]
    if second_character == " " or second_character.islower():
        return text[0].lower() + text[1:]
    return text


def build_confirmation_summary(state: ConversationState) -> str:
    details = state.project_details
    sentences: list[str] = ["Here's what I've understood so far."]

    if details.initial_idea:
        sentences.append(f"Your project idea is {as_phrase(details.initial_idea)}.")

    if details.problem_statement:
        sentences.append(f"The problem it solves: {as_phrase(details.problem_statement)}.")

    if details.proposed_solution:
        sentences.append(f"Your planned solution: {as_phrase(details.proposed_solution)}.")

    if details.target_users:
        sentences.append(f"It's meant for {join_naturally(details.target_users)}.")

    # Project type and deadline read best as one sentence.
    project_type_phrase = PROJECT_TYPE_PHRASES.get(details.project_type or "")
    if project_type_phrase and details.deadline:
        sentences.append(f"You're building it {project_type_phrase}, with a deadline of {details.deadline}.")
    elif project_type_phrase:
        sentences.append(f"You're building it {project_type_phrase}.")
    elif details.deadline:
        sentences.append(f"Your deadline is {details.deadline}.")

    if details.available_time:
        sentences.append(f"Time available: {details.available_time}.")

    if details.team_size:
        sentences.append(f"Team size: {details.team_size}.")

    if details.expected_outcome:
        sentences.append(f"At the end you'd like to have {as_phrase(details.expected_outcome)}.")

    if details.preferred_technologies:
        sentences.append(f"You'd like to use {join_naturally(details.preferred_technologies)}.")

    if details.technical_skills:
        sentences.append(f"You already know {join_naturally(details.technical_skills)}.")

    if details.available_hardware:
        sentences.append(f"Hardware you have: {join_naturally(details.available_hardware)}.")

    if details.available_software:
        sentences.append(f"Software and tools you have: {join_naturally(details.available_software)}.")

    if details.budget:
        sentences.append(f"Your budget is {details.budget}.")

    if details.preferred_features:
        sentences.append(f"Features you want: {join_naturally(details.preferred_features)}.")

    if details.constraints:
        sentences.append(f"Constraints: {join_naturally(details.constraints)}.")

    if details.recommendations_requested:
        areas = [
            RECOMMENDATION_AREA_NAMES.get(area, area.replace("_", " "))
            for area in details.recommendations_requested
        ]
        sentences.append(f"You'd like me to recommend {join_naturally(areas)}.")

    if details.veya_recommendations:
        sentences.append(
            f"I suggested {join_naturally(details.veya_recommendations)}, "
            "but those are only suggestions until you decide."
        )

    if details.additional_instructions:
        sentences.append(f"You also mentioned: {join_naturally(details.additional_instructions)}.")

    if state.skipped_fields:
        skipped_names = [name.replace("_", " ") for name in state.skipped_fields]
        sentences.append(f"You're not sure yet about the {join_naturally(skipped_names)}, and that's fine.")

    sentences.append("Is everything correct, or would you like to change anything?")

    return " ".join(sentences)
