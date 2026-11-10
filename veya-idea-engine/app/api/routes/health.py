from fastapi import APIRouter, Depends

from app.api.dependencies import Engine, get_engine

router = APIRouter(tags=["health"])


@router.get("/health")
async def health(engine: Engine = Depends(get_engine)) -> dict:
    ping = getattr(engine.llm, "ping", None)
    model_ok = await ping() if ping else True
    warnings = []
    if engine.sources.get("web") == "none" or (engine.sources.get("web") == "tavily" and not engine.settings.tavily_api_key):
        warnings.append("Web search is not configured (set TAVILY_API_KEY); GitHub and OpenAlex are still used.")
    if engine.settings.research_mode == "mock":
        warnings.append("RESEARCH_MODE=mock: results use sample data, not real research.")
    if not model_ok:
        warnings.append(f"Model '{engine.settings.llm_model}' is not reachable at {engine.settings.llm_base_url}.")
    return {
        "status": "ok" if model_ok else "degraded",
        "model": engine.settings.llm_model,
        "model_reachable": model_ok,
        "research_mode": engine.settings.research_mode,
        "sources": engine.sources,
        "warnings": warnings,
    }
