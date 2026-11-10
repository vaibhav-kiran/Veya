"""
ResearchToolkit — the single gateway between the pipeline and research APIs.

For every call it: checks the cache, enforces a per-session API budget,
stores results as numbered evidence, and turns source failures into session
warnings (the pipeline keeps going with whatever sources work).
"""

import asyncio
import logging
from typing import Awaitable, Callable, Optional

from app.core.exceptions import SourceUnavailableError
from app.repositories.evidence_repository import EvidenceRepository
from app.repositories.search_cache import SearchCache
from app.schemas.evidence import Evidence, SourceRecord
from app.schemas.session import DiscoverySession

logger = logging.getLogger(__name__)

MAX_API_CALLS_PER_SESSION = 80


class ResearchToolkit:
    def __init__(
        self,
        evidence: EvidenceRepository,
        cache: SearchCache,
        web: object,
        github: object,
        openalex: object,
        semantic_scholar: Optional[object] = None,
        results_per_query: int = 5,
        max_calls: int = MAX_API_CALLS_PER_SESSION,
    ):
        self.evidence = evidence
        self.cache = cache
        self.web_client = web
        self.github_client = github
        self.openalex_client = openalex
        self.semantic_scholar_client = semantic_scholar
        self.results_per_query = results_per_query
        self.max_calls = max_calls
        self._calls: dict[str, int] = {}
        self._failed_sources: dict[str, set[str]] = {}
        # One request at a time per provider: the research APIs rate-limit bursts.
        self._locks: dict[str, asyncio.Lock] = {}

    # ---------------- core ----------------

    async def _run(
        self,
        session: DiscoverySession,
        provider: str,
        kind: str,
        query: str,
        fetch: Callable[[], Awaitable[list[SourceRecord]]],
        limit: int,
    ) -> list[Evidence]:
        query = " ".join(query.split())[:300]
        if not query:
            return []
        if provider in self._failed_sources.get(session.session_id, set()):
            return []  # a source that failed hard (auth/config) is not retried in this session

        key = self.cache.key(provider, kind, query, limit)
        records = self.cache.get(key)
        if records is None:
            used = self._calls.get(session.session_id, 0)
            if used >= self.max_calls:
                session.warn("Research budget reached: some searches were skipped to limit API usage.")
                return []
            self._calls[session.session_id] = used + 1
            try:
                async with self._locks.setdefault(provider, asyncio.Lock()):
                    records = await fetch()
            except SourceUnavailableError as error:
                session.warn(error.user_message)
                if "rate limited" not in error.user_message:
                    self._failed_sources.setdefault(session.session_id, set()).add(provider)
                logger.warning("%s %s failed for %r: %s", provider, kind, query, error.user_message)
                return []
            self.cache.put(key, records)

        if any(record.source_type == "mock" for record in records):
            session.warn("Mock research data is in use (RESEARCH_MODE=mock). Results are not real research.")
        return [self.evidence.add(session.session_id, record, query=query) for record in records]

    # ---------------- sources ----------------

    async def web(self, session: DiscoverySession, query: str, topic: str = "general") -> list[Evidence]:
        limit = self.results_per_query
        return await self._run(session, getattr(self.web_client, "name", "web"), f"web:{topic}", query,
                               lambda: self.web_client.search(query, limit=limit, topic=topic), limit)

    async def repositories(self, session: DiscoverySession, query: str) -> list[Evidence]:
        limit = self.results_per_query
        return await self._run(session, "github", "repositories", query,
                               lambda: self.github_client.search_repositories(query, limit=limit), limit)

    async def issues(self, session: DiscoverySession, query: str) -> list[Evidence]:
        limit = min(3, self.results_per_query)
        return await self._run(session, "github", "issues", query,
                               lambda: self.github_client.search_issues(query, limit=limit), limit)

    async def repository_details(self, session: DiscoverySession, repo: Evidence) -> list[Evidence]:
        """README excerpt (added to the repo's own evidence text) and its open issues as reported limitations."""
        full_name = repo.metadata.get("full_name")
        if not full_name or repo.metadata.get("mock"):
            return []
        limit = 3

        async def fetch_issues() -> list[SourceRecord]:
            return await self.github_client.open_issues(full_name, limit=limit)

        issues = await self._run(session, "github", "repo_issues", full_name, fetch_issues, limit)

        async def fetch_readme() -> list[SourceRecord]:
            text = await self.github_client.readme_excerpt(full_name)
            return [SourceRecord(
                title=f"{full_name} — README", url=f"{repo.url}#readme", source_type="github_repository",
                provider="github", excerpt=text, published_date=repo.published_date,
                metadata={**repo.metadata, "readme": True},
            )] if text else []

        readme = await self._run(session, "github", "readme", full_name, fetch_readme, 1)
        return readme + issues

    async def papers(self, session: DiscoverySession, query: str, from_date: Optional[str] = None) -> list[Evidence]:
        limit = self.results_per_query
        found = await self._run(session, "openalex", f"papers:{from_date or ''}", query,
                                lambda: self.openalex_client.search(query, limit=limit, from_date=from_date), limit)
        if self.semantic_scholar_client is not None and not from_date:
            found += await self._run(session, "semantic_scholar", "papers", query,
                                     lambda: self.semantic_scholar_client.search(query, limit=limit), limit)
        return found
