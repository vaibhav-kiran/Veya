"""
The Idea Discovery Engine (veya-idea-engine/), run inside this backend.

It used to be a second server (port 8100) that had to be started by hand.
Now it is imported and started together with this backend, and Innovator
talks to it in-process (no network hop, nothing extra to run or expose).

Its code, settings (veya-idea-engine/.env) and saved sessions stay in its
own folder and are unchanged; only how it is started is different.

Research uses the model the student picked in the app (Qwen, Gemini or
Groq): the Innovator route puts the choice in `current_model` before it calls
the engine, and the engine's background research task inherits it (asyncio
copies context variables into tasks it creates). The engine's own settings
choose the Qwen (Ollama) connection; Gemini and Groq use the same keys and
models as the rest of the backend (GEMINI_*, GROQ_* in veya/.env).

Set IDEA_ENGINE_URL to use a separately running engine instead (it then uses
its own model settings).
"""

import logging
import os
import sys
from contextlib import AsyncExitStack
from contextvars import ContextVar
from pathlib import Path
from typing import Any, Optional

import httpx
import openai
from openai import AsyncOpenAI

from services.llm_providers import (
    DEFAULT_GEMINI_MODEL,
    DEFAULT_GROQ_MODEL,
    GEMINI,
    GEMINI_OPENAI_BASE_URL,
    GROQ,
    GROQ_MAX_RETRIES,
    GROQ_OPENAI_BASE_URL,
    QWEN,
)

logger = logging.getLogger(__name__)

ENGINE_DIR = Path(__file__).resolve().parents[2] / "veya-idea-engine"
# Base URL for in-process calls (never leaves the process).
IN_PROCESS_URL = "http://idea-engine"


# The model the current Innovator request (and the research it starts) uses.
current_model: ContextVar[str] = ContextVar("innovator_model", default=QWEN)


def _env(name: str, default: str = "") -> str:
    return os.getenv(name, "").strip().strip('"') or default


class CloudModel:
    """An OpenAI-compatible cloud model (Gemini or Groq), async, as the engine expects."""

    def __init__(self, name: str, base_url: str, api_key: str, model: str, reasoning_effort: str, max_retries: int):
        self.name = name
        self.model = model
        self.reasoning_effort = reasoning_effort
        self.client = AsyncOpenAI(base_url=base_url, api_key=api_key, timeout=180.0, max_retries=max_retries)

    async def complete(self, system: str, user: str, *, json_mode: bool = True) -> str:
        from app.core.exceptions import LLMError  # the engine's own error type

        request: dict[str, Any] = {
            "model": self.model,
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
            "temperature": 0.2,
        }
        # Gemini takes a reasoning effort; on Groq only the gpt-oss models do.
        if self.reasoning_effort and (self.name == GEMINI or "gpt-oss" in self.model):
            request["reasoning_effort"] = self.reasoning_effort
        try:
            try:
                response = await self.client.chat.completions.create(
                    **request, **({"response_format": {"type": "json_object"}} if json_mode else {})
                )
            except openai.BadRequestError:
                if not json_mode:
                    raise
                # Groq sometimes rejects its own strict-JSON reply ("Failed to
                # generate JSON"); ask again without strict mode, the engine
                # pulls the JSON out of the text and validates it.
                response = await self.client.chat.completions.create(**request)
        except (openai.APIConnectionError, openai.APITimeoutError, openai.APIStatusError) as error:
            logger.error("%s request failed: %s", self.name, str(error)[:200])
            raise LLMError() from error
        return (response.choices[0].message.content or "") if response.choices else ""

    async def ping(self) -> bool:
        return True


def cloud_models() -> dict[str, CloudModel]:
    """Gemini and Groq, for the ones whose key is set."""
    models: dict[str, CloudModel] = {}
    if key := _env("GEMINI_API_KEY"):
        models[GEMINI] = CloudModel(
            GEMINI, GEMINI_OPENAI_BASE_URL, key, _env("GEMINI_MODEL", DEFAULT_GEMINI_MODEL),
            _env("GEMINI_REASONING_EFFORT", "minimal").lower(), max_retries=1,
        )
    if key := _env("GROQ_API_KEY"):
        models[GROQ] = CloudModel(
            GROQ, GROQ_OPENAI_BASE_URL, key, _env("GROQ_MODEL", DEFAULT_GROQ_MODEL),
            _env("GROQ_REASONING_EFFORT", "low").lower(), max_retries=GROQ_MAX_RETRIES,
        )
    return models


class ModelSwitch:
    """
    Looks like the engine's model client; each call goes to the model picked
    for the request it belongs to (`current_model`). Qwen is the engine's own.
    """

    def __init__(self, qwen: Any, others: dict[str, Any]):
        self.models = {QWEN: qwen, **others}

    def available(self, name: str) -> bool:
        return name in self.models

    async def complete(self, system: str, user: str, *, json_mode: bool = True) -> str:
        model = self.models.get(current_model.get()) or self.models[QWEN]
        return await model.complete(system, user, json_mode=json_mode)

    async def ping(self) -> bool:
        ping = getattr(self.models[QWEN], "ping", None)
        return await ping() if ping else True


def external_engine_url() -> Optional[str]:
    """A separately running engine, if IDEA_ENGINE_URL is set."""
    url = os.getenv("IDEA_ENGINE_URL", "").strip().rstrip("/")
    return url or None


def load_engine_app() -> Any:
    """The engine's FastAPI app, imported from veya-idea-engine/ (None if that folder is missing)."""
    if not (ENGINE_DIR / "app" / "main.py").is_file():
        logger.warning("Idea engine not found at %s; Innovator is off.", ENGINE_DIR)
        return None
    # Appended (not prepended), so this backend's own packages always win.
    if str(ENGINE_DIR) not in sys.path:
        sys.path.append(str(ENGINE_DIR))
    from app.core.config import get_settings  # the engine's package is called "app"
    from app.core.llm_client import create_llm_client
    from app.main import create_app

    settings = get_settings()
    switch = ModelSwitch(create_llm_client(settings), cloud_models())
    engine = create_app(settings, llm=switch)
    engine.state.model_switch = switch
    return engine


async def start_engine(stack: AsyncExitStack) -> Optional[httpx.AsyncClient]:
    """
    Start the engine for the life of this backend and return a client for
    it, or None if it isn't available. Closed when `stack` closes.
    """
    url = external_engine_url()
    if url:
        logger.info("Innovator uses the idea engine at %s", url)
        return await stack.enter_async_context(httpx.AsyncClient(base_url=url))

    try:
        engine = load_engine_app()
    except Exception:
        logger.exception("The idea engine couldn't be loaded; Innovator is off.")
        return None
    if engine is None:
        return None

    # A mounted app doesn't get startup/shutdown events, so run its
    # lifespan here: it builds the engine and closes it on shutdown.
    await stack.enter_async_context(engine.router.lifespan_context(engine))
    client = httpx.AsyncClient(transport=httpx.ASGITransport(app=engine), base_url=IN_PROCESS_URL)
    switch: ModelSwitch = engine.state.model_switch
    logger.info("Idea engine started inside the backend (Innovator ready; models: %s)", ", ".join(switch.models))
    client = await stack.enter_async_context(client)
    # So the routes can tell whether a picked model is set up.
    client.model_switch = switch  # type: ignore[attr-defined]
    return client
