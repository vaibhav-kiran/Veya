"""Builds the engine once at startup and hands it to the routes."""

from dataclasses import dataclass

import httpx
from fastapi import Request

from app.core.config import Settings
from app.core.llm_client import LLMClient, create_llm_client
from app.integrations.github_client import GitHubClient
from app.integrations.mock_sources import MockGitHub, MockOpenAlex, MockWebSearch
from app.integrations.openalex_client import OpenAlexClient
from app.integrations.semantic_scholar_client import SemanticScholarClient
from app.integrations.web_search_client import DisabledSearchClient, TavilySearchClient
from app.repositories.database import Database
from app.repositories.evidence_repository import EvidenceRepository
from app.repositories.search_cache import SearchCache
from app.repositories.session_repository import SessionRepository
from app.services.context import EngineContext
from app.services.discovery_pipeline import DiscoveryPipeline
from app.services.research_tools import ResearchToolkit


@dataclass
class Engine:
    settings: Settings
    database: Database
    evidence: EvidenceRepository
    sessions: SessionRepository
    pipeline: DiscoveryPipeline
    llm: LLMClient
    http: httpx.AsyncClient | None
    sources: dict[str, str]

    async def close(self) -> None:
        await self.pipeline.shutdown()
        if self.http is not None:
            await self.http.aclose()
        self.database.connection.close()


def build_engine(settings: Settings, *, llm: LLMClient | None = None, sources: dict | None = None) -> Engine:
    """`llm` and `sources` can be injected (tests use fakes)."""
    database = Database(settings.database_path)
    evidence = EvidenceRepository(database)
    sessions = SessionRepository(database)
    http = None

    if sources is None:
        if settings.research_mode == "mock":
            sources = {"web": MockWebSearch(), "github": MockGitHub(), "openalex": MockOpenAlex(), "semantic_scholar": None}
        else:
            http = httpx.AsyncClient(timeout=settings.http_timeout_seconds, headers={"User-Agent": "veya-idea-engine/0.1"})
            if settings.web_search_provider == "tavily":
                web = TavilySearchClient(http, settings.tavily_api_key)
            else:
                web = DisabledSearchClient()
            sources = {
                "web": web,
                "github": GitHubClient(http, settings.github_token),
                "openalex": OpenAlexClient(http, settings.openalex_email, settings.openalex_api_key),
                "semantic_scholar": SemanticScholarClient(http, settings.semantic_scholar_api_key)
                if settings.semantic_scholar_enabled else None,
            }

    tools = ResearchToolkit(
        evidence, SearchCache(database), sources["web"], sources["github"], sources["openalex"], sources.get("semantic_scholar"),
        results_per_query=settings.max_search_results_per_query,
    )
    llm = llm or create_llm_client(settings)
    ctx = EngineContext(settings=settings, llm=llm, evidence=evidence, tools=tools)
    return Engine(
        settings=settings, database=database, evidence=evidence, sessions=sessions,
        pipeline=DiscoveryPipeline(ctx, sessions), llm=llm, http=http,
        sources={name: getattr(client, "name", type(client).__name__) for name, client in sources.items() if client is not None},
    )


def get_engine(request: Request) -> Engine:
    return request.app.state.engine
