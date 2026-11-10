"""FastAPI entry point: uvicorn app.main:app --port 8100"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.api.dependencies import build_engine
from app.api.routes import discovery, health, ideas
from app.core.config import Settings, get_settings
from app.core.exceptions import (
    EngineError, IdeaNotFoundError, InvalidSessionStateError, LLMError, SessionNotFoundError,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

STATUS_CODES = {SessionNotFoundError: 404, IdeaNotFoundError: 404, InvalidSessionStateError: 409, LLMError: 503}


def create_app(settings: Settings | None = None, **engine_overrides) -> FastAPI:
    settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.engine = build_engine(settings, **engine_overrides)
        yield
        await app.state.engine.close()

    app = FastAPI(
        title="Veya Idea Discovery Engine",
        version="0.1.0",
        description="Research-driven discovery of evidence-backed project ideas for students.",
        lifespan=lifespan,
    )

    @app.exception_handler(EngineError)
    async def engine_error(_: Request, error: EngineError) -> JSONResponse:
        code = next((c for kind, c in STATUS_CODES.items() if isinstance(error, kind)), 502)
        return JSONResponse(status_code=code, content={"detail": error.user_message})

    app.include_router(health.router)
    app.include_router(discovery.router)
    app.include_router(ideas.router)
    return app


app = create_app()
