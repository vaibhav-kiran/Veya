"""Semantic Scholar (optional; heavily rate limited without an API key)."""

import httpx

from app.integrations.http import request_json
from app.schemas.evidence import SourceRecord

API = "https://api.semanticscholar.org/graph/v1/paper/search"


class SemanticScholarClient:
    name = "semantic_scholar"

    def __init__(self, http: httpx.AsyncClient, api_key: str = ""):
        self.http = http
        self.headers = {"x-api-key": api_key} if api_key else {}

    async def search(self, query: str, *, limit: int) -> list[SourceRecord]:
        data = await request_json(
            self.http, "GET", API, source="Semantic Scholar", headers=self.headers,
            params={"query": query, "limit": limit, "fields": "title,url,abstract,year,publicationDate,externalIds,authors"},
        )
        records = []
        for paper in (data or {}).get("data", [])[:limit]:
            if not paper.get("title") or not paper.get("url"):
                continue
            doi = (paper.get("externalIds") or {}).get("DOI")
            records.append(
                SourceRecord(
                    title=paper["title"][:300],
                    url=f"https://doi.org/{doi}" if doi else paper["url"],
                    source_type="academic_paper",
                    provider=self.name,
                    excerpt=(paper.get("abstract") or "")[:1500],
                    published_date=paper.get("publicationDate"),
                    metadata={"year": paper.get("year"), "authors": [a.get("name") for a in (paper.get("authors") or [])[:5]]},
                )
            )
        return records
