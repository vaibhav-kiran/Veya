"""
Which language model VEYA thinks with: the local Qwen (Ollama), Google Gemini
or Groq.

Every pipeline talks to its model through an OpenAI-style client
(`client.chat.completions.create(...)`). Ollama offers that API, and so does
Gemini (https://ai.google.dev/gemini-api/docs/openai), so the same pipelines
run on either model: only the client and model name change.

Groq offers the same API too (https://console.groq.com/docs/openai).

The user picks the model per conversation in the app (voice and chat).

Settings (in veya/.env):

    GEMINI_API_KEY             turns Gemini on (Google AI Studio key)
    GEMINI_MODEL               optional, default gemini-flash-lite-latest:
                               on the free tier, answers in about a second,
                               and writes good Indian languages. (In Nov 2026
                               the larger Flash models were often overloaded
                               on the free tier, and gemini-2.5-flash was gone.)
    GEMINI_REASONING_EFFORT    optional, default "minimal" (barely thinks:
                               fastest, and replies fit the pipelines' token
                               limits). Set low / medium / high to let it
                               think more, or leave empty to send nothing.
                               Current models reject "none".

    GROQ_API_KEY               turns Groq on (console.groq.com key, gsk_...)
    GROQ_MODEL                 optional, default openai/gpt-oss-120b: the
                               strongest model on Groq's free tier (Nov 2026:
                               1,000 requests a day, 8,000 tokens a minute),
                               reliable JSON, good Indian languages, and
                               answers in about a second.
    GROQ_REASONING_EFFORT      optional, default "low" (gpt-oss models only):
                               low / medium / high.
"""

import os
from types import SimpleNamespace
from typing import Any, Literal, Optional

from openai import OpenAI

QWEN = "qwen"
GEMINI = "gemini"
GROQ = "groq"
MODEL_PROVIDERS = (QWEN, GEMINI, GROQ)
# What the app sends to choose a model.
ModelName = Literal["qwen", "gemini", "groq"]

# For messages when a model isn't set up: its name and the .env setting that turns it on.
MODEL_LABELS = {QWEN: "Qwen", GEMINI: "Gemini", GROQ: "Groq"}
MODEL_KEYS = {GEMINI: "GEMINI_API_KEY", GROQ: "GROQ_API_KEY"}


def model_unavailable_message(model: str) -> str:
    label = MODEL_LABELS.get(model, model)
    key = MODEL_KEYS.get(model)
    if key:
        return f"{label} isn't set up on the Veya server. Add {key} to veya/.env, or choose Qwen."
    return f"{label} isn't available on the Veya server right now."


def rate_limit_message(model: str) -> str:
    label = MODEL_LABELS.get(model, model)
    return f"{label} has reached its usage limit for now. Choose another model, or try again later."

GEMINI_OPENAI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/"
DEFAULT_GEMINI_MODEL = "gemini-flash-lite-latest"
# Thinking tokens count towards max_tokens; leave room for them when thinking is on.
THINKING_ALLOWANCE_TOKENS = 4096


class _GeminiCompletions:

    def __init__(self, client: Any, reasoning_effort: str):
        self._client = client
        self._reasoning_effort = reasoning_effort

    def create(self, **request: Any) -> Any:
        # `extra_body={"options": ...}` holds Ollama-only settings (context
        # window, repeat penalty); Gemini rejects unknown fields.
        request.pop("extra_body", None)
        if self._reasoning_effort:
            request["reasoning_effort"] = self._reasoning_effort
            if self._reasoning_effort not in ("none", "minimal") and "max_tokens" in request:
                request["max_tokens"] += THINKING_ALLOWANCE_TOKENS
        return self._client.chat.completions.create(**request)


class GeminiClient:
    """Looks like the OpenAI client the pipelines use; sends requests to Gemini."""

    def __init__(self, api_key: str, reasoning_effort: str = "minimal", client: Any = None):
        openai_client = client or OpenAI(base_url=GEMINI_OPENAI_BASE_URL, api_key=api_key, timeout=120.0, max_retries=1)
        self.chat = SimpleNamespace(completions=_GeminiCompletions(openai_client, reasoning_effort))


def gemini_from_env() -> Optional[tuple[GeminiClient, str]]:
    """(client, model name), or None when GEMINI_API_KEY isn't set."""

    api_key = os.getenv("GEMINI_API_KEY", "").strip().strip('"')
    if not api_key:
        return None
    model = os.getenv("GEMINI_MODEL", "").strip().strip('"') or DEFAULT_GEMINI_MODEL
    effort = os.getenv("GEMINI_REASONING_EFFORT", "minimal").strip().strip('"').lower()
    return GeminiClient(api_key, reasoning_effort=effort), model


# ---------------------------------------------------------
# GROQ
# ---------------------------------------------------------

GROQ_OPENAI_BASE_URL = "https://api.groq.com/openai/v1"
DEFAULT_GROQ_MODEL = "openai/gpt-oss-120b"
# The free tier allows 8,000 tokens a minute. A long plan can use most of
# that, so a request that hits the limit waits for Groq's "retry-after" and
# tries again (the OpenAI client does this; up to a minute per wait).
GROQ_MAX_RETRIES = 4


class _GroqCompletions:

    def __init__(self, client: Any, model_effort: str):
        self._client = client
        self._reasoning_effort = model_effort

    def create(self, **request: Any) -> Any:
        # Ollama-only settings (context window, repeat penalty); Groq rejects them.
        request.pop("extra_body", None)
        # Only the gpt-oss models take a reasoning effort. Their thinking
        # counts towards max_tokens, so leave room for it.
        if self._reasoning_effort and "gpt-oss" in str(request.get("model", "")):
            request["reasoning_effort"] = self._reasoning_effort
            if "max_tokens" in request:
                request["max_tokens"] += 1024
        return self._client.chat.completions.create(**request)


class GroqClient:
    """Looks like the OpenAI client the pipelines use; sends requests to Groq."""

    def __init__(self, api_key: str, reasoning_effort: str = "low", client: Any = None):
        openai_client = client or OpenAI(
            base_url=GROQ_OPENAI_BASE_URL, api_key=api_key, timeout=120.0, max_retries=GROQ_MAX_RETRIES
        )
        self.chat = SimpleNamespace(completions=_GroqCompletions(openai_client, reasoning_effort))


def groq_from_env() -> Optional[tuple[GroqClient, str]]:
    """(client, model name), or None when GROQ_API_KEY isn't set."""

    api_key = os.getenv("GROQ_API_KEY", "").strip().strip('"')
    if not api_key:
        return None
    model = os.getenv("GROQ_MODEL", "").strip().strip('"') or DEFAULT_GROQ_MODEL
    effort = os.getenv("GROQ_REASONING_EFFORT", "low").strip().strip('"').lower()
    return GroqClient(api_key, reasoning_effort=effort), model


def use_model(pipeline: Any, client: Any, model: str) -> Any:
    """Point an existing pipeline (Language, Perception, Reasoning) at another model."""

    pipeline.client = client
    pipeline.model = model
    return pipeline
