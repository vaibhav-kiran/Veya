"""
The evidence manager.

- Gives every source a short id per session (E1, E2, …) so the model can cite it.
- Deduplicates by normalised URL.
- Validates claims: unknown ids are dropped, and a claim that says "fact" or
  "reported limitation" without any real source is downgraded to an
  unverified hypothesis. The model therefore cannot invent citations.
"""

import re

from app.repositories.database import Database
from app.schemas.evidence import SOURCED_STATUSES, Claim, Evidence, EvidenceRef, SourceRecord


def url_key(url: str) -> str:
    key = url.strip().lower()
    key = re.sub(r"^https?://(www\.)?", "", key)
    key = re.sub(r"[?#].*$", "", key) if "openalex" not in key and "github.com" in key else key
    return key.rstrip("/")


class EvidenceRepository:
    def __init__(self, database: Database):
        self.db = database

    def add(self, session_id: str, source: SourceRecord, query: str = "") -> Evidence:
        """Store a source (or return the existing record for the same URL)."""
        key = url_key(source.url)
        with self.db.lock:
            row = self.db.connection.execute(
                "SELECT data FROM evidence WHERE session_id = ? AND url_key = ?", (session_id, key)
            ).fetchone()
            if row:
                return Evidence.model_validate_json(row[0])
            (count,) = self.db.connection.execute(
                "SELECT COUNT(*) FROM evidence WHERE session_id = ?", (session_id,)
            ).fetchone()
            evidence = Evidence(**source.model_dump(), evidence_id=f"E{count + 1}", session_id=session_id, query=query)
            with self.db.connection:
                self.db.connection.execute(
                    "INSERT INTO evidence (session_id, evidence_id, url_key, data) VALUES (?, ?, ?, ?)",
                    (session_id, evidence.evidence_id, key, evidence.model_dump_json()),
                )
        return evidence

    def get(self, session_id: str, evidence_id: str) -> Evidence | None:
        with self.db.lock:
            row = self.db.connection.execute(
                "SELECT data FROM evidence WHERE session_id = ? AND evidence_id = ?", (session_id, evidence_id)
            ).fetchone()
        return Evidence.model_validate_json(row[0]) if row else None

    def all(self, session_id: str) -> list[Evidence]:
        with self.db.lock:
            rows = self.db.connection.execute(
                "SELECT data FROM evidence WHERE session_id = ? ORDER BY CAST(SUBSTR(evidence_id, 2) AS INTEGER)",
                (session_id,),
            ).fetchall()
        return [Evidence.model_validate_json(data) for (data,) in rows]

    # ---------- validation helpers used by every stage ----------

    def known_ids(self, session_id: str, ids: list[str]) -> list[str]:
        """Keep only ids that exist for this session (in order, without duplicates)."""
        existing = {evidence.evidence_id for evidence in self.all(session_id)}
        cleaned = []
        for raw in ids:
            evidence_id = str(raw).strip().upper().strip("[]")
            if evidence_id in existing and evidence_id not in cleaned:
                cleaned.append(evidence_id)
        return cleaned

    def validate_claims(self, session_id: str, claims: list[Claim]) -> list[Claim]:
        validated = []
        for claim in claims:
            ids = self.known_ids(session_id, claim.evidence_ids)
            status = claim.status
            if status in SOURCED_STATUSES and not ids:
                status = "unverified_hypothesis"
            if not claim.statement.strip():
                continue
            validated.append(Claim(statement=claim.statement.strip(), status=status, evidence_ids=ids))
        return validated

    def refs(self, session_id: str, ids: list[str]) -> list[EvidenceRef]:
        refs = []
        for evidence_id in self.known_ids(session_id, ids):
            evidence = self.get(session_id, evidence_id)
            if evidence:
                refs.append(
                    EvidenceRef(
                        evidence_id=evidence.evidence_id,
                        title=evidence.title,
                        url=evidence.url,
                        source_type=evidence.source_type,
                        published_date=evidence.published_date,
                    )
                )
        return refs
