"""Cache of research API responses so identical queries are never repeated."""

import hashlib
import json
import time

from app.repositories.database import Database
from app.schemas.evidence import SourceRecord

CACHE_TTL_SECONDS = 7 * 24 * 3600


class SearchCache:
    def __init__(self, database: Database, ttl_seconds: int = CACHE_TTL_SECONDS):
        self.db = database
        self.ttl = ttl_seconds

    @staticmethod
    def key(provider: str, kind: str, query: str, limit: int) -> str:
        raw = json.dumps([provider, kind, " ".join(query.lower().split()), limit])
        return hashlib.sha256(raw.encode()).hexdigest()

    def get(self, key: str) -> list[SourceRecord] | None:
        with self.db.lock:
            row = self.db.connection.execute(
                "SELECT created_at, data FROM search_cache WHERE cache_key = ?", (key,)
            ).fetchone()
        if not row or time.time() - row[0] > self.ttl:
            return None
        return [SourceRecord.model_validate(item) for item in json.loads(row[1])]

    def put(self, key: str, records: list[SourceRecord]) -> None:
        with self.db.lock, self.db.connection:
            self.db.connection.execute(
                "INSERT OR REPLACE INTO search_cache (cache_key, created_at, data) VALUES (?, ?, ?)",
                (key, time.time(), json.dumps([record.model_dump() for record in records])),
            )
