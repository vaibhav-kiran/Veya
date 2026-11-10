from datetime import timedelta

import pytest

from services.conversation_manager.conversation_state import ConversationStore
from services.conversation_manager.errors import (
    ConversationNotFoundError,
    InvalidConversationStateError,
)
from services.conversation_manager.schemas import (
    ConversationMessage,
    ConversationStatus,
    ProjectDetails,
)


def test_create_conversation_gives_unpredictable_unique_ids(store: ConversationStore):
    first = store.create_conversation()
    second = store.create_conversation()

    assert first.session_id != second.session_id
    assert len(first.session_id) >= 40
    assert first.status == ConversationStatus.CREATED


def test_retrieve_conversation(store: ConversationStore):
    created = store.create_conversation("Hindi")

    retrieved = store.get_conversation(created.session_id)

    assert retrieved is created
    assert retrieved.preferred_language == "Hindi"


def test_missing_conversation_raises(store: ConversationStore):
    with pytest.raises(ConversationNotFoundError):
        store.get_conversation("does-not-exist-000000000000")


def test_expired_conversation_is_removed():
    short_lived_store = ConversationStore(session_lifetime=timedelta(seconds=-1))
    conversation = short_lived_store.create_conversation()

    with pytest.raises(ConversationNotFoundError):
        short_lived_store.get_conversation(conversation.session_id)


def test_update_project_details_merges_lists_without_duplicates(store: ConversationStore):
    session_id = store.create_conversation().session_id

    store.apply_extracted_information(
        session_id, ProjectDetails(initial_idea="Health band", preferred_technologies=["Python"])
    )
    store.apply_extracted_information(
        session_id, ProjectDetails(initial_idea="Something else", preferred_technologies=["python", "ESP32"])
    )

    details = store.get_conversation(session_id).project_details
    # Existing text is not silently overwritten by an extraction.
    assert details.initial_idea == "Health band"
    assert details.preferred_technologies == ["Python", "ESP32"]


def test_add_messages(store: ConversationStore):
    session_id = store.create_conversation().session_id

    store.add_message(session_id, ConversationMessage(role="assistant", text="Hi"))
    store.add_message(session_id, ConversationMessage(role="user", text="Hello", language="en-IN"))

    conversation = store.get_conversation(session_id)
    assert [message.role for message in conversation.messages] == ["assistant", "user"]
    assert conversation.user_turn_count() == 1


def test_correction_replaces_previous_value_and_is_recorded(store: ConversationStore):
    session_id = store.create_conversation().session_id
    store.apply_extracted_information(session_id, ProjectDetails(preferred_technologies=["Python", "React"]))

    changed = store.apply_turn_updates(
        session_id,
        extracted=ProjectDetails(preferred_technologies=["Flutter"]),
        corrected=ProjectDetails(),
        removed={"preferred_technologies": ["React"]},
        skipped=[],
    )

    conversation = store.get_conversation(session_id)
    assert changed is True
    assert conversation.project_details.preferred_technologies == ["Python", "Flutter"]
    assert conversation.corrections[0].field_name == "preferred_technologies"
    assert conversation.corrections[0].old_value == ["Python", "React"]
    assert conversation.corrections[0].new_value == ["Python", "Flutter"]


def test_adding_items_is_not_a_correction(store: ConversationStore):
    session_id = store.create_conversation().session_id
    store.apply_extracted_information(session_id, ProjectDetails(preferred_technologies=["Python"]))

    changed = store.apply_turn_updates(
        session_id,
        extracted=ProjectDetails(preferred_technologies=["React"]),
        corrected=ProjectDetails(),
        removed={},
        skipped=[],
    )

    assert changed is True
    assert store.get_conversation(session_id).corrections == []


def test_repeated_facts_are_not_a_change(store: ConversationStore):
    session_id = store.create_conversation().session_id
    store.apply_extracted_information(session_id, ProjectDetails(initial_idea="Health band", deadline="May"))

    changed = store.apply_turn_updates(
        session_id,
        extracted=ProjectDetails(initial_idea="Health band"),
        corrected=ProjectDetails(deadline="May"),
        removed={},
        skipped=[],
    )

    assert changed is False


def test_extracted_text_never_overwrites_silently(store: ConversationStore):
    # Changing a text answer must come through corrected_information.
    session_id = store.create_conversation().session_id
    store.apply_extracted_information(session_id, ProjectDetails(deadline="May"))

    store.apply_extracted_information(session_id, ProjectDetails(deadline="June"))

    assert store.get_conversation(session_id).project_details.deadline == "May"


def test_skip_question_and_unskip_when_answered_later(store: ConversationStore):
    session_id = store.create_conversation().session_id

    store.record_skipped_fields(session_id, ["budget"])
    conversation = store.get_conversation(session_id)
    assert conversation.skipped_fields == ["budget"]
    assert "budget" not in conversation.unknown_fields()

    store.apply_extracted_information(session_id, ProjectDetails(budget="5000 rupees"))
    assert conversation.skipped_fields == []
    assert conversation.project_details.budget == "5000 rupees"


def test_fields_with_values_cannot_be_skipped(store: ConversationStore):
    session_id = store.create_conversation().session_id
    store.apply_extracted_information(session_id, ProjectDetails(deadline="next week"))

    store.record_skipped_fields(session_id, ["deadline"])

    assert store.get_conversation(session_id).skipped_fields == []


def test_cancel_conversation_blocks_new_answers(store: ConversationStore):
    session_id = store.create_conversation().session_id
    store.set_status(session_id, ConversationStatus.COLLECTING_INFORMATION)

    store.cancel_conversation(session_id)

    assert store.get_conversation(session_id).status == ConversationStatus.CANCELLED
    with pytest.raises(InvalidConversationStateError):
        store.ensure_can_answer(session_id)


def test_invalid_status_transition_is_rejected(store: ConversationStore):
    session_id = store.create_conversation().session_id
    store.set_status(session_id, ConversationStatus.COLLECTING_INFORMATION)

    with pytest.raises(InvalidConversationStateError):
        store.set_status(session_id, ConversationStatus.GENERATING_PROJECT)


def test_mark_confirmed(store: ConversationStore):
    session_id = store.create_conversation().session_id

    store.mark_confirmed(session_id)

    assert store.get_conversation(session_id).confirmed_at is not None


def test_sessions_are_isolated(store: ConversationStore):
    first_id = store.create_conversation().session_id
    second_id = store.create_conversation().session_id

    store.apply_extracted_information(first_id, ProjectDetails(initial_idea="Plant disease detector"))
    store.add_message(first_id, ConversationMessage(role="user", text="secret idea"))
    store.cancel_conversation(first_id)

    second = store.get_conversation(second_id)
    assert second.project_details.initial_idea is None
    assert second.messages == []
    assert second.status == ConversationStatus.CREATED
