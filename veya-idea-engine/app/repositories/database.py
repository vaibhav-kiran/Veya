"""One SQLite database for evidence, sessions and the search cache (portable: a single file)."""

import sqlite3
import threading
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS evidence (
    session_id TEXT NOT NULL,
    evidence_id TEXT NOT NULL,
    url_key TEXT NOT NULL,
    data TEXT NOT NULL,
    PRIMARY KEY (session_id, evidence_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_evidence_url ON evidence(session_id, url_key);
CREATE TABLE IF NOT EXISTS sessions (
    session_id TEXT PRIMARY KEY,
    updated_at TEXT NOT NULL,
    data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ideas (
    idea_id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS search_cache (
    cache_key TEXT PRIMARY KEY,
    created_at REAL NOT NULL,
    data TEXT NOT NULL
);
"""


class Database:
    def __init__(self, path: str):
        if path != ":memory:":
            Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.connection = sqlite3.connect(path, check_same_thread=False)
        self.lock = threading.Lock()
        with self.lock, self.connection:
            self.connection.executescript(SCHEMA)
