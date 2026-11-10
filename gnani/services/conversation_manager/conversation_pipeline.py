"""
The Qwen-powered part of the conversation.

1. extract_project_details(): after VEYA's three fixed questions, ONE Qwen
   call turns all three answers into project details.

2. decide_next_step() + apply_decision(): after the summary, each answer
   (a correction, "yes", or a question) is understood by Qwen, and the
   code decides which status changes are allowed. For example the model
   can never start project generation before the user agreed to a summary.

Every model reply is parsed and validated with Pydantic, with a small
number of retries when the model returns something invalid.
"""

import json
import logging
import re
from typing import Any, TypeVar

import openai
from pydantic import BaseModel, ValidationError

from services.conversation_manager.conversation_prompts import (
    EXTRACTION_EXAMPLE_ANSWERS,
    build_extraction_messages,
    build_invalid_output_feedback,
    build_messages,
)
from services.conversation_manager.conversation_state import ConversationStore
from services.conversation_manager.conversation_summary import build_confirmation_summary
from services.conversation_manager.errors import LanguageModelError
from services.conversation_manager.schemas import (
    REQUIRED_FIELDS,
    AnswerExtraction,
    ConversationAction,
    ConversationDecision,
    ConversationState,
    ConversationStatus,
)

# Any Pydantic model class; used so _ask_model_for() returns the right type.
ModelClass = TypeVar("ModelClass", bound=BaseModel)

logger = logging.getLogger(__name__)

# Actions that ask the user something and keep collecting information.
QUESTION_ACTIONS = {
    ConversationAction.ASK_QUESTION,
    ConversationAction.REQUEST_CLARIFICATION,
}

# Actions that mean "here is the summary, please confirm".
CONFIRMATION_ACTIONS = {
    ConversationAction.SUMMARISE,
    ConversationAction.REQUEST_CONFIRMATION,
}

# Statuses in which the user has already been shown a summary.
SUMMARY_SHOWN_STATUSES = {
    ConversationStatus.AWAITING_CONFIRMATION,
    ConversationStatus.READY_TO_GENERATE,
}

# Context window (in tokens) requested from Ollama for every turn.
OLLAMA_CONTEXT_WINDOW = 8192

MISSING_IDEA_RESPONSE = (
    "Before I summarise, could you tell me a little more about the idea itself? "
    "What would you like to build?"
)

# Said when the user agrees to the summary. Written by code so the
# spoken text always matches what happens next (generation starts).
GENERATING_RESPONSE = "Great! I'm building your project plan now. This can take a few minutes."

# Said when the user stops the conversation and the model gave no reply.
CANCELLED_RESPONSE = "No problem. I've stopped this conversation. You can start a new one any time."


def extract_json_object(raw_text: str) -> dict[str, Any]:
    """
    Pull the JSON object out of the model's reply.

    Handles ```json code fences and short text around the object.
    Raises ValueError when no valid JSON object can be found.
    """

    if not raw_text or not raw_text.strip():
        raise ValueError("The model returned an empty reply.")

    text = raw_text.strip()

    # Remove Markdown code fences such as ```json ... ```
    fence_match = re.search(r"```(?:json)?\s*(.*?)```", text, re.DOTALL)
    if fence_match:
        text = fence_match.group(1).strip()

    first_brace = text.find("{")
    last_brace = text.rfind("}")
    if first_brace == -1 or last_brace <= first_brace:
        raise ValueError("The reply does not contain a JSON object.")

    try:
        parsed = json.loads(text[first_brace : last_brace + 1])
    except json.JSONDecodeError as error:
        raise ValueError(f"The reply is not valid JSON: {error}") from error

    if not isinstance(parsed, dict):
        raise ValueError("The reply must be a JSON object.")

    return parsed


class ConversationPipeline:
    """Talks to Qwen through the existing OpenAI-compatible Ollama client."""

    def __init__(
        self,
        llm_client: Any,
        model_name: str,
        max_attempts: int = 3,
        request_timeout_seconds: float = 90.0,
    ):
        if not model_name:
            raise ValueError("The Qwen model name is missing. Check OLLAMA_MODEL in .env.")

        self.llm_client = llm_client
        self.model_name = model_name
        self.max_attempts = max_attempts
        self.request_timeout_seconds = request_timeout_seconds

    # =====================================================
    # 1. ASK QWEN
    # =====================================================

    def extract_project_details(self, questions_and_answers: list[tuple[str, str]]) -> AnswerExtraction:
        """
        Read the answers to the three fixed questions in ONE Qwen call.

        questions_and_answers: (question, answer in English) pairs.
        This is a blocking call. Run it in a thread from async code.
        """

        return self._ask_model_for(build_extraction_messages(questions_and_answers), AnswerExtraction)

    def decide_next_step(self, state: ConversationState, user_message_english: str) -> ConversationDecision:
        """
        Ask Qwen to understand the latest message and choose the next step.
        Used after the first summary (corrections, "yes", questions).

        This is a blocking call. Run it in a thread from async code.
        """

        return self._ask_model_for(build_messages(state, user_message_english), ConversationDecision)

    def _ask_model_for(self, messages: list[dict[str, str]], model_class: type[ModelClass]) -> ModelClass:
        """
        Call Qwen and validate its JSON reply with the given Pydantic model.

        Only INVALID replies are retried, at most max_attempts times in total.
        """

        last_problem = "unknown problem"

        for attempt in range(1, self.max_attempts + 1):
            raw_reply = self._call_model(messages)

            try:
                return model_class.model_validate(extract_json_object(raw_reply))
            except (ValueError, ValidationError) as error:
                last_problem = str(error)
                logger.warning("Invalid %s from Qwen (attempt %d): %s", model_class.__name__, attempt, last_problem[:300])
                messages = messages + [
                    {"role": "assistant", "content": raw_reply or ""},
                    {"role": "user", "content": build_invalid_output_feedback(last_problem)},
                ]

        raise LanguageModelError(
            "VEYA couldn't understand the model's reply. Please try again."
        ) from RuntimeError(last_problem)

    def warm_up(self) -> None:
        """
        Send one tiny request when the server starts.

        This loads Qwen into memory and lets Ollama cache the fixed start
        of the extraction prompt (instructions + example), which is the
        first Qwen call of every conversation. Blocking; failures are only
        logged.
        """

        try:
            self.llm_client.chat.completions.create(
                model=self.model_name,
                messages=build_extraction_messages(EXTRACTION_EXAMPLE_ANSWERS),
                max_tokens=1,
                timeout=self.request_timeout_seconds,
                extra_body={"options": {"num_ctx": OLLAMA_CONTEXT_WINDOW}},
            )
            logger.info("Qwen warm-up finished.")
        except Exception as error:
            logger.warning("Qwen warm-up failed (%s). The first answer may be slower.", type(error).__name__)

    def _call_model(self, messages: list[dict[str, str]]) -> str:
        try:
            response = self.llm_client.chat.completions.create(
                model=self.model_name,
                messages=messages,
                response_format={"type": "json_object"},
                temperature=0.2,
                # A normal decision is about 150 tokens. The cap stops a
                # runaway reply from taking a minute.
                max_tokens=600,
                timeout=self.request_timeout_seconds,
                # Ollama's default context window is small and silently
                # cuts off the start of the prompt (the instructions).
                # The Language and Reasoning layers pass the same option.
                extra_body={"options": {"num_ctx": OLLAMA_CONTEXT_WINDOW}},
            )
        except (openai.APIConnectionError, openai.APITimeoutError) as error:
            logger.error("Could not reach the Qwen model: %s", type(error).__name__)
            raise LanguageModelError() from error
        except openai.APIStatusError as error:
            logger.error("Qwen model returned HTTP %s", error.status_code)
            raise LanguageModelError() from error

        if not response.choices:
            return ""

        return response.choices[0].message.content or ""

    @staticmethod
    def _find_repeated_question_topic(state: ConversationState, decision: ConversationDecision) -> str | None:
        """
        Return the topic if the model asks about something that is already
        answered, skipped, or was asked before.

        Clarification questions (request_clarification) are allowed, so
        VEYA can still follow up on an unclear answer.
        """

        if decision.next_action != ConversationAction.ASK_QUESTION:
            return None

        topic = decision.question_topic
        if not topic:
            return None

        already_known = getattr(state.project_details, topic) not in (None, [])
        answered_now = (
            getattr(decision.extracted_information, topic) is not None
            or getattr(decision.corrected_information, topic) is not None
        )
        skipped = topic in state.skipped_fields or topic in decision.skipped_fields
        asked_before = topic in state.asked_topics

        if already_known or answered_now or skipped or asked_before:
            return topic

        return None

    # =====================================================
    # 2. APPLY THE DECISION
    # =====================================================

    def apply_decision(
        self,
        store: ConversationStore,
        session_id: str,
        decision: ConversationDecision,
    ) -> tuple[ConversationAction, str]:
        """
        Save the extracted information and move the conversation forward.

        Returns the action that was actually taken and the text VEYA
        should say. These can differ from what the model proposed when a
        rule overrides it.
        """

        state = store.get_conversation(session_id)
        status_before = state.status

        changed_details_this_turn = store.apply_turn_updates(
            session_id,
            extracted=decision.extracted_information,
            corrected=decision.corrected_information,
            removed=decision.removed_information,
            skipped=decision.skipped_fields,
        )

        action = decision.next_action
        response_text = decision.response

        # The model may set the flag without choosing the matching action.
        if decision.ready_for_confirmation and action in (
            ConversationAction.UPDATE_INFORMATION,
            ConversationAction.PROVIDE_GUIDANCE,
        ):
            action = ConversationAction.REQUEST_CONFIRMATION

        # ---- the model repeated a question ----
        # Do not trust its question: read the summary again instead, so the
        # user can confirm or correct it.
        if self._find_repeated_question_topic(state, decision):
            logger.info("Replacing a repeated question with the summary.")
            action = ConversationAction.REQUEST_CONFIRMATION

        # ---- user wants to stop ----
        if action == ConversationAction.CANCEL_CONVERSATION:
            store.cancel_conversation(session_id)
            return action, response_text or CANCELLED_RESPONSE

        # ---- user agreed to the summary ----
        if action == ConversationAction.GENERATE_PROJECT:
            if status_before in SUMMARY_SHOWN_STATUSES and not changed_details_this_turn:
                store.set_status(session_id, ConversationStatus.READY_TO_GENERATE)
                store.mark_confirmed(session_id)
                return action, GENERATING_RESPONSE

            # Never generate before the user has confirmed a summary
            # of the latest details. Summarise instead.
            logger.info("Model wanted to generate before confirmation. Asking for confirmation instead.")
            action = ConversationAction.REQUEST_CONFIRMATION

        # ---- summary and confirmation request ----
        if action in CONFIRMATION_ACTIONS:
            if not self._has_required_fields(state):
                store.set_status(session_id, ConversationStatus.COLLECTING_INFORMATION)
                store.record_asked_topic(session_id, "initial_idea")
                return ConversationAction.ASK_QUESTION, MISSING_IDEA_RESPONSE

            # The summary is built from the stored details, so it is
            # accurate and matches the summary shown on screen.
            store.set_status(session_id, ConversationStatus.AWAITING_CONFIRMATION)
            return ConversationAction.REQUEST_CONFIRMATION, build_confirmation_summary(state)

        # Remember what VEYA asked about, so it is not asked again.
        store.record_asked_topic(session_id, decision.question_topic)

        # ---- questions ----
        if action in QUESTION_ACTIONS:
            store.set_status(session_id, ConversationStatus.COLLECTING_INFORMATION)
            return action, response_text

        # ---- guidance or a simple update ----
        # Keep a pending confirmation open so the Confirm button stays usable.
        if status_before in SUMMARY_SHOWN_STATUSES and not changed_details_this_turn:
            store.set_status(session_id, ConversationStatus.AWAITING_CONFIRMATION)
        else:
            store.set_status(session_id, ConversationStatus.COLLECTING_INFORMATION)

        return action, response_text

    @staticmethod
    def _has_required_fields(state: ConversationState) -> bool:
        return all(
            getattr(state.project_details, field_name) not in (None, [])
            for field_name in REQUIRED_FIELDS
        )
