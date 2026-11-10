"""
Web search. Tavily is the default provider; the interface is small so Brave or
a self-hosted SearXNG can be added later as another class.
"""

from typing import Literal, Protocol

import httpx

from app.core.exceptions import SourceUnavailableError
from app.integrations.http import request_json
from app.schemas.evidence import SourceRecord

SearchTopic = Literal["general", "news"]


class WebSearchClient(Protocol):
    name: str

    async def search(self, query: str, *, limit: int, topic: SearchTopic = "general") -> list[SourceRecord]: ...


class TavilySearchClient:
    name = "tavily"
    URL = "https://api.tavily.com/search"

    def __init__(self, http: httpx.AsyncClient, api_key: str):
        self.http = http
        self.api_key = api_key

    async def search(self, query: str, *, limit: int, topic: SearchTopic = "general") -> list[SourceRecord]:
        if not self.api_key:
            raise SourceUnavailableError("Web search is not configured (TAVILY_API_KEY is missing).")
        data = await request_json(
            self.http,
            "POST",
            self.URL,
            source="Tavily",
            headers={"Authorization": f"Bearer {self.api_key}"},
            json={"query": query, "max_results": limit, "search_depth": "basic", "topic": topic, "include_answer": False},
        )
        records = []
        for item in (data or {}).get("results", [])[:limit]:
            if not item.get("url") or not item.get("title"):
                continue
            records.append(
                SourceRecord(
                    title=str(item["title"])[:300],
                    url=str(item["url"]),
                    source_type="news" if topic == "news" else "web_page",
                    provider=self.name,
                    excerpt=str(item.get("content") or "")[:1200],
                    published_date=item.get("published_date"),
                )
            )
        return records


class DisabledSearchClient:
    """Used when no web search provider is configured. Fails clearly instead of inventing results."""

    name = "none"

    async def search(self, query: str, *, limit: int, topic: SearchTopic = "general") -> list[SourceRecord]:
        raise SourceUnavailableError("Web search is turned off (WEB_SEARCH_PROVIDER=none).")
