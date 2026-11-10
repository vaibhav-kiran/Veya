"""
The reasoning model behind every pipeline stage.

`LLMClient` is the interface the pipeline depends on. `OpenAICompatibleClient`
talks to any OpenAI-compatible endpoint; with the default settings that is
Qwen 2.5 7B in a local Ollama. Adding Groq later only needs new settings or a
small subclass — the research pipeline does not change.

Every call asks for JSON, extracts the object even if the model wraps it in
code fences, validates it with a Pydantic model and, if invalid, retries with
the validation error shown to the model (bounded by LLM_MAX_ATTEMPTS).
"""

import json
import logging
import re
from typing import Any, Protocol, TypeVar

import openai
from openai import AsyncOpenAI
from pydantic import BaseModel, ValidationError

from app.core.config import Settings
from app.core.exceptions import LLMError, LLMOutputError

logger = logging.getLogger(__name__)

Model = TypeVar("Model", bound=BaseModel)


def extract_json_object(text: str) -> dict[str, Any]:
    """Pull one JSON object out of a model reply (tolerates ```json fences and text around it)."""

    if not text or not text.strip():
        raise ValueError("The model returned an empty reply.")
    body = text.strip()
    fence = re.search(r"```(?:json)?\s*(.*?)```", body, re.DOTALL)
    if fence:
        body = fence.group(1).strip()
    start, end = body.find("{"), body.rfind("}")
    if start == -1 or end <= start:
        raise ValueError("The reply does not contain a JSON object.")
    parsed = json.loads(body[start : end + 1])
    if not isinstance(parsed, dict):
        raise ValueError("The reply must be a JSON object.")
    return parsed


class LLMClient(Protocol):
    async def complete(self, system: str, user: str, *, json_mode: bool = True) -> str: ...


async def generate_structured(
    llm: LLMClient,
    system: str,
    user: str,
    model: type[Model],
    *,
    max_attempts: int = 3,
) -> Model:
    """Ask for JSON matching `model`; retry with the validation error when the reply is invalid."""

    problem = ""
    prompt = user
    for attempt in range(1, max_attempts + 1):
        raw = await llm.complete(system, prompt)
        try:
            return model.model_validate(extract_json_object(raw))
        except (ValueError, json.JSONDecodeError, ValidationError) as error:
            problem = str(error)[:800]
            logger.warning("Invalid %s from the model (attempt %d): %s", model.__name__, attempt, problem[:200])
            prompt = (
                f"{user}\n\nYour previous answer was not valid: {problem}\n"
                "Reply again with ONLY the corrected JSON object."
            )
    raise LLMOutputError() from RuntimeError(problem)


class OpenAICompatibleClient:
    """Chat completions against an OpenAI-compatible server (Ollama by default)."""

    def __init__(self, settings: Settings, client: AsyncOpenAI | None = None):
        self.settings = settings
        self.model = settings.llm_model
        self.client = client or AsyncOpenAI(
            base_url=settings.llm_base_url,
            api_key=settings.llm_api_key or "not-needed",
            timeout=settings.llm_timeout_seconds,
            max_retries=1,
        )

    async def complete(self, system: str, user: str, *, json_mode: bool = True) -> str:
        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
                temperature=0.2,
                response_format={"type": "json_object"} if json_mode else openai.NOT_GIVEN,
                # Ollama's default context window silently cuts long prompts.
                extra_body={"options": {"num_ctx": 16384}} if self.settings.llm_provider == "ollama" else None,
            )
        except (openai.APIConnectionError, openai.APITimeoutError) as error:
            logger.error("Could not reach the model at %s: %s", self.settings.llm_base_url, type(error).__name__)
            raise LLMError() from error
        except openai.APIStatusError as error:
            logger.error("Model server returned HTTP %s", error.status_code)
            raise LLMError() from error
        return (response.choices[0].message.content or "") if response.choices else ""

    async def ping(self) -> bool:
        try:
            models = await self.client.models.list()
            return any(model.id == self.model for model in models.data)
        except Exception:  # health check only
            return False


def create_llm_client(settings: Settings) -> OpenAICompatibleClient:
    if settings.llm_provider not in {"ollama", "openai_compatible"}:
        raise ValueError(f"Unsupported LLM_PROVIDER '{settings.llm_provider}'. Use 'ollama'.")
    return OpenAICompatibleClient(settings)
