"""
SQLite storage for conversation sessions, so a conversation survives a
server restart.

The ConversationStore keeps sessions in memory for speed and writes each
change here. After a restart, a session the app asks for is loaded back
from this table the first time it is used.

Voice conversations and text chats share the table but are kept apart by
`kind`, so a chat session id never works on the voice routes and back.
"""

import json
import logging
import sqlite3
import threading
from datetime import datetime
from pathlib import Path
from typing import Optional

from services.conversation_manager.schemas import ConversationState

logger = logging.getLogger(__name__)

# Fields the API never shows (exclude=True) but that must survive a restart.
# The latest reply's audio is NOT saved: it is regenerated text-only after a restart.
PRIVATE_FIELDS = ("owner_id", "visual_generation_input")


def state_to_json(state: ConversationState) -> str:
    data = json.loads(state.model_dump_json())
    for name in PRIVATE_FIELDS:
        data[name] = getattr(state, name)
    return json.dumps(data, ensure_ascii=False)


def state_from_json(text: str) -> ConversationState:
    return ConversationState.model_validate(json.loads(text))


class SessionRepository:

    def __init__(self, database_path: Path | str, kind: str):
        self.kind = kind
        self.database_path = str(database_path)
        if self.database_path != ":memory:":
            Path(self.database_path).parent.mkdir(parents=True, exist_ok=True)

        # Same pattern as ProjectRepository: one connection guarded by a lock.
        # `timeout` waits for the project repository's connection to finish
        # a write instead of failing with "database is locked".
        self._connection = sqlite3.connect(self.database_path, check_same_thread=False, timeout=10)
        self._lock = threading.Lock()

        with self._lock, self._connection:
            self._connection.execute(
                """
                CREATE TABLE IF NOT EXISTS conversation_sessions (
                    session_id TEXT PRIMARY KEY,
                    kind TEXT NOT NULL,
                    owner_id TEXT,
                    updated_at TEXT NOT NULL,
                    state_json TEXT NOT NULL
                )
                """
            )
            self._connection.execute(
                "CREATE INDEX IF NOT EXISTS conversation_sessions_updated ON conversation_sessions (kind, updated_at)"
            )

    def save(self, state: ConversationState) -> None:
        with self._lock, self._connection:
            self._connection.execute(
                """
                INSERT INTO conversation_sessions (session_id, kind, owner_id, updated_at, state_json)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(session_id) DO UPDATE SET
                    owner_id = excluded.owner_id,
                    updated_at = excluded.updated_at,
                    state_json = excluded.state_json
                WHERE conversation_sessions.kind = excluded.kind
                """,
                (state.session_id, self.kind, state.owner_id, state.updated_at.isoformat(), state_to_json(state)),
            )

    def load(self, session_id: str) -> Optional[ConversationState]:
        with self._lock:
            row = self._connection.execute(
                "SELECT state_json FROM conversation_sessions WHERE session_id = ? AND kind = ?",
                (session_id, self.kind),
            ).fetchone()
        if row is None:
            return None
        try:
            return state_from_json(row[0])
        except (ValueError, TypeError):
            # Saved by an older, incompatible version: treat it as expired.
            logger.warning("Could not read saved conversation %s...; discarding it.", session_id[:8])
            self.delete(session_id)
            return None

    def delete(self, session_id: str) -> None:
        with self._lock, self._connection:
            self._connection.execute(
                "DELETE FROM conversation_sessions WHERE session_id = ? AND kind = ?",
                (session_id, self.kind),
            )

    def delete_older_than(self, cutoff: datetime) -> int:
        with self._lock, self._connection:
            cursor = self._connection.execute(
                "DELETE FROM conversation_sessions WHERE kind = ? AND updated_at < ?",
                (self.kind, cutoff.isoformat()),
            )
        return cursor.rowcount
