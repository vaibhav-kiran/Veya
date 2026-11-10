"""
ChatService: VEYA's text chat, separate from the voice conversation.

    start  -> open greeting (no fixed questions, no audio)
    message-> Language Layer (to English) -> model decides the next step
              (ChatPipeline) -> state update -> Language Layer (to the
              user's language)
    confirm-> the existing Perception + Reasoning project generation, saved
              like any other project

Chat sessions live in their own ConversationStore, so a chat session can
never be answered through the voice endpoints or the other way around.
Confirm, cancel, image generation and plan limits are inherited from
ConversationService unchanged.
"""

import asyncio
import logging
from typing import Any, Optional

from services.chat_manager.chat_pipeline import ChatPipeline
from services.chat_manager.chat_prompts import CHAT_OPENING_MESSAGE
from services.conversation_manager.conversation_service import MAX_TEXT_ANSWER_LENGTH, ConversationService
from services.conversation_manager.conversation_state import ConversationStore
from services.conversation_manager.errors import EmptyTranscriptError, InvalidConversationStateError
from services.conversation_manager.project_generation import ProjectGenerator
from services.conversation_manager.schemas import (
    ConversationAction,
    ConversationMessage,
    ConversationState,
    ConversationStatus,
)
from services.chat_manager.schemas import ChatTurnResponse
from services.plans import PlanResolver

logger = logging.getLogger(__name__)


class ChatService(ConversationService):

    def __init__(
        self,
        store: ConversationStore,
        language_pipeline: Any,
        chat_pipeline: ChatPipeline,
        project_generator: ProjectGenerator,
        image_generator: Any = None,
        project_repository: Any = None,
        plan_resolver: Optional[PlanResolver] = None,
    ):
        # Chat is text only: no speech-to-text or text-to-speech.
        super().__init__(
            store=store,
            stt_pipeline=None,
            tts_pipeline=None,
            language_pipeline=language_pipeline,
            conversation_pipeline=chat_pipeline,
            project_generator=project_generator,
            image_generator=image_generator,
            project_repository=project_repository,
            plan_resolver=plan_resolver,
        )

    # =====================================================
    # START
    # =====================================================

    async def start_chat(self, preferred_language: str = "English", owner_id: Optional[str] = None) -> ChatTurnResponse:
        state = self.store.create_conversation(preferred_language)
        state.owner_id = owner_id
        state.plan = self.plan_resolver.plan_for(owner_id).value
        self.store.set_status(state.session_id, ConversationStatus.COLLECTING_INFORMATION)
        # No fixed questions: the model leads from the first message.
        self.store.mark_initial_summary_done(state.session_id)

        opening = await self._translate_for_user(CHAT_OPENING_MESSAGE, state.preferred_language)
        self.store.add_message(
            state.session_id,
            ConversationMessage(
                role="assistant",
                text=opening,
                english_text=CHAT_OPENING_MESSAGE,
                language=state.preferred_language,
                message_type="greeting",
            ),
        )
        return self._chat_response(state, opening, ConversationAction.ASK_QUESTION)

    # =====================================================
    # MESSAGE
    # =====================================================

    async def send_message(self, session_id: str, text: str) -> ChatTurnResponse:
        text = (text or "").strip()
        if not text:
            raise EmptyTranscriptError("Please type a message before sending.")
        if len(text) > MAX_TEXT_ANSWER_LENGTH:
            raise InvalidConversationStateError(
                f"Please keep your message under {MAX_TEXT_ANSWER_LENGTH} characters."
            )

        async with self._exclusive_access(session_id):
            self.store.ensure_can_answer(session_id)
            state = self.store.get_conversation(session_id)

            english_text = await self._to_english(text, detected_language=None)
            decision = await asyncio.to_thread(self.conversation_pipeline.decide_next_step, state, english_text)

            # The user may have pressed Cancel while the model was thinking.
            if state.status == ConversationStatus.CANCELLED:
                raise InvalidConversationStateError("This chat was cancelled.")

            self.store.add_message(
                session_id,
                ConversationMessage(role="user", text=text, english_text=english_text, message_type="answer"),
            )

            action, english_reply = self.conversation_pipeline.apply_decision(self.store, session_id, decision)

            reply = await self._translate_for_user(english_reply, state.preferred_language)
            self.store.add_message(
                session_id,
                ConversationMessage(
                    role="assistant",
                    text=reply,
                    english_text=english_reply,
                    language=state.preferred_language,
                    message_type=action.value,
                ),
            )
            return self._chat_response(state, reply, action)

    @staticmethod
    def _chat_response(state: ConversationState, message: str, action: ConversationAction) -> ChatTurnResponse:
        return ChatTurnResponse(
            session_id=state.session_id,
            status=state.status,
            message=message,
            next_action=action,
            project_details=state.project_details,
            skipped_fields=state.skipped_fields,
        )
