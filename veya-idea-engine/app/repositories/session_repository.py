"""Discovery sessions stored as JSON documents, plus an idea → session index."""

from app.core.exceptions import IdeaNotFoundError, SessionNotFoundError
from app.repositories.database import Database
from app.schemas.evidence import utc_now
from app.schemas.session import DiscoverySession


class SessionRepository:
    def __init__(self, database: Database):
        self.db = database

    def save(self, session: DiscoverySession) -> DiscoverySession:
        session.updated_at = utc_now()
        with self.db.lock, self.db.connection:
            self.db.connection.execute(
                "INSERT INTO sessions (session_id, updated_at, data) VALUES (?, ?, ?) "
                "ON CONFLICT(session_id) DO UPDATE SET updated_at = excluded.updated_at, data = excluded.data",
                (session.session_id, session.updated_at.isoformat(), session.model_dump_json()),
            )
            for evaluated in session.ideas:
                self.db.connection.execute(
                    "INSERT OR IGNORE INTO ideas (idea_id, session_id) VALUES (?, ?)",
                    (evaluated.idea.idea_id, session.session_id),
                )
        return session

    def get(self, session_id: str) -> DiscoverySession:
        with self.db.lock:
            row = self.db.connection.execute("SELECT data FROM sessions WHERE session_id = ?", (session_id,)).fetchone()
        if not row:
            raise SessionNotFoundError()
        return DiscoverySession.model_validate_json(row[0])

    def session_for_idea(self, idea_id: str) -> DiscoverySession:
        with self.db.lock:
            row = self.db.connection.execute("SELECT session_id FROM ideas WHERE idea_id = ?", (idea_id,)).fetchone()
        if not row:
            raise IdeaNotFoundError()
        return self.get(row[0])
