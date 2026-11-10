"""OpenAlex: academic papers with abstracts, authors, dates and DOIs (no key needed)."""

from typing import Any, Optional

import httpx

from app.integrations.http import request_json
from app.schemas.evidence import SourceRecord

API = "https://api.openalex.org/works"
FIELDS = "id,doi,display_name,publication_year,publication_date,abstract_inverted_index,authorships,primary_location,cited_by_count"


def rebuild_abstract(inverted: Optional[dict[str, list[int]]]) -> str:
    """OpenAlex stores abstracts as {word: [positions]}; turn that back into text."""
    if not inverted:
        return ""
    positions = [(pos, word) for word, places in inverted.items() for pos in places]
    return " ".join(word for _, word in sorted(positions))


class OpenAlexClient:
    name = "openalex"

    def __init__(self, http: httpx.AsyncClient, email: str = "", api_key: str = ""):
        self.http = http
        self.email = email
        self.api_key = api_key

    async def search(self, query: str, *, limit: int, from_date: Optional[str] = None) -> list[SourceRecord]:
        params: dict[str, Any] = {"search": query, "per-page": limit, "select": FIELDS}
        if from_date:
            params["filter"] = f"from_publication_date:{from_date}"
        if self.email:
            params["mailto"] = self.email  # OpenAlex "polite pool"
        if self.api_key:
            params["api_key"] = self.api_key  # higher daily allowance than anonymous use
        data = await request_json(self.http, "GET", API, source="OpenAlex", params=params)
        records = []
        for work in (data or {}).get("results", [])[:limit]:
            title = work.get("display_name")
            if not title:
                continue
            doi = work.get("doi")
            authors = [a.get("author", {}).get("display_name") for a in work.get("authorships", [])[:5]]
            venue = ((work.get("primary_location") or {}).get("source") or {}).get("display_name")
            records.append(
                SourceRecord(
                    title=title[:300],
                    url=doi or work.get("id"),
                    source_type="academic_paper",
                    provider=self.name,
                    excerpt=rebuild_abstract(work.get("abstract_inverted_index"))[:1500],
                    published_date=work.get("publication_date"),
                    metadata={
                        "openalex_id": work.get("id"),
                        "doi": doi,
                        "year": work.get("publication_year"),
                        "authors": [a for a in authors if a],
                        "venue": venue,
                        "cited_by": work.get("cited_by_count", 0),
                        "has_abstract": bool(work.get("abstract_inverted_index")),
                    },
                )
            )
        return records
