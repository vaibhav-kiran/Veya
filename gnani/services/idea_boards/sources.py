"""
Find and read pages about a hackathon. No API keys needed.

- A link from the student: that page is read (plus /rules on Devpost).
- A name: Devpost, Unstop and Devfolio (where most Indian student hackathons
  are listed) and a web search (DuckDuckGo) are searched together, and the
  best pages are read.

Only short queries are sent; nothing about the student.
"""

import html
import logging
import re
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from typing import Callable
from urllib.parse import parse_qs, unquote, urlparse

import httpx

logger = logging.getLogger(__name__)

TIMEOUT = httpx.Timeout(12.0, connect=6.0)
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; veya-research)", "Accept-Language": "en"}
MAX_PAGE_CHARS = 6000
MAX_PAGES = 6
MAX_BYTES = 2_000_000
URL_PATTERN = re.compile(r"https?://\S+", re.I)
# Pages that can't be read as text or are walled.
SKIP_HOSTS = ("scribd.com", "linkedin.com", "facebook.com", "instagram.com", "x.com", "twitter.com", "youtube.com")


@dataclass
class Page:
    title: str
    url: str
    text: str
    origin: str  # link | devpost | unstop | devfolio | web


@dataclass
class Gathered:
    pages: list[Page] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


def html_to_text(markup: str) -> str:
    markup = re.sub(r"(?is)<(script|style|noscript|svg|nav|footer)[^>]*>.*?</\1>", " ", markup)
    markup = re.sub(r"(?i)<br\s*/?>|</(p|div|li|h[1-6]|tr)>", "\n", markup)
    text = html.unescape(re.sub(r"<[^>]+>", " ", markup))
    lines = [" ".join(line.split()) for line in text.splitlines()]
    return "\n".join(line for line in lines if line)


KEYWORDS = re.compile(r"judging|criteria|evaluat|theme|track|problem statement|prize|eligib|team size|rules", re.I)


def excerpt(text: str, limit: int = MAX_PAGE_CHARS) -> str:
    """The start of the page plus the parts about judging, themes, prizes and rules."""

    if len(text) <= limit:
        return text
    head = text[: limit // 3]
    parts, used, budget = [head], set(), limit - len(head)
    for match in KEYWORDS.finditer(text, len(head)):
        start = max(len(head), match.start() - 200)
        if any(start < end and start >= begin for begin, end in used) or budget <= 0:
            continue
        piece = text[start : start + min(1500, budget)]
        used.add((start, start + len(piece)))
        parts.append(piece)
        budget -= len(piece)
    return "\n...\n".join(parts)


def _title(markup: str, fallback: str) -> str:
    match = re.search(r"(?is)<title[^>]*>(.*?)</title>", markup)
    return " ".join(html.unescape(match.group(1)).split())[:150] if match else fallback


def fetch_page(url: str, origin: str = "web") -> Page | None:
    host = urlparse(url).netloc.lower()
    if any(host.endswith(skip) for skip in SKIP_HOSTS) or url.lower().endswith(".pdf"):
        return None
    try:
        response = httpx.get(url, headers=HEADERS, timeout=TIMEOUT, follow_redirects=True)
    except httpx.HTTPError:
        return None
    if response.status_code != 200 or "html" not in response.headers.get("content-type", "html"):
        return None
    markup = response.text[:MAX_BYTES]
    text = html_to_text(markup)
    if len(text) < 200:  # an app shell that needs JavaScript; nothing useful to read
        return None
    return Page(title=_title(markup, host), url=str(response.url), text=excerpt(text), origin=origin)


# =========================================================
# HACKATHON SITES
# =========================================================


def search_devpost(query: str) -> list[Page]:
    response = httpx.get("https://devpost.com/api/hackathons", params={"search": query}, headers=HEADERS, timeout=TIMEOUT)
    response.raise_for_status()
    pages = []
    for item in response.json().get("hackathons", [])[:2]:
        url = item.get("url", "")
        if not url:
            continue
        facts = [
            f"Hackathon on Devpost: {item.get('title', '')}",
            f"Dates: {item.get('submission_period_dates', '')} ({item.get('open_state', '')})",
            f"Themes: {', '.join(theme.get('name', '') for theme in item.get('themes', []))}",
            f"Prizes: {html_to_text(str(item.get('prize_amount', '')))}",
            f"Organiser: {item.get('organization_name', '')}",
        ]
        rules = fetch_page(url.rstrip("/") + "/rules", origin="devpost")
        text = "\n".join(facts) + ("\n\nRules page:\n" + rules.text if rules else "")
        pages.append(Page(title=item.get("title", url), url=url, text=excerpt(text, MAX_PAGE_CHARS + 1000), origin="devpost"))
    return pages


def search_unstop(query: str) -> list[Page]:
    response = httpx.get(
        "https://unstop.com/api/public/opportunity/search-result",
        params={"opportunity": "hackathons", "searchTerm": query, "page": 1, "per_page": 3},
        headers={**HEADERS, "Accept": "application/json"},
        timeout=TIMEOUT,
    )
    response.raise_for_status()
    pages = []
    for item in response.json().get("data", {}).get("data", [])[:2]:
        url = f"https://unstop.com/{item.get('public_url', '').lstrip('/')}"
        text = f"Hackathon on Unstop: {item.get('title', '')}\n" + html_to_text(item.get("details") or "")
        pages.append(Page(title=item.get("title", url), url=url, text=excerpt(text), origin="unstop"))
    return pages


def search_devfolio(query: str) -> list[Page]:
    response = httpx.post(
        "https://api.devfolio.co/api/search/hackathons",
        json={"q": query, "size": 2},
        headers={**HEADERS, "Content-Type": "application/json"},
        timeout=TIMEOUT,
    )
    response.raise_for_status()
    pages = []
    for hit in response.json().get("hits", {}).get("hits", [])[:2]:
        item = hit.get("_source", {})
        slug = item.get("slug")
        if not slug:
            continue
        prizes = "; ".join(
            f"{prize.get('name', '')}: {prize.get('desc', '') or ''}".strip(": ") for prize in (item.get("prizes") or [])[:8]
        )
        themes = ", ".join(str(theme.get("name", theme)) if isinstance(theme, dict) else str(theme) for theme in item.get("themes") or [])
        text = (
            f"Hackathon on Devfolio: {item.get('name', '')}. {item.get('tagline', '')}\n"
            f"Dates: {item.get('starts_at', '')} to {item.get('ends_at', '')}. Online: {item.get('is_online')}\n"
            f"Themes: {themes}\nPrizes: {prizes}\n\n{item.get('desc') or ''}"
        )
        pages.append(Page(title=item.get("name", slug), url=f"https://{slug}.devfolio.co", text=excerpt(text), origin="devfolio"))
    return pages


def search_web(query: str) -> list[Page]:
    """DuckDuckGo's HTML results (no key); the top pages are read."""
    response = httpx.get("https://html.duckduckgo.com/html/", params={"q": query}, headers=HEADERS, timeout=TIMEOUT)
    response.raise_for_status()
    links = []
    for href in re.findall(r'class="result__a" href="([^"]+)"', response.text):
        target = parse_qs(urlparse(html.unescape(href)).query).get("uddg", [href])[0]
        target = unquote(target)
        if target.startswith("http") and target not in links:
            links.append(target)
    pages = []
    for link in links[:6]:
        page = fetch_page(link, origin="web")
        if page:
            pages.append(page)
        if len(pages) == 3:
            break
    return pages


# =========================================================
# GATHER
# =========================================================


def gather(query: str) -> Gathered:
    """Pages about the hackathon in `query` (a name or a link)."""

    result = Gathered()
    links = URL_PATTERN.findall(query)
    if links:
        url = links[0].rstrip(").,")
        page = fetch_page(url, origin="link")
        if page:
            result.pages.append(page)
        else:
            result.warnings.append("The link couldn't be read (it may need a login or JavaScript). Searching by name instead.")
        if "devpost.com" in url:
            rules = fetch_page(url.rstrip("/") + "/rules", origin="link")
            if rules:
                result.pages.append(rules)
        name = urlparse(url).path.strip("/").split("/")[-1].replace("-", " ") or urlparse(url).netloc.split(".")[0]
        query = " ".join(URL_PATTERN.sub(" ", query).split()) or name
        if result.pages:
            searches: list[tuple[str, Callable[[str], list[Page]]]] = [("web", search_web)]
        else:
            searches = [("devpost", search_devpost), ("unstop", search_unstop), ("devfolio", search_devfolio), ("web", search_web)]
    else:
        searches = [("devpost", search_devpost), ("unstop", search_unstop), ("devfolio", search_devfolio), ("web", search_web)]

    web_query = f"{query} hackathon themes judging criteria"
    with ThreadPoolExecutor(max_workers=len(searches)) as pool:
        futures = {name: pool.submit(search, web_query if name == "web" else query) for name, search in searches}
        for name, future in futures.items():
            try:
                result.pages.extend(future.result())
            except Exception as error:  # one site failing never stops the research
                logger.warning("Hackathon search on %s failed: %s", name, type(error).__name__)
                result.warnings.append(f"{name.capitalize()} search didn't respond.")

    seen: set[str] = set()
    unique = []
    for page in result.pages:
        if page.url not in seen:
            seen.add(page.url)
            unique.append(page)
    result.pages = unique[:MAX_PAGES + 2]
    return result
