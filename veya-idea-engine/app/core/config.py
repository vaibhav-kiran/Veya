"""
Service configuration, read once from environment variables (.env).

Nothing here depends on the main Veya backend or on absolute paths, so the
service runs the same on any machine.
"""

import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parents[2]

# Only this service's own .env (never a parent project's).
load_dotenv(PROJECT_ROOT / ".env")


def _int(name: str, default: int) -> int:
    value = os.getenv(name, "").strip()
    return int(value) if value else default


def _float(name: str, default: float) -> float:
    value = os.getenv(name, "").strip()
    return float(value) if value else default


def _str(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip()


DEFAULT_WEIGHTS = {
    "problem_relevance": 0.20,
    "evidence_strength": 0.20,
    "differentiation": 0.15,
    "feasibility": 0.20,
    "impact": 0.10,
    "learning_value": 0.10,
    "prototype_clarity": 0.05,
}


def _weights() -> dict[str, float]:
    """RANKING_WEIGHTS=problem_relevance:0.2,evidence_strength:0.2,... (missing keys keep defaults)."""
    weights = dict(DEFAULT_WEIGHTS)
    raw = _str("RANKING_WEIGHTS")
    for part in filter(None, (p.strip() for p in raw.split(","))):
        key, _, value = part.partition(":")
        if key.strip() in weights and value.strip():
            weights[key.strip()] = float(value)
    total = sum(weights.values()) or 1.0
    return {key: value / total for key, value in weights.items()}


@dataclass(frozen=True)
class Settings:
    # ---- language model (OpenAI-compatible endpoint; Ollama by default) ----
    llm_provider: str = field(default_factory=lambda: _str("LLM_PROVIDER", "ollama"))
    llm_base_url: str = field(default_factory=lambda: _str("OLLAMA_BASE_URL", "http://localhost:11434/v1"))
    llm_model: str = field(default_factory=lambda: _str("OLLAMA_MODEL", "qwen2.5:7b"))
    llm_api_key: str = field(default_factory=lambda: _str("OLLAMA_API_KEY", "ollama"))
    llm_timeout_seconds: float = field(default_factory=lambda: _float("LLM_TIMEOUT_SECONDS", 180.0))
    llm_max_attempts: int = field(default_factory=lambda: _int("LLM_MAX_ATTEMPTS", 3))

    # ---- research sources ----
    web_search_provider: str = field(default_factory=lambda: _str("WEB_SEARCH_PROVIDER", "tavily"))
    tavily_api_key: str = field(default_factory=lambda: _str("TAVILY_API_KEY"))
    github_token: str = field(default_factory=lambda: _str("GITHUB_TOKEN"))
    openalex_email: str = field(default_factory=lambda: _str("OPENALEX_EMAIL"))
    openalex_api_key: str = field(default_factory=lambda: _str("OPENALEX_API_KEY"))
    semantic_scholar_enabled: bool = field(default_factory=lambda: _str("SEMANTIC_SCHOLAR_ENABLED", "false").lower() == "true")
    semantic_scholar_api_key: str = field(default_factory=lambda: _str("SEMANTIC_SCHOLAR_API_KEY"))
    # "live" calls the real APIs; "mock" uses built-in sample data (clearly labelled).
    research_mode: str = field(default_factory=lambda: _str("RESEARCH_MODE", "live"))
    http_timeout_seconds: float = field(default_factory=lambda: _float("HTTP_TIMEOUT_SECONDS", 20.0))

    # ---- research limits (keep API and model usage bounded) ----
    max_research_rounds: int = field(default_factory=lambda: _int("MAX_RESEARCH_ROUNDS", 3))
    max_problems: int = field(default_factory=lambda: _int("MAX_PROBLEMS", 4))
    max_candidates: int = field(default_factory=lambda: _int("MAX_CANDIDATES", 8))
    max_final_ideas: int = field(default_factory=lambda: _int("MAX_FINAL_IDEAS", 3))
    max_critic_rounds: int = field(default_factory=lambda: _int("MAX_CRITIC_ROUNDS", 2))
    max_search_results_per_query: int = field(default_factory=lambda: _int("MAX_SEARCH_RESULTS_PER_QUERY", 5))
    max_queries_per_source: int = field(default_factory=lambda: _int("MAX_QUERIES_PER_SOURCE", 3))
    min_final_score: float = field(default_factory=lambda: _float("MIN_FINAL_SCORE", 55.0))

    ranking_weights: dict[str, float] = field(default_factory=_weights)

    # ---- storage ----
    database_path: str = field(default_factory=lambda: _str("DATABASE_PATH", str(PROJECT_ROOT / "data" / "idea_engine.db")))


def get_settings() -> Settings:
    return Settings()
