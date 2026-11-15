"""The idea engine runs inside this backend: started with it, called in-process."""

import asyncio
from contextlib import AsyncExitStack

from fastapi import FastAPI
from fastapi.testclient import TestClient

import webapp.idea_engine as idea_engine
from webapp.auth import Authenticator
from webapp.innovator_routes import router


def test_engine_starts_in_process_and_answers(monkeypatch):
    monkeypatch.delenv("IDEA_ENGINE_URL", raising=False)

    async def run():
        async with AsyncExitStack() as stack:
            client = await idea_engine.start_engine(stack)
            assert client is not None
            assert str(client.base_url).startswith(idea_engine.IN_PROCESS_URL)
            response = await client.get("/health")
            assert response.status_code == 200
            return response.json()

    assert isinstance(asyncio.run(run()), dict)


def test_external_engine_url_is_used_when_set(monkeypatch):
    monkeypatch.setenv("IDEA_ENGINE_URL", "http://engine.example:8100/")

    async def run():
        async with AsyncExitStack() as stack:
            client = await idea_engine.start_engine(stack)
            return str(client.base_url)

    assert asyncio.run(run()).startswith("http://engine.example:8100")


def test_missing_engine_folder_turns_innovator_off(monkeypatch, tmp_path):
    monkeypatch.delenv("IDEA_ENGINE_URL", raising=False)
    monkeypatch.setattr(idea_engine, "ENGINE_DIR", tmp_path / "nowhere")

    async def run():
        async with AsyncExitStack() as stack:
            return await idea_engine.start_engine(stack)

    assert asyncio.run(run()) is None


def test_innovator_without_an_engine_says_so():
    app = FastAPI()
    app.include_router(router)
    app.state.authenticator = Authenticator(mode="header")
    response = TestClient(app).get("/innovator/ses_abc/status", headers={"X-Veya-User": "u1"})
    assert response.status_code == 503
    assert "isn't available" in response.json()["detail"]


# ---------------------------------------------------------------------------
# The research runs on the model picked in the app
# ---------------------------------------------------------------------------


class RecordingModel:
    def __init__(self):
        self.calls = 0

    async def complete(self, system: str, user: str, *, json_mode: bool = True) -> str:
        self.calls += 1
        return "{}"

    async def ping(self) -> bool:
        return True


def test_research_runs_on_the_model_picked_in_the_app(monkeypatch, tmp_path):
    import dataclasses

    import httpx

    monkeypatch.delenv("IDEA_ENGINE_URL", raising=False)
    idea_engine.load_engine_app()  # makes the engine's package importable
    from app.core.config import get_settings
    from app.main import create_app

    qwen, gemini = RecordingModel(), RecordingModel()
    switch = idea_engine.ModelSwitch(qwen, {"gemini": gemini})
    settings = dataclasses.replace(get_settings(), research_mode="mock", database_path=str(tmp_path / "engine.db"), llm_max_attempts=1)
    engine = create_app(settings, llm=switch)

    backend = FastAPI()
    backend.include_router(router)
    backend.state.authenticator = Authenticator(mode="header")

    async def run():
        async with engine.router.lifespan_context(engine):
            engine_client = httpx.AsyncClient(transport=httpx.ASGITransport(app=engine), base_url="http://idea-engine")
            engine_client.model_switch = switch
            backend.state.innovator_http = engine_client
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=backend), base_url="http://veya") as api:
                started = await api.post(
                    "/innovator/start",
                    json={"profile": {"interests": ["agriculture"]}, "model": "gemini"},
                    headers={"X-Veya-User": "u1"},
                )
                assert started.status_code == 201, started.text
                # Let the background research make its first model calls.
                for _ in range(50):
                    if gemini.calls:
                        break
                    await asyncio.sleep(0.05)

                unknown = await api.post(
                    "/innovator/start",
                    json={"profile": {"interests": ["x"]}, "model": "groq"},
                    headers={"X-Veya-User": "u1"},
                )
            await engine_client.aclose()
        return unknown

    unknown = asyncio.run(run())
    assert gemini.calls > 0 and qwen.calls == 0
    # A model that isn't set up is refused clearly.
    assert unknown.status_code == 503 and "GROQ_API_KEY" in unknown.json()["detail"]
