import json

import openai
import pytest

from services.conversation_manager.conversation_pipeline import (
    CANCELLED_RESPONSE,
    GENERATING_RESPONSE,
    MISSING_IDEA_RESPONSE,
    ConversationPipeline,
    extract_json_object,
)
from services.conversation_manager.conversation_state import ConversationStore
from services.conversation_manager.errors import LanguageModelError
from services.conversation_manager.schemas import (
    ConversationAction,
    ConversationDecision,
    ConversationStatus,
    ProjectDetails,
)
from tests.conftest import READY_TO_SUMMARISE_DETAILS, decision_json


def new_session(store: ConversationStore, status=ConversationStatus.COLLECTING_INFORMATION) -> str:
    session_id = store.create_conversation().session_id
    store.set_status(session_id, ConversationStatus.COLLECTING_INFORMATION)
    if status == ConversationStatus.AWAITING_CONFIRMATION:
        add_ready_details(store, session_id)
        store.set_status(session_id, ConversationStatus.AWAITING_CONFIRMATION)
    return session_id


def add_ready_details(store: ConversationStore, session_id: str) -> None:
    store.apply_extracted_information(session_id, ProjectDetails(**READY_TO_SUMMARISE_DETAILS))


def run_turn(pipeline: ConversationPipeline, store: ConversationStore, session_id: str, message: str):
    state = store.get_conversation(session_id)
    decision = pipeline.decide_next_step(state, message)
    return pipeline.apply_decision(store, session_id, decision)


# =========================================================
# PARSING AND VALIDATION
# =========================================================


def test_extract_json_handles_code_fences_and_extra_text():
    raw = 'Sure!\n```json\n{"next_action": "ask_question", "response": "Hi?"}\n```'
    assert extract_json_object(raw)["next_action"] == "ask_question"


def test_extract_json_rejects_non_json():
    with pytest.raises(ValueError):
        extract_json_object("I think you should use React.")


def test_unknown_action_is_rejected():
    with pytest.raises(ValueError):
        ConversationDecision.model_validate_json(decision_json(next_action="delete_all_files"))


def test_unknown_field_names_are_dropped():
    decision = ConversationDecision.model_validate_json(
        decision_json(skipped_fields=["budget", "favourite_colour"], question_topic="password")
    )
    assert decision.skipped_fields == ["budget"]
    assert decision.question_topic is None


def test_loose_model_values_are_normalised():
    decision = ConversationDecision.model_validate_json(
        decision_json(extracted_information={"project_type": "A Hackathon", "preferred_technologies": "Python, React"})
    )
    assert decision.extracted_information.project_type == "hackathon"
    assert decision.extracted_information.preferred_technologies == ["Python", "React"]


def test_invalid_output_is_retried_then_accepted(fakes, store, pipeline):
    session_id = new_session(store)
    fakes.llm.queue("not json at all", decision_json(next_action="nonsense"), decision_json())

    action, _ = run_turn(pipeline, store, session_id, "A health band")

    assert action == ConversationAction.ASK_QUESTION
    assert len(fakes.llm.calls) == 3
    # The retry tells the model what went wrong.
    assert "not valid" in fakes.llm.last_user_prompt()


def test_gives_up_after_limited_retries(fakes, store, pipeline):
    session_id = new_session(store)
    fakes.llm.queue("bad", "bad", "bad")

    with pytest.raises(LanguageModelError):
        run_turn(pipeline, store, session_id, "A health band")

    assert len(fakes.llm.calls) == pipeline.max_attempts
    # State is untouched when the model fails.
    assert store.get_conversation(session_id).project_details.initial_idea is None


def test_ollama_unavailable_raises_language_model_error(fakes, store, pipeline):
    session_id = new_session(store)
    fakes.llm.queue(openai.APIConnectionError(request=None))

    with pytest.raises(LanguageModelError):
        run_turn(pipeline, store, session_id, "Hello")


def test_model_is_asked_for_json_with_timeout(fakes, store, pipeline):
    session_id = new_session(store)
    fakes.llm.queue(decision_json())

    run_turn(pipeline, store, session_id, "Hello")

    call = fakes.llm.calls[0]
    assert call["model"] == "qwen-test"
    assert call["response_format"] == {"type": "json_object"}
    assert call["timeout"] > 0
    # Without this, Ollama silently cuts the start of the prompt.
    assert call["extra_body"]["options"]["num_ctx"] >= 8192


# =========================================================
# EXTRACTION
# =========================================================


def test_process_initial_idea(fakes, store, pipeline):
    session_id = new_session(store)
    fakes.llm.queue(decision_json(extracted_information={"initial_idea": "A wearable health monitor for elderly people"}))

    run_turn(pipeline, store, session_id, "I want to build a wearable health monitor for elderly people")

    assert store.get_conversation(session_id).project_details.initial_idea == "A wearable health monitor for elderly people"
    # The latest message is sent to the model.
    assert "wearable health monitor" in fakes.llm.last_user_prompt()


def test_extract_deadline_and_technologies(fakes, store, pipeline):
    session_id = new_session(store)
    fakes.llm.queue(decision_json(extracted_information={"deadline": "15 March", "preferred_technologies": ["Python"]}))

    run_turn(pipeline, store, session_id, "Deadline is 15 March and I'll use Python")

    details = store.get_conversation(session_id).project_details
    assert details.deadline == "15 March"
    assert details.preferred_technologies == ["Python"]


def test_extract_multiple_details_from_one_answer(fakes, store, pipeline):
    session_id = new_session(store)
    fakes.llm.queue(decision_json(extracted_information={
        "initial_idea": "AI healthcare application",
        "project_type": "hackathon",
        "deadline": "next week",
        "preferred_technologies": ["Python", "React"],
    }))

    run_turn(pipeline, store, session_id, "AI healthcare app for a hackathon next week using Python and React")

    details = store.get_conversation(session_id).project_details
    assert details.initial_idea == "AI healthcare application"
    assert details.project_type == "hackathon"
    assert details.deadline == "next week"
    assert details.preferred_technologies == ["Python", "React"]


def test_correction_replaces_technology(fakes, store, pipeline):
    session_id = new_session(store)
    store.apply_extracted_information(session_id, ProjectDetails(preferred_technologies=["Python", "React"]))
    fakes.llm.queue(decision_json(
        extracted_information={"preferred_technologies": ["Flutter"]},
        removed_information={"preferred_technologies": ["React"]},
    ))

    run_turn(pipeline, store, session_id, "Actually, I want to use Flutter instead of React.")

    conversation = store.get_conversation(session_id)
    assert conversation.project_details.preferred_technologies == ["Python", "Flutter"]
    # One correction is recorded, with the final value.
    assert len(conversation.corrections) == 1
    assert conversation.corrections[0].new_value == ["Python", "Flutter"]


def test_removal_wins_when_model_repeats_the_old_item(fakes, store, pipeline):
    # Seen with the real qwen2.5:7b: it re-sent "React" while removing it.
    session_id = new_session(store)
    store.apply_extracted_information(session_id, ProjectDetails(preferred_technologies=["Python", "React"]))
    fakes.llm.queue(decision_json(
        extracted_information={"preferred_technologies": ["Python", "React", "Flutter"]},
        removed_information={"preferred_technologies": ["react"]},
    ))

    run_turn(pipeline, store, session_id, "Use Flutter instead of React.")

    assert store.get_conversation(session_id).project_details.preferred_technologies == ["Python", "Flutter"]


def test_full_list_correction_from_model_is_ignored(fakes, store, pipeline):
    # Seen with the real model: corrected_information {"preferred_technologies": ["React"]}
    # while the user asked to REMOVE React. Lists change only by add/remove.
    session_id = new_session(store)
    store.apply_extracted_information(session_id, ProjectDetails(preferred_technologies=["Python", "React"]))
    fakes.llm.queue(decision_json(
        extracted_information={"preferred_technologies": ["Flutter"]},
        corrected_information={"preferred_technologies": ["React"]},
        removed_information={"preferred_technologies": ["React"]},
    ))

    run_turn(pipeline, store, session_id, "Flutter instead of React.")

    assert store.get_conversation(session_id).project_details.preferred_technologies == ["Python", "Flutter"]


def test_text_correction_replaces_value(fakes, store, pipeline):
    session_id = new_session(store)
    store.apply_extracted_information(session_id, ProjectDetails(deadline="next week"))
    fakes.llm.queue(decision_json(corrected_information={"deadline": "two weeks"}))

    run_turn(pipeline, store, session_id, "Sorry, the deadline is two weeks, not one.")

    conversation = store.get_conversation(session_id)
    assert conversation.project_details.deadline == "two weeks"
    assert conversation.corrections[0].old_value == "next week"


def test_removal_for_unknown_field_is_dropped():
    decision = ConversationDecision.model_validate_json(
        decision_json(removed_information={"deadline": ["x"], "api_key": ["y"], "constraints": "No cloud"})
    )
    assert decision.removed_information == {"constraints": ["No cloud"]}


# =========================================================
# QUESTIONS
# =========================================================


def test_repeated_question_is_replaced_by_the_summary(fakes, store, pipeline):
    # Seen with the real model: it asked about the same thing again and again.
    session_id = new_session(store)
    add_ready_details(store, session_id)
    store.record_asked_topic(session_id, "budget")
    fakes.llm.queue(decision_json(question_topic="budget", response="What is your budget?"))

    action, response = run_turn(pipeline, store, session_id, "ok")

    # One model call only: a retry costs ~5 s and usually repeats anyway.
    assert len(fakes.llm.calls) == 1
    assert action == ConversationAction.REQUEST_CONFIRMATION
    assert response.startswith("Here's what I've understood so far.")


def test_question_about_known_field_is_replaced_by_the_summary(fakes, store, pipeline):
    session_id = new_session(store)
    add_ready_details(store, session_id)
    fakes.llm.queue(decision_json(question_topic="deadline", response="When is your deadline?"))

    action, response = run_turn(pipeline, store, session_id, "Python only")

    assert action == ConversationAction.REQUEST_CONFIRMATION
    assert "When is your deadline" not in response


def test_clarification_on_an_asked_topic_is_allowed(fakes, store, pipeline):
    session_id = new_session(store)
    store.record_asked_topic(session_id, "deadline")
    fakes.llm.queue(decision_json(
        next_action="request_clarification",
        question_topic="deadline",
        response="Do you mean this Friday or next Friday?",
    ))

    action, response = run_turn(pipeline, store, session_id, "Friday-ish")

    assert action == ConversationAction.REQUEST_CLARIFICATION
    assert response == "Do you mean this Friday or next Friday?"


def test_known_details_are_sent_to_model_so_it_does_not_repeat(fakes, store, pipeline):
    session_id = new_session(store)
    store.apply_extracted_information(session_id, ProjectDetails(deadline="next week"))
    store.record_skipped_fields(session_id, ["budget"])
    fakes.llm.queue(decision_json())

    run_turn(pipeline, store, session_id, "ok")

    prompt = fakes.llm.last_user_prompt()
    assert '"deadline": "next week"' in prompt
    assert 'SKIPPED FIELDS: ["budget"]' in prompt


def test_clarification_for_ambiguous_answer(fakes, store, pipeline):
    session_id = new_session(store)
    fakes.llm.queue(decision_json(
        next_action="request_clarification",
        question_topic="deadline",
        response="Do you mean the hackathon ends this Friday, or next Friday?",
    ))

    action, response = run_turn(pipeline, store, session_id, "It ends Friday-ish")

    assert action == ConversationAction.REQUEST_CLARIFICATION
    assert "Friday" in response
    # Nothing was invented for the deadline.
    assert store.get_conversation(session_id).project_details.deadline is None


def test_skipped_question_is_recorded(fakes, store, pipeline):
    session_id = new_session(store)
    fakes.llm.queue(decision_json(skipped_fields=["budget"]))

    run_turn(pipeline, store, session_id, "I'm not sure about the budget.")

    conversation = store.get_conversation(session_id)
    assert conversation.skipped_fields == ["budget"]
    assert conversation.status == ConversationStatus.COLLECTING_INFORMATION


# =========================================================
# SUMMARY AND CONFIRMATION
# =========================================================


def test_summary_requests_confirmation(fakes, store, pipeline):
    session_id = new_session(store)
    add_ready_details(store, session_id)
    store.record_skipped_fields(session_id, ["budget"])
    fakes.llm.queue(decision_json(
        next_action="summarise",
        ready_for_confirmation=True,
        response="You want to build a rocket for NASA with a million dollars.",
    ))

    action, response = run_turn(pipeline, store, session_id, "That's all")

    assert action == ConversationAction.REQUEST_CONFIRMATION
    # The summary is built from the stored details, not from model text.
    assert response == (
        "Here's what I've understood so far. Your project idea is health band. "
        "It's meant for Elderly people. You're building it for a hackathon, with a deadline of ten days. "
        "You'd like to use Python. You're not sure yet about the budget, and that's fine. "
        "Is everything correct, or would you like to change anything?"
    )
    assert "million" not in response
    assert store.get_conversation(session_id).status == ConversationStatus.AWAITING_CONFIRMATION


def test_confirmation_needs_an_idea_first(fakes, store, pipeline):
    session_id = new_session(store)
    fakes.llm.queue(decision_json(next_action="request_confirmation", response="Is everything correct?"))

    action, response = run_turn(pipeline, store, session_id, "Just summarise")

    assert action == ConversationAction.ASK_QUESTION
    assert response == MISSING_IDEA_RESPONSE
    assert store.get_conversation(session_id).status == ConversationStatus.COLLECTING_INFORMATION


def test_generation_is_rejected_before_confirmation(fakes, store, pipeline):
    session_id = new_session(store)
    add_ready_details(store, session_id)
    fakes.llm.queue(decision_json(next_action="generate_project", response="Generating now!"))

    action, _ = run_turn(pipeline, store, session_id, "Just build it")

    assert action == ConversationAction.REQUEST_CONFIRMATION
    conversation = store.get_conversation(session_id)
    assert conversation.status == ConversationStatus.AWAITING_CONFIRMATION
    assert conversation.confirmed_at is None


def test_spoken_yes_after_summary_marks_ready(fakes, store, pipeline):
    session_id = new_session(store, ConversationStatus.AWAITING_CONFIRMATION)
    # The model asks "Is this correct?" again, which would contradict
    # the generation that starts next. Seen with the real model.
    fakes.llm.queue(decision_json(next_action="generate_project", response="Let me summarise. Is this correct?"))

    action, response = run_turn(pipeline, store, session_id, "Yes, that's correct")

    assert action == ConversationAction.GENERATE_PROJECT
    assert response == GENERATING_RESPONSE
    conversation = store.get_conversation(session_id)
    assert conversation.status == ConversationStatus.READY_TO_GENERATE
    assert conversation.confirmed_at is not None


def test_yes_with_empty_model_response_is_accepted(fakes, store, pipeline):
    # Seen with the real model: {"next_action": "generate_project"} and nothing else.
    session_id = new_session(store, ConversationStatus.AWAITING_CONFIRMATION)
    fakes.llm.queue(json.dumps({"next_action": "generate_project"}))

    action, response = run_turn(pipeline, store, session_id, "Yes, go ahead")

    assert len(fakes.llm.calls) == 1
    assert action == ConversationAction.GENERATE_PROJECT
    assert response == GENERATING_RESPONSE


def test_yes_while_model_repeats_old_details_still_confirms(fakes, store, pipeline):
    # The model often re-sends facts that are already stored. That is
    # not a change, so it must not block the user's "yes".
    session_id = new_session(store, ConversationStatus.AWAITING_CONFIRMATION)
    fakes.llm.queue(decision_json(
        next_action="generate_project",
        extracted_information={"initial_idea": "Health band", "preferred_technologies": ["Python"]},
        corrected_information={"deadline": "ten days"},
    ))

    action, _ = run_turn(pipeline, store, session_id, "Yes")

    assert action == ConversationAction.GENERATE_PROJECT
    assert store.get_conversation(session_id).status == ConversationStatus.READY_TO_GENERATE


def test_correction_during_confirmation_needs_new_summary(fakes, store, pipeline):
    session_id = new_session(store, ConversationStatus.AWAITING_CONFIRMATION)
    fakes.llm.queue(decision_json(
        next_action="generate_project",
        corrected_information={"deadline": "two weeks"},
        response="Okay, two weeks. Generating!",
    ))

    action, _ = run_turn(pipeline, store, session_id, "Yes but the deadline is two weeks")

    assert action == ConversationAction.REQUEST_CONFIRMATION
    conversation = store.get_conversation(session_id)
    assert conversation.status == ConversationStatus.AWAITING_CONFIRMATION
    assert conversation.project_details.deadline == "two weeks"


def test_user_can_cancel_by_voice(fakes, store, pipeline):
    session_id = new_session(store)
    fakes.llm.queue(json.dumps({"next_action": "cancel_conversation"}))

    action, response = run_turn(pipeline, store, session_id, "Stop, I don't want to continue")

    assert action == ConversationAction.CANCEL_CONVERSATION
    assert response == CANCELLED_RESPONSE
    assert store.get_conversation(session_id).status == ConversationStatus.CANCELLED


def test_history_sent_to_model_is_limited(fakes, store, pipeline):
    from services.conversation_manager.conversation_prompts import EXAMPLE_TURNS, HISTORY_MESSAGE_LIMIT
    from services.conversation_manager.schemas import ConversationMessage

    session_id = new_session(store)
    for number in range(30):
        store.add_message(session_id, ConversationMessage(role="user", text=f"message {number}"))
    fakes.llm.queue(decision_json())

    run_turn(pipeline, store, session_id, "latest")

    sent_texts = [message["content"] for message in fakes.llm.calls[0]["messages"]]
    assert "message 29" in sent_texts
    assert "message 0" not in sent_texts
    # system prompt + examples (user + assistant each) + "examples over" + history + latest turn
    assert len(sent_texts) == 1 + 2 * len(EXAMPLE_TURNS) + 1 + HISTORY_MESSAGE_LIMIT + 1


def test_examples_are_valid_decisions():
    # The worked examples teach the model the format, so they must
    # pass the same validation as real replies.
    from services.conversation_manager.conversation_prompts import EXAMPLE_TURNS

    for _, example_decision in EXAMPLE_TURNS:
        ConversationDecision.model_validate(example_decision)


def test_decision_requires_something_to_say():
    with pytest.raises(ValueError):
        ConversationDecision.model_validate({"next_action": "ask_question", "response": "", "next_question": None})

    decision = ConversationDecision.model_validate(
        {"next_action": "ask_question", "response": "", "next_question": "What is the deadline?"}
    )
    assert decision.response == "What is the deadline?"
    assert json.loads(decision.model_dump_json())["next_action"] == "ask_question"


# =========================================================
# ONE-TIME EXTRACTION OF THE THREE FIXED ANSWERS
# =========================================================

QUESTIONS_AND_ANSWERS = [
    ("Tell me about your idea", "A plant disease app for farmers"),
    ("What's your timeline?", "A hackathon this weekend"),
    ("Any technologies?", "Not sure, recommend something"),
]


def test_extraction_reads_all_answers_in_one_call(fakes, pipeline):
    fakes.llm.queue(json.dumps({
        "project_details": {
            "initial_idea": "A plant disease app",
            "target_users": "Farmers",
            "project_type": "Hackathon",
            "deadline": "this weekend",
            "recommendations_requested": ["technologies"],
        },
        "skipped_fields": [],
    }))

    extraction = pipeline.extract_project_details(QUESTIONS_AND_ANSWERS)

    assert len(fakes.llm.calls) == 1
    prompt = fakes.llm.last_user_prompt()
    assert "QUESTION 2: What's your timeline?" in prompt
    assert "ANSWER 3: Not sure, recommend something" in prompt
    details = extraction.project_details
    assert details.project_type == "hackathon"
    assert details.target_users == ["Farmers"]
    assert details.recommendations_requested == ["technologies"]


def test_extraction_is_validated_and_retried(fakes, pipeline):
    fakes.llm.queue("not json", json.dumps({"project_details": {"initial_idea": "Plant app"}}))

    extraction = pipeline.extract_project_details(QUESTIONS_AND_ANSWERS)

    assert len(fakes.llm.calls) == 2
    assert extraction.project_details.initial_idea == "Plant app"


def test_extraction_gives_up_after_limited_retries(fakes, pipeline):
    fakes.llm.queue("bad", "bad", "bad")

    with pytest.raises(LanguageModelError):
        pipeline.extract_project_details(QUESTIONS_AND_ANSWERS)

    assert len(fakes.llm.calls) == pipeline.max_attempts


def test_extraction_cannot_invent_veya_suggestions_or_fields(fakes, pipeline):
    fakes.llm.queue(json.dumps({
        "project_details": {"initial_idea": "Plant app", "veya_recommendations": ["TensorFlow"]},
        "skipped_fields": ["budget", "password"],
    }))

    extraction = pipeline.extract_project_details(QUESTIONS_AND_ANSWERS)

    # VEYA has suggested nothing yet, so this must stay empty.
    assert extraction.project_details.veya_recommendations is None
    # Unknown names are dropped, and budget was never asked about.
    assert extraction.skipped_fields == []


def test_placeholder_values_from_the_model_are_treated_as_unknown(fakes, pipeline):
    # Seen with the real model: "deadline": "Not specified", which VEYA
    # then read aloud as "a deadline of Not specified".
    fakes.llm.queue(json.dumps({
        "project_details": {
            "initial_idea": "Smart bottle",
            "deadline": "Not specified",
            "available_time": "not mentioned.",
            "preferred_technologies": ["Python", "Not specified", ""],
        },
    }))

    details = pipeline.extract_project_details(QUESTIONS_AND_ANSWERS).project_details

    assert details.deadline is None
    assert details.available_time is None
    assert details.preferred_technologies == ["Python"]


def test_only_asked_topics_can_be_skipped(fakes, pipeline):
    # Seen with the real model: it marked budget, hardware, software and
    # team as "not sure" although VEYA never asked about them.
    fakes.llm.queue(json.dumps({
        "project_details": {"initial_idea": "Smart bottle"},
        "skipped_fields": ["budget", "available_hardware", "team_size", "deadline", "preferred_technologies"],
    }))

    extraction = pipeline.extract_project_details(QUESTIONS_AND_ANSWERS)

    assert extraction.skipped_fields == ["deadline", "preferred_technologies"]
