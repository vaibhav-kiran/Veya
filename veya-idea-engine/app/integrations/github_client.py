"""
GitHub REST API: repository search, README excerpts, open issues.

Never downloads whole repositories. A token (GITHUB_TOKEN) is optional and
raises the rate limit from 60 to 5000 requests per hour.
"""

import base64
import re

import httpx

from app.integrations.http import request_json
from app.schemas.evidence import SourceRecord

API = "https://api.github.com"


def _clean_markdown(text: str, limit: int) -> str:
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"!\[[^\]]*\]\([^)]*\)", " ", text)
    text = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", text)
    text = re.sub(r"[#>*`_|]", " ", text)
    return " ".join(text.split())[:limit]


class GitHubClient:
    name = "github"

    def __init__(self, http: httpx.AsyncClient, token: str = ""):
        self.http = http
        self.headers = {"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}
        if token:
            self.headers["Authorization"] = f"Bearer {token}"

    async def search_repositories(self, query: str, *, limit: int) -> list[SourceRecord]:
        data = await request_json(
            self.http, "GET", f"{API}/search/repositories", source="GitHub", headers=self.headers,
            params={"q": query, "per_page": limit},
        )
        records = []
        for repo in (data or {}).get("items", [])[:limit]:
            records.append(
                SourceRecord(
                    title=repo["full_name"],
                    url=repo["html_url"],
                    source_type="github_repository",
                    provider=self.name,
                    excerpt=(repo.get("description") or "")[:500],
                    published_date=(repo.get("created_at") or "")[:10] or None,
                    metadata={
                        "full_name": repo["full_name"],
                        "stars": repo.get("stargazers_count", 0),
                        "language": repo.get("language"),
                        "topics": repo.get("topics", []),
                        "last_pushed": (repo.get("pushed_at") or "")[:10] or None,
                        "open_issues": repo.get("open_issues_count", 0),
                        "archived": repo.get("archived", False),
                    },
                )
            )
        return records

    async def readme_excerpt(self, full_name: str, *, limit: int = 1500) -> str:
        data = await request_json(
            self.http, "GET", f"{API}/repos/{full_name}/readme", source="GitHub", headers=self.headers,
        )
        if not isinstance(data, dict) or not data.get("content"):
            return ""
        try:
            text = base64.b64decode(data["content"]).decode("utf-8", errors="ignore")
        except ValueError:
            return ""
        return _clean_markdown(text, limit)

    async def open_issues(self, full_name: str, *, limit: int) -> list[SourceRecord]:
        """Open issues are REPORTED limitations, not verified ones."""
        data = await request_json(
            self.http, "GET", f"{API}/repos/{full_name}/issues", source="GitHub", headers=self.headers,
            params={"state": "open", "per_page": limit * 2, "sort": "comments"},
        )
        records = []
        for issue in data or []:
            if "pull_request" in issue:
                continue
            records.append(
                SourceRecord(
                    title=f"{full_name}#{issue['number']}: {issue['title']}"[:300],
                    url=issue["html_url"],
                    source_type="github_issue",
                    provider=self.name,
                    excerpt=_clean_markdown(issue.get("body") or "", 600),
                    published_date=(issue.get("created_at") or "")[:10] or None,
                    metadata={"comments": issue.get("comments", 0), "labels": [l["name"] for l in issue.get("labels", [])]},
                )
            )
            if len(records) >= limit:
                break
        return records

    async def search_issues(self, query: str, *, limit: int) -> list[SourceRecord]:
        """Public complaints and limitation reports across GitHub."""
        data = await request_json(
            self.http, "GET", f"{API}/search/issues", source="GitHub", headers=self.headers,
            params={"q": f"{query} is:issue", "per_page": limit, "sort": "comments"},
        )
        records = []
        for issue in (data or {}).get("items", [])[:limit]:
            repo = issue.get("repository_url", "").replace(f"{API}/repos/", "")
            records.append(
                SourceRecord(
                    title=f"{repo}#{issue['number']}: {issue['title']}"[:300],
                    url=issue["html_url"],
                    source_type="github_issue",
                    provider=self.name,
                    excerpt=_clean_markdown(issue.get("body") or "", 600),
                    published_date=(issue.get("created_at") or "")[:10] or None,
                    metadata={"comments": issue.get("comments", 0), "state": issue.get("state")},
                )
            )
        return records
