"""Conversations survive a server restart (saved to SQLite)."""

import asyncio
import sqlite3
from datetime import timedelta

import pytest

from services.conversation_manager.conversation_service import ConversationService
from services.conversation_manager.conversation_state import (
    RESTARTED_DURING_GENERATION,
    ConversationStore,
)
from services.conversation_manager.errors import ConversationNotFoundError
from services.conversation_manager.project_generation import ProjectGenerator
from services.conversation_manager.schemas import ConversationStatus, utc_now
from services.conversation_manager.session_repository import SessionRepository
from tests.test_conversation_api import FIXED_ANSWERS, extraction_json


@pytest.fixture
def database(tmp_path):
    return tmp_path / "veya.db"


def make_service(database, fakes, pipeline, project_repository, kind="voice") -> ConversationService:
    """A fresh service, as after a server restart: nothing in memory, same database file."""

    return ConversationService(
        store=ConversationStore(repository=SessionRepository(database, kind=kind)),
        stt_pipeline=fakes.stt,
        tts_pipeline=fakes.tts,
        language_pipeline=fakes.language,
        conversation_pipeline=pipeline,
        project_generator=ProjectGenerator(
            perception_pipeline=fakes.perception,
            reasoning_pipeline=fakes.reasoning,
            diagram_generator=fakes.diagram,
        ),
        image_generator=fakes.image,
        project_repository=project_repository,
    )


def test_conversation_continues_after_a_restart(database, fakes, pipeline, project_repository):
    before = make_service(database, fakes, pipeline, project_repository)

    async def first_server():
        turn = await before.start_conversation("Hindi", owner_id="user-1")
        await before.respond_with_text(turn.session_id, FIXED_ANSWERS[0])
        await before.respond_with_text(turn.session_id, FIXED_ANSWERS[1])
        return turn.session_id

    session_id = asyncio.run(first_server())

    after = make_service(database, fakes, pipeline, project_repository)

    async def second_server():
        return await after.respond_with_text(session_id, FIXED_ANSWERS[2])

    reply = asyncio.run(second_server())
    state = after.store.get_conversation(session_id)

    # The third answer completed the questions that were answered before the restart.
    assert reply.summary_pending is True
    assert [answer.answer for answer in state.fixed_answers] == FIXED_ANSWERS
    assert state.preferred_language == "Hindi"
    # Internal fields that the API hides are kept too.
    assert state.owner_id == "user-1"
    assert len(state.fixed_questions) == 3
    assert [message.role for message in state.messages] == ["assistant", "user", "assistant", "user", "assistant", "user", "assistant"]


def test_summary_and_confirmation_work_after_a_restart(database, fakes, pipeline, project_repository):
    before = make_service(database, fakes, pipeline, project_repository)

    async def first_server():
        turn = await before.start_conversation("English", owner_id="user-1")
        for answer in FIXED_ANSWERS:
            await before.respond_with_text(turn.session_id, answer)
        return turn.session_id

    session_id = asyncio.run(first_server())
    fakes.llm.queue(extraction_json({"initial_idea": "A wearable health monitor"}))

    after = make_service(database, fakes, pipeline, project_repository)
    summary = asyncio.run(after.create_summary(session_id))
    confirmed = asyncio.run(after.confirm_and_generate(session_id))

    assert summary.status == ConversationStatus.AWAITING_CONFIRMATION
    assert confirmed.status == ConversationStatus.COMPLETED
    # The project is saved for the right user, read from the restored session.
    assert project_repository.get("user-1", confirmed.project_id).title


def test_restart_during_generation_lets_the_user_retry(database, fakes, pipeline, project_repository):
    before = make_service(database, fakes, pipeline, project_repository)

    async def first_server():
        turn = await before.start_conversation("English")
        for answer in FIXED_ANSWERS:
            await before.respond_with_text(turn.session_id, answer)
        fakes.llm.queue(extraction_json({"initial_idea": "A wearable health monitor"}))
        await before.create_summary(turn.session_id)
        # The server dies while the project is being generated.
        before.store.mark_confirmed(turn.session_id)
        before.store.set_status(turn.session_id, ConversationStatus.READY_TO_GENERATE)
        before.store.set_status(turn.session_id, ConversationStatus.GENERATING_PROJECT)
        return turn.session_id

    session_id = asyncio.run(first_server())

    after = make_service(database, fakes, pipeline, project_repository)
    view = after.get_conversation_view(session_id)

    assert view.status == ConversationStatus.ERROR
    assert view.last_error == RESTARTED_DURING_GENERATION
    retried = asyncio.run(after.confirm_and_generate(session_id))
    assert retried.status == ConversationStatus.COMPLETED


def test_voice_and_chat_sessions_stay_apart(database, fakes, pipeline, project_repository):
    voice = make_service(database, fakes, pipeline, project_repository, kind="voice")
    session_id = asyncio.run(voice.start_conversation("English")).session_id

    chat_store = ConversationStore(repository=SessionRepository(database, kind="chat"))

    with pytest.raises(ConversationNotFoundError):
        chat_store.get_conversation(session_id)


def test_expired_sessions_are_removed_from_the_database(database):
    store = ConversationStore(session_lifetime=timedelta(hours=2), repository=SessionRepository(database, kind="voice"))
    old = store.create_conversation()
    old.updated_at = utc_now() - timedelta(hours=3)
    store.save(old)

    # Restart, then any new conversation triggers the clean-up.
    restarted = ConversationStore(session_lifetime=timedelta(hours=2), repository=SessionRepository(database, kind="voice"))
    restarted.create_conversation()

    with pytest.raises(ConversationNotFoundError):
        restarted.get_conversation(old.session_id)
    rows = sqlite3.connect(database).execute("SELECT COUNT(*) FROM conversation_sessions").fetchone()[0]
    assert rows == 1


def test_unreadable_saved_session_counts_as_expired(database):
    store = ConversationStore(repository=SessionRepository(database, kind="voice"))
    session_id = store.create_conversation().session_id
    with sqlite3.connect(database) as connection:
        connection.execute("UPDATE conversation_sessions SET state_json = '{\"broken\": true}'")

    restarted = ConversationStore(repository=SessionRepository(database, kind="voice"))

    with pytest.raises(ConversationNotFoundError):
        restarted.get_conversation(session_id)


def test_database_failure_does_not_break_the_conversation(fakes, pipeline, project_repository, tmp_path):
    service = make_service(tmp_path / "veya.db", fakes, pipeline, project_repository)

    def broken_save(state):
        raise sqlite3.OperationalError("disk I/O error")

    service.store.repository.save = broken_save

    turn = asyncio.run(service.start_conversation("English"))
    reply = asyncio.run(service.respond_with_text(turn.session_id, FIXED_ANSWERS[0]))

    assert reply.status == ConversationStatus.COLLECTING_INFORMATION
