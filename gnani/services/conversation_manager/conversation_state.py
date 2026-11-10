"""
Session state management for VEYA conversations.

This is a simple in-memory store. Every conversation has its own
ConversationState object, identified by an unpredictable session ID.

The store is intentionally small so it can later be replaced by a
database-backed version with the same methods.

Note: in-memory state is lost when the server restarts and is not
shared between multiple server processes.
"""

import asyncio
import logging
import secrets
from datetime import timedelta
from typing import Any

from services.conversation_manager.errors import (
    ConversationNotFoundError,
    InvalidConversationStateError,
)
from services.conversation_manager.schemas import (
    LIST_FIELD_NAMES,
    PROJECT_FIELD_NAMES,
    ConversationMessage,
    ConversationState,
    ConversationStatus,
    FieldCorrection,
    FixedAnswer,
    ProjectDetails,
    utc_now,
)

logger = logging.getLogger(__name__)


# Which status changes are allowed. Anything else is a bug or a
# request that arrived at the wrong time (for example an answer after
# the user cancelled).
ALLOWED_TRANSITIONS: dict[ConversationStatus, set[ConversationStatus]] = {
    ConversationStatus.CREATED: {
        ConversationStatus.COLLECTING_INFORMATION,
        ConversationStatus.CANCELLED,
    },
    ConversationStatus.COLLECTING_INFORMATION: {
        ConversationStatus.COLLECTING_INFORMATION,
        ConversationStatus.AWAITING_CONFIRMATION,
        ConversationStatus.CANCELLED,
    },
    ConversationStatus.AWAITING_CONFIRMATION: {
        ConversationStatus.COLLECTING_INFORMATION,
        ConversationStatus.AWAITING_CONFIRMATION,
        ConversationStatus.READY_TO_GENERATE,
        ConversationStatus.CANCELLED,
    },
    ConversationStatus.READY_TO_GENERATE: {
        ConversationStatus.READY_TO_GENERATE,
        ConversationStatus.GENERATING_PROJECT,
        ConversationStatus.COLLECTING_INFORMATION,
        ConversationStatus.AWAITING_CONFIRMATION,
        ConversationStatus.CANCELLED,
    },
    ConversationStatus.GENERATING_PROJECT: {
        ConversationStatus.COMPLETED,
        ConversationStatus.ERROR,
        ConversationStatus.CANCELLED,
    },
    ConversationStatus.ERROR: {
        # After a failed generation the user can retry or keep talking.
        ConversationStatus.GENERATING_PROJECT,
        ConversationStatus.COLLECTING_INFORMATION,
        ConversationStatus.AWAITING_CONFIRMATION,
        ConversationStatus.CANCELLED,
    },
    ConversationStatus.COMPLETED: set(),
    ConversationStatus.CANCELLED: set(),
}

# Statuses in which the user can still send answers.
ANSWERABLE_STATUSES = {
    ConversationStatus.COLLECTING_INFORMATION,
    ConversationStatus.AWAITING_CONFIRMATION,
    ConversationStatus.READY_TO_GENERATE,
    ConversationStatus.ERROR,
}


class ConversationStore:
    """Keeps every conversation separate, keyed by session ID."""

    def __init__(self, session_lifetime: timedelta = timedelta(hours=2)):
        self.session_lifetime = session_lifetime
        self._conversations: dict[str, ConversationState] = {}
        # One lock per session prevents two requests from changing the
        # same conversation at the same time (for example a double click).
        self._locks: dict[str, asyncio.Lock] = {}

    # -----------------------------------------------------
    # CREATE / READ / DELETE
    # -----------------------------------------------------

    def create_conversation(self, preferred_language: str = "English") -> ConversationState:
        self.remove_expired_conversations()

        # 32 random bytes -> about 43 URL-safe characters.
        session_id = secrets.token_urlsafe(32)

        conversation = ConversationState(
            session_id=session_id,
            preferred_language=preferred_language,
        )

        self._conversations[session_id] = conversation
        self._locks[session_id] = asyncio.Lock()

        logger.info("Created conversation %s...", session_id[:8])
        return conversation

    def get_conversation(self, session_id: str) -> ConversationState:
        conversation = self._conversations.get(session_id)

        if conversation is None:
            raise ConversationNotFoundError()

        if self._is_expired(conversation):
            self.delete_conversation(session_id)
            raise ConversationNotFoundError()

        return conversation

    def delete_conversation(self, session_id: str) -> None:
        self._conversations.pop(session_id, None)
        self._locks.pop(session_id, None)

    def get_lock(self, session_id: str) -> asyncio.Lock:
        # get_conversation raises if the session does not exist.
        self.get_conversation(session_id)
        return self._locks[session_id]

    def remove_expired_conversations(self) -> None:
        expired_ids = [
            session_id
            for session_id, conversation in self._conversations.items()
            if self._is_expired(conversation)
        ]
        for session_id in expired_ids:
            logger.info("Removing expired conversation %s...", session_id[:8])
            self.delete_conversation(session_id)

    def _is_expired(self, conversation: ConversationState) -> bool:
        return utc_now() - conversation.updated_at > self.session_lifetime

    # -----------------------------------------------------
    # STATUS
    # -----------------------------------------------------

    def set_status(self, session_id: str, new_status: ConversationStatus) -> ConversationState:
        conversation = self.get_conversation(session_id)

        allowed = ALLOWED_TRANSITIONS[conversation.status]
        if new_status not in allowed:
            raise InvalidConversationStateError(
                f"Cannot move from '{conversation.status.value}' to '{new_status.value}'."
            )

        conversation.status = new_status
        self._touch(conversation)
        return conversation

    def ensure_can_answer(self, session_id: str) -> ConversationState:
        conversation = self.get_conversation(session_id)

        if conversation.status not in ANSWERABLE_STATUSES:
            raise InvalidConversationStateError(
                f"This conversation is '{conversation.status.value}' and cannot accept new answers."
            )

        return conversation

    def mark_confirmed(self, session_id: str) -> ConversationState:
        conversation = self.get_conversation(session_id)
        conversation.confirmed_at = utc_now()
        self._touch(conversation)
        return conversation

    def cancel_conversation(self, session_id: str) -> ConversationState:
        conversation = self.get_conversation(session_id)

        if conversation.status == ConversationStatus.CANCELLED:
            return conversation

        if conversation.status == ConversationStatus.COMPLETED:
            raise InvalidConversationStateError("A completed conversation cannot be cancelled.")

        return self.set_status(session_id, ConversationStatus.CANCELLED)

    # -----------------------------------------------------
    # MESSAGES
    # -----------------------------------------------------

    def add_message(self, session_id: str, message: ConversationMessage) -> ConversationState:
        conversation = self.get_conversation(session_id)
        conversation.messages.append(message)
        self._touch(conversation)
        return conversation

    def add_fixed_answer(self, session_id: str, answer: FixedAnswer) -> ConversationState:
        conversation = self.get_conversation(session_id)
        conversation.fixed_answers.append(answer)
        self._touch(conversation)
        return conversation

    def mark_initial_summary_done(self, session_id: str) -> ConversationState:
        conversation = self.get_conversation(session_id)
        conversation.initial_summary_done = True
        self._touch(conversation)
        return conversation

    def record_asked_topic(self, session_id: str, topic: str | None) -> None:
        if not topic:
            return
        conversation = self.get_conversation(session_id)
        if topic not in conversation.asked_topics:
            conversation.asked_topics.append(topic)

    # -----------------------------------------------------
    # PROJECT DETAILS
    # -----------------------------------------------------

    def apply_extracted_information(self, session_id: str, new_details: ProjectDetails) -> ConversationState:
        """
        Merge newly mentioned facts into the collected details.

        - Text fields are filled only when they are still empty.
          (Changing an existing value is a correction, see below.)
        - List fields gain the new items, without duplicates.
        """

        conversation = self.get_conversation(session_id)
        current = conversation.project_details

        for field_name, new_value in new_details.model_dump(exclude_none=True).items():
            old_value = getattr(current, field_name)

            if isinstance(new_value, list):
                merged = list(old_value or [])
                existing_lower = {item.lower() for item in merged}
                for item in new_value:
                    if item.lower() not in existing_lower:
                        merged.append(item)
                        existing_lower.add(item.lower())
                setattr(current, field_name, merged)

            elif old_value is None:
                setattr(current, field_name, new_value)

            self._unskip(conversation, field_name)

        self._touch(conversation)
        return conversation

    def apply_corrections(self, session_id: str, corrected_details: ProjectDetails) -> ConversationState:
        """
        Replace earlier text values with corrected ones, for example
        "the deadline is two weeks, not one".

        List fields are ignored here. Testing with the local Qwen model
        showed that it rarely rewrites a whole list correctly (it drops
        or re-adds items), so list changes use remove_list_items instead.
        """

        conversation = self.get_conversation(session_id)
        current = conversation.project_details

        for field_name, new_value in corrected_details.model_dump(exclude_none=True).items():
            if field_name in LIST_FIELD_NAMES:
                logger.info("Ignoring full-list correction for '%s'; removals are used instead.", field_name)
                continue

            if getattr(current, field_name) == new_value:
                continue

            setattr(current, field_name, new_value)
            self._unskip(conversation, field_name)

        self._touch(conversation)
        return conversation

    def remove_list_items(self, session_id: str, removals: dict[str, list[str]]) -> ConversationState:
        """
        Remove items the user no longer wants from list fields.

        For "Flutter instead of React", React is removed here and Flutter
        is added by apply_extracted_information. Matching ignores case.
        """

        conversation = self.get_conversation(session_id)
        current = conversation.project_details

        for field_name, items_to_remove in removals.items():
            old_list = getattr(current, field_name) or []
            remove_lower = {item.lower() for item in items_to_remove}
            setattr(current, field_name, [item for item in old_list if item.lower() not in remove_lower])

        self._touch(conversation)
        return conversation

    def apply_turn_updates(
        self,
        session_id: str,
        extracted: ProjectDetails,
        corrected: ProjectDetails,
        removed: dict[str, list[str]],
        skipped: list[str],
    ) -> bool:
        """
        Apply everything the user said in one turn.

        Order matters: removals come LAST. The model often repeats old
        facts in extracted_information (for example "React" again while
        also removing it), and the removal must win so that "Flutter
        instead of React" ends with Flutter and without React.

        Returns True when at least one project detail really changed.
        Repeated facts are not counted as changes.
        """

        conversation = self.get_conversation(session_id)
        details_before = conversation.project_details.model_copy(deep=True)

        self.apply_extracted_information(session_id, extracted)
        self.apply_corrections(session_id, corrected)
        self.remove_list_items(session_id, removed)
        self.record_skipped_fields(session_id, skipped)

        self._record_corrections(conversation, details_before)

        return conversation.project_details != details_before

    def record_skipped_fields(self, session_id: str, field_names: list[str]) -> ConversationState:
        """Remember fields the user is unsure about, so VEYA doesn't ask again."""

        conversation = self.get_conversation(session_id)
        details = conversation.project_details

        for field_name in field_names:
            # Only skip fields that really have no value yet.
            if getattr(details, field_name) not in (None, []):
                continue
            if field_name not in conversation.skipped_fields:
                conversation.skipped_fields.append(field_name)

        self._touch(conversation)
        return conversation

    # -----------------------------------------------------
    # HELPERS
    # -----------------------------------------------------

    @staticmethod
    def _record_corrections(conversation: ConversationState, details_before: ProjectDetails) -> None:
        """
        Remember every earlier answer the user changed in this turn.

        A correction is a text value that was replaced, or a list that
        lost at least one item. Simply adding a new item is not a
        correction. The final value is stored, so the project brief
        never shows a half-finished intermediate value.
        """

        details_after = conversation.project_details

        for field_name in PROJECT_FIELD_NAMES:
            old_value = getattr(details_before, field_name)
            new_value = getattr(details_after, field_name)

            if old_value in (None, []) or old_value == new_value:
                continue

            if isinstance(old_value, list):
                new_lower = {item.lower() for item in new_value or []}
                something_removed = any(item.lower() not in new_lower for item in old_value)
                if not something_removed:
                    continue

            conversation.corrections.append(
                FieldCorrection(field_name=field_name, old_value=old_value, new_value=new_value)
            )
            logger.info("Corrected field '%s' in conversation %s...", field_name, conversation.session_id[:8])

    @staticmethod
    def _unskip(conversation: ConversationState, field_name: str) -> None:
        """If the user later answers a skipped question, it is no longer skipped."""

        if field_name in conversation.skipped_fields:
            conversation.skipped_fields.remove(field_name)

    @staticmethod
    def _touch(conversation: ConversationState) -> None:
        conversation.updated_at = utc_now()


def details_for_display(details: ProjectDetails) -> dict[str, Any]:
    """Only the fields that have values, for prompts and summaries."""

    return {
        name: value
        for name, value in details.model_dump(exclude_none=True).items()
        if value != []
    }
