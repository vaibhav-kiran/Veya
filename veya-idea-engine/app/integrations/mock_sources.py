"""
Mock research sources for offline development and tests (RESEARCH_MODE=mock).

Every record is titled "[MOCK]" and points at example.org, so mock data can
never be mistaken for real research.
"""

import re

from app.schemas.evidence import SourceRecord


def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:60] or "query"


def mock_records(provider: str, query: str, *, limit: int, kind: str) -> list[SourceRecord]:
    return [
        SourceRecord(
            title=f"[MOCK] {kind} result {index + 1} for: {query}",
            url=f"https://example.org/mock/{provider}/{_slug(query)}/{index + 1}",
            source_type="mock",
            provider=f"mock_{provider}",
            excerpt=f"Sample {kind} text about {query}. This is mock data, not a real source.",
            published_date="2025-01-01",
            metadata={"mock": True, "full_name": f"mock/{_slug(query)}-{index + 1}"},
        )
        for index in range(min(limit, 2))
    ]


class MockWebSearch:
    name = "mock"

    async def search(self, query: str, *, limit: int, topic: str = "general") -> list[SourceRecord]:
        return mock_records("web", query, limit=limit, kind="web")


class MockGitHub:
    name = "mock_github"

    async def search_repositories(self, query: str, *, limit: int) -> list[SourceRecord]:
        return mock_records("github", query, limit=limit, kind="repository")

    async def readme_excerpt(self, full_name: str, *, limit: int = 1500) -> str:
        return f"[MOCK] README for {full_name}."

    async def open_issues(self, full_name: str, *, limit: int) -> list[SourceRecord]:
        return mock_records("github-issues", full_name, limit=limit, kind="issue")

    async def search_issues(self, query: str, *, limit: int) -> list[SourceRecord]:
        return mock_records("github-issues", query, limit=limit, kind="issue")


class MockOpenAlex:
    name = "mock_openalex"

    async def search(self, query: str, *, limit: int, from_date: str | None = None) -> list[SourceRecord]:
        return mock_records("openalex", query, limit=limit, kind="paper")
