"""
Search what already exists: GitHub repositories and Devpost hackathon projects.

Both work without an API key. GITHUB_TOKEN (optional) raises GitHub's limit
from 10 to 30 searches a minute. Only short keyword queries are sent.
"""

import logging
import os
from dataclasses import dataclass
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

TIMEOUT = httpx.Timeout(10.0, connect=5.0)
USER_AGENT = "veya-idea-check"


@dataclass
class Found:
    source: str
    title: str
    description: str
    url: str
    stars: Optional[int] = None
    winner: Optional[bool] = None


class SourceError(RuntimeError):
    """A search source failed; the message is safe to show."""


def search_github(query: str, limit: int = 5) -> list[Found]:
    headers = {"Accept": "application/vnd.github+json", "User-Agent": USER_AGENT}
    token = os.getenv("GITHUB_TOKEN", "").strip()
    if token:
        headers["Authorization"] = f"Bearer {token}"
    try:
        response = httpx.get(
            "https://api.github.com/search/repositories",
            params={"q": query, "sort": "stars", "per_page": limit},
            headers=headers,
            timeout=TIMEOUT,
        )
    except httpx.HTTPError as error:
        raise SourceError("GitHub search couldn't be reached.") from error
    if response.status_code in (403, 429):
        raise SourceError("GitHub search limit reached; try again in a minute.")
    if response.status_code != 200:
        raise SourceError(f"GitHub search failed ({response.status_code}).")
    return [
        Found(
            source="github",
            title=item.get("full_name") or item.get("name") or "",
            description=(item.get("description") or "")[:300],
            url=item.get("html_url") or "",
            stars=item.get("stargazers_count"),
        )
        for item in response.json().get("items", [])[:limit]
        if item.get("html_url")
    ]


def search_devpost(query: str, limit: int = 6) -> list[Found]:
    try:
        response = httpx.get(
            "https://devpost.com/software/search",
            params={"query": query},
            headers={"Accept": "application/json", "User-Agent": USER_AGENT},
            timeout=TIMEOUT,
        )
    except httpx.HTTPError as error:
        raise SourceError("Devpost search couldn't be reached.") from error
    if response.status_code != 200:
        raise SourceError(f"Devpost search failed ({response.status_code}).")
    try:
        items = response.json().get("software", [])
    except ValueError as error:
        raise SourceError("Devpost returned an unexpected page.") from error
    return [
        Found(
            source="devpost",
            title=(item.get("name") or "").strip(),
            description=(item.get("tagline") or "")[:300],
            url=item.get("url") or "",
            winner=bool(item.get("winner")),
        )
        for item in items[:limit]
        if item.get("url") and item.get("name")
    ]
