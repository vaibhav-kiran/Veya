"""Shared HTTP helper: timeouts, bounded retry on rate limits, clean errors."""

import asyncio
import logging
from typing import Any

import httpx

from app.core.exceptions import SourceRateLimitedError, SourceUnavailableError

logger = logging.getLogger(__name__)

MAX_RATE_LIMIT_WAIT_SECONDS = 10.0


def _is_rate_limited(response: httpx.Response) -> bool:
    if response.status_code == 429:
        return True
    # GitHub signals an exhausted quota with 403 + X-RateLimit-Remaining: 0.
    return response.status_code == 403 and response.headers.get("x-ratelimit-remaining") == "0"


async def request_json(
    client: httpx.AsyncClient,
    method: str,
    url: str,
    *,
    source: str,
    retries: int = 1,
    **kwargs: Any,
) -> Any:
    """Return parsed JSON (or text when the response is not JSON). Raises Source* errors."""

    for attempt in range(retries + 1):
        try:
            response = await client.request(method, url, **kwargs)
        except httpx.TimeoutException as error:
            raise SourceUnavailableError(f"{source} timed out.") from error
        except httpx.HTTPError as error:
            raise SourceUnavailableError(f"{source} could not be reached.") from error

        if _is_rate_limited(response):
            wait = float(response.headers.get("retry-after") or 2 ** attempt)
            if attempt < retries and wait <= MAX_RATE_LIMIT_WAIT_SECONDS:
                logger.warning("%s rate limited; retrying in %.0fs", source, wait)
                await asyncio.sleep(wait)
                continue
            raise SourceRateLimitedError(f"{source} is rate limited right now.")
        if response.status_code in (401, 403):
            raise SourceUnavailableError(f"{source} rejected the credentials (HTTP {response.status_code}).")
        if response.status_code == 404:
            return None
        if response.status_code >= 400:
            raise SourceUnavailableError(f"{source} returned HTTP {response.status_code}.")
        if "json" in response.headers.get("content-type", ""):
            return response.json()
        return response.text
    raise SourceUnavailableError(f"{source} is not available.")
