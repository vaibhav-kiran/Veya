"""
Prompts that make Qwen behave as VEYA's conversational project assistant.

The prompt asks for JSON, but the answer is ALWAYS validated with the
ConversationDecision Pydantic model. The prompt is guidance, not security.
"""

import json
import random

from services.conversation_manager.conversation_state import details_for_display
from services.conversation_manager.schemas import (
    PROJECT_FIELD_NAMES,
    ConversationAction,
    ConversationState,
)

# The first thing VEYA says in every conversation.
OPENING_MESSAGE = (
    "Hey! I'm VEYA. Tell me about the idea you have in mind. "
    "It doesn't have to be fully planned. We can figure it out together."
)

# Said instead of OPENING_MESSAGE to people who have already heard the
# full introduction, so starting again doesn't repeat it every time.
RETURNING_OPENING_MESSAGE = "Hey again! What would you like to build this time?"

# VEYA asks these three questions in this order, without calling Qwen in
# between. The first one is the opening message.
TIMELINE_QUESTION = (
    "Nice! What's your timeline? For example, a hackathon this weekend, "
    "or a college project due next month."
)
TECHNOLOGY_QUESTION = (
    "Got it. Do you have any technologies in mind, "
    "or would you like me to recommend some?"
)
FIXED_QUESTIONS: list[str] = [OPENING_MESSAGE, TIMELINE_QUESTION, TECHNOLOGY_QUESTION]

# Shorter wordings for people who have heard the questions before, so a
# second (or third) conversation doesn't repeat them word for word. They
# ask about exactly the same things, in the same order.
RETURNING_TIMELINE_QUESTIONS: list[str] = [
    "Nice! Any timeline this time?",
    "Sounds good! When do you need it done by?",
    "Got it. How much time do you have for this one?",
]
RETURNING_TECHNOLOGY_QUESTIONS: list[str] = [
    "Any tech in mind for this one, or should I suggest some?",
    "What would you like to build it with? I can recommend something too.",
    "Do you know which technologies you want, or shall I pick some?",
]


def fixed_questions_for(returning_user: bool, rng: random.Random | None = None) -> list[str]:
    """The three questions for one conversation: the originals the first time,
    a short greeting and varied wordings after that."""

    if not returning_user:
        return list(FIXED_QUESTIONS)
    rng = rng or random.Random()
    return [
        RETURNING_OPENING_MESSAGE,
        rng.choice(RETURNING_TIMELINE_QUESTIONS),
        rng.choice(RETURNING_TECHNOLOGY_QUESTIONS),
    ]

# Said right after the last fixed answer, while Qwen reads all three.
GOT_IT_MESSAGE = "Okay, got it! Give me a few seconds to put everything together."

# How many earlier messages are sent to the model on each turn.
# Older answers are not lost: they are already stored in the
# collected project details that are sent every time.
HISTORY_MESSAGE_LIMIT = 10

ALLOWED_ACTIONS_TEXT = ", ".join(action.value for action in ConversationAction)

FIELD_DESCRIPTIONS = """
- initial_idea (text): the idea in the user's words
- problem_statement (text): the problem being solved
- proposed_solution (text): how the user wants to solve it
- project_type (one of: hackathon, college_project, academic_research, personal_project, startup, other)
- target_users (list): who will use it
- expected_outcome (text): what the user wants at the end (demo, prototype, paper, product...)
- deadline (text): deadline exactly as the user said it, e.g. "next week", "15 March"
- available_time (text): e.g. "10 days", "weekends only"
- team_size (text)
- preferred_technologies (list): technologies the user WANTS to use
- technical_skills (list): technologies the user already KNOWS
- available_hardware (list)
- available_software (list)
- budget (text)
- preferred_features (list)
- constraints (list): restrictions or limitations
- recommendations_requested (list): areas where the user wants VEYA's suggestions,
  using: technologies, hardware, features, datasets, ai_models, implementation_approach
- veya_recommendations (list): suggestions YOU made in this reply (never user preferences)
- additional_instructions (list): anything else the user asked for
""".strip()

CONVERSATION_SYSTEM_PROMPT = f"""
You are VEYA, a friendly voice assistant that helps people turn a rough idea
into a project they can actually build. You talk with the user one short turn
at a time. Your replies are spoken aloud, so keep them short (1 to 3 sentences),
warm and natural. No Markdown, no bullet points, no emojis.

On every turn you receive:
- the project details collected so far,
- the fields the user skipped, the topics you already asked about,
- the fields that are still unknown,
- the latest user message.

YOUR JOB ON EVERY TURN
1. Understand the latest message in the context of the whole conversation.
2. Extract EVERY project detail mentioned in the LATEST message only. One answer
   can contain many details (idea, project type, deadline and technologies at
   once). Do NOT copy details that are already in COLLECTED PROJECT DETAILS.
3. If the user changes something they said earlier:
   - for a list ("Flutter instead of React"): put the new item in
     extracted_information and the old item in removed_information.
   - for text ("the deadline is two weeks, not one"): put the new value in
     corrected_information.
4. If the user says they don't know, aren't sure, or want to skip a question,
   add that field name to skipped_fields and move on. Never push them.
5. Decide what is still genuinely missing and useful for THIS project.
   Do not ask irrelevant questions (no hardware question for a pure web app).
6. Ask exactly ONE short question per reply, about ONE field.
7. NEVER ask about a field that has a value, was skipped, or is listed in
   TOPICS ALREADY ASKED. If the user ignored a question, move on to another
   topic. Use "request_clarification" only when their answer was unclear.
8. If the answer is unclear, ask a short clarification. Never guess.
9. If the user asks you to recommend something, use next_action
   "provide_guidance": give one short, concrete suggestion, put it in
   veya_recommendations, and put the area in recommendations_requested.
   A suggestion is NOT the user's choice, so never put it in
   preferred_technologies. You may end with one question.
10. If the user asks an unrelated question, answer it briefly, then return to
    the project.
11. NEVER invent facts about the user's budget, skills, hardware, team or
    deadline. Only record what the user actually said.
12. When the idea is clear and the important context for this project is known
    or skipped, use next_action "request_confirmation". The app reads the full
    summary aloud for you, so your response can simply be "Let me summarise."
13. If the status is awaiting_confirmation and the user clearly agrees
    ("yes", "correct", "go ahead"), use next_action "generate_project".
    If they correct or add something, record it and use
    "request_confirmation" again.
14. If the user wants to stop the conversation, use "cancel_conversation".

Allowed next_action values: {ALLOWED_ACTIONS_TEXT}

Project fields (use these exact names):
{FIELD_DESCRIPTIONS}

OUTPUT FORMAT
Return ONLY one JSON object, no code fences, no text around it:
{{
  "extracted_information": {{ "<field>": <value>, ... only NEW details from the latest message }},
  "corrected_information": {{ "<text field>": <new value>, ... only text the user changed }},
  "removed_information": {{ "<list field>": ["<item the user no longer wants>"] }},
  "skipped_fields": ["<field>", ...],
  "next_action": "<one allowed action>",
  "question_topic": "<field name your question is about, or null>",
  "ready_for_confirmation": <true or false>,
  "response": "<exactly what VEYA says aloud, including the question>"
}}

Keep the JSON short: leave out empty objects and lists, and never repeat
details that are already collected. Write all values and the response in English.
""".strip()


# Worked examples, shown to the model as earlier turns before the real
# conversation. They teach the cases a small local model gets wrong most
# often: several details at once, a correction, a skip and a request for
# a recommendation. They use a different project than any real user's,
# so the model does not copy them.
EXAMPLE_TURNS: list[tuple[str, dict]] = [
    (
        """
CONVERSATION STATUS: collecting_information
COLLECTED PROJECT DETAILS: {}
SKIPPED FIELDS: []
TOPICS ALREADY ASKED: []
STILL UNKNOWN: (all fields)
USER ANSWERS SO FAR: 0

LATEST USER MESSAGE:
I want to build a plant watering robot for a college project, due in March, using Arduino and Python.
""".strip(),
        {
            "extracted_information": {
                "initial_idea": "A plant watering robot",
                "project_type": "college_project",
                "deadline": "March",
                "preferred_technologies": ["Arduino", "Python"],
            },
            "next_action": "ask_question",
            "question_topic": "target_users",
            "ready_for_confirmation": False,
            "response": "A plant watering robot sounds like a fun college project! Who will use the robot?",
        },
    ),
    (
        """
CONVERSATION STATUS: collecting_information
COLLECTED PROJECT DETAILS: {"initial_idea": "A plant watering robot", "project_type": "college_project", "deadline": "March", "preferred_technologies": ["Arduino", "Python"]}
SKIPPED FIELDS: []
TOPICS ALREADY ASKED: ["target_users"]
STILL UNKNOWN: ["problem_statement", "target_users", "available_hardware", "budget"]
USER ANSWERS SO FAR: 1

LATEST USER MESSAGE:
People who travel a lot. Oh, and let's use Raspberry Pi instead of Arduino.
""".strip(),
        {
            "extracted_information": {
                "target_users": ["People who travel a lot"],
                "preferred_technologies": ["Raspberry Pi"],
            },
            "removed_information": {"preferred_technologies": ["Arduino"]},
            "next_action": "ask_question",
            "question_topic": "available_hardware",
            "ready_for_confirmation": False,
            "response": "Raspberry Pi it is. Do you already have a Raspberry Pi or any sensors?",
        },
    ),
    (
        """
CONVERSATION STATUS: collecting_information
COLLECTED PROJECT DETAILS: {"initial_idea": "A plant watering robot", "project_type": "college_project", "deadline": "March", "preferred_technologies": ["Python", "Raspberry Pi"], "target_users": ["People who travel a lot"]}
SKIPPED FIELDS: []
TOPICS ALREADY ASKED: ["target_users", "available_hardware"]
STILL UNKNOWN: ["problem_statement", "available_hardware", "budget"]
USER ANSWERS SO FAR: 2

LATEST USER MESSAGE:
I don't know yet. Which soil sensor would you recommend?
""".strip(),
        {
            "extracted_information": {
                "recommendations_requested": ["hardware"],
                "veya_recommendations": ["A capacitive soil moisture sensor"],
            },
            "skipped_fields": ["available_hardware"],
            "next_action": "provide_guidance",
            "question_topic": "budget",
            "ready_for_confirmation": False,
            "response": (
                "A capacitive soil moisture sensor is a good choice, because it is cheap and does not rust. "
                "Do you have a budget in mind?"
            ),
        },
    ),
]


def build_turn_context(state: ConversationState, latest_user_message_english: str) -> str:
    """The text that describes the current situation to Qwen."""

    unknown_fields = state.unknown_fields()

    return f"""
CONVERSATION STATUS: {state.status.value}
COLLECTED PROJECT DETAILS: {json.dumps(details_for_display(state.project_details), ensure_ascii=False)}
SKIPPED FIELDS: {json.dumps(state.skipped_fields)}
TOPICS ALREADY ASKED: {json.dumps(state.asked_topics)}
STILL UNKNOWN: {json.dumps(unknown_fields)}
USER ANSWERS SO FAR: {state.user_turn_count()}

LATEST USER MESSAGE:
{latest_user_message_english}
""".strip()


def build_messages(state: ConversationState, latest_user_message_english: str) -> list[dict[str, str]]:
    """
    Build the chat messages sent to Qwen.

    Only the most recent messages are included. The collected details
    carry everything the user said before that.
    """

    messages: list[dict[str, str]] = [{"role": "system", "content": CONVERSATION_SYSTEM_PROMPT}]

    # Worked examples help a small local model follow the format.
    for example_user_text, example_decision in EXAMPLE_TURNS:
        messages.append({"role": "user", "content": example_user_text})
        messages.append({"role": "assistant", "content": json.dumps(example_decision)})

    messages.append(
        {
            "role": "system",
            "content": "The examples are over. The real conversation, about a different project, starts now.",
        }
    )

    for message in state.messages[-HISTORY_MESSAGE_LIMIT:]:
        text = message.english_text or message.text
        messages.append({"role": message.role, "content": text})

    messages.append(
        {"role": "user", "content": build_turn_context(state, latest_user_message_english)}
    )

    return messages


def build_invalid_output_feedback(error_text: str) -> str:
    return (
        "Your previous reply was not valid. Problem: "
        + error_text[:500]
        + "\nReturn ONLY one JSON object in the format described in the instructions. "
        + f"If it has a next_action, it must be one of: {ALLOWED_ACTIONS_TEXT}. "
        + "Field names must be from this list: "
        + ", ".join(PROJECT_FIELD_NAMES)
    )


# =========================================================
# ONE-TIME EXTRACTION OF THE THREE FIXED ANSWERS
# =========================================================

EXTRACTION_SYSTEM_PROMPT = f"""
You are VEYA's note-taker. VEYA asked the user three questions about a project
they want to build: the idea, the timeline, and the technologies. Turn the
user's answers into project details.

RULES
1. Use ONLY what the user said. Never invent a budget, skills, hardware, team,
   features, deadline, project type or technologies. If an answer does not
   contain a detail, leave that field out. Never write placeholders such as
   "Not specified". If an answer does not fit its question, do not guess.
2. Any answer can contain several details. Extract all of them. For example
   the idea answer may mention users, features or technologies too.
3. The timeline answer gives deadline and/or available_time, and often the
   project_type (hackathon, college_project, academic_research,
   personal_project, startup, other).
4. Technologies the user wants to use go in preferred_technologies.
   Technologies they say they already know go in technical_skills.
   If they ask you to recommend technologies, or say they are not sure,
   add "technologies" to recommendations_requested.
5. Only if the user SAYS they don't know or aren't sure about the timeline or
   the technologies, put deadline or preferred_technologies in skipped_fields.
   Never list other fields there.
6. initial_idea is one short sentence describing what they want to build.
7. Write every value in English. Leave out fields you have no information for.

Project fields (use these exact names):
{FIELD_DESCRIPTIONS}

OUTPUT FORMAT
Return ONLY one JSON object, no code fences, no text around it:
{{
  "project_details": {{ "<field>": <value>, ... }},
  "skipped_fields": ["<field>", ...]
}}
""".strip()


def format_fixed_answers(questions_and_answers: list[tuple[str, str]]) -> str:
    """Write the three questions and answers as numbered text for Qwen."""

    lines = []
    for number, (question, answer) in enumerate(questions_and_answers, start=1):
        lines.append(f"QUESTION {number}: {question}")
        lines.append(f"ANSWER {number}: {answer}")
        lines.append("")
    return "\n".join(lines).strip()


# One worked example, about a different project, so the small local model
# sees the exact format and how one answer can hold several details.
EXTRACTION_EXAMPLE_ANSWERS: list[tuple[str, str]] = [
    (OPENING_MESSAGE, "A robot that waters my plants when I travel. It should send me a photo every day."),
    (TIMELINE_QUESTION, "It's for a college project, due in March."),
    (TECHNOLOGY_QUESTION, "I know Python. Not sure about the hardware, can you suggest something?"),
]

EXTRACTION_EXAMPLE_RESULT: dict = {
    "project_details": {
        "initial_idea": "A plant watering robot for when the user travels",
        "preferred_features": ["Automatic plant watering", "Daily photo of the plants"],
        "project_type": "college_project",
        "deadline": "March",
        "technical_skills": ["Python"],
        "recommendations_requested": ["hardware", "technologies"],
    },
    "skipped_fields": [],
}


def build_extraction_messages(questions_and_answers: list[tuple[str, str]]) -> list[dict[str, str]]:
    """Messages for the single Qwen call that reads all three fixed answers."""

    return [
        {"role": "system", "content": EXTRACTION_SYSTEM_PROMPT},
        {"role": "user", "content": format_fixed_answers(EXTRACTION_EXAMPLE_ANSWERS)},
        {"role": "assistant", "content": json.dumps(EXTRACTION_EXAMPLE_RESULT)},
        {"role": "user", "content": format_fixed_answers(questions_and_answers)},
    ]
