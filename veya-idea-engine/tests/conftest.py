import asyncio
import dataclasses

import pytest

from app.api.dependencies import build_engine
from app.core.config import Settings
from tests.fakes import FakeLLM, fake_sources


def make_settings(**changes) -> Settings:
    base = Settings()
    defaults = dict(
        database_path=":memory:", research_mode="live", max_research_rounds=2, max_problems=2,
        max_candidates=4, max_final_ideas=3, max_critic_rounds=2, min_final_score=55.0, llm_max_attempts=2,
    )
    return dataclasses.replace(base, **{**defaults, **changes})


@pytest.fixture
def make_engine():
    created = []

    def factory(llm: FakeLLM | None = None, sources: dict | None = None, **settings):
        engine = build_engine(make_settings(**settings), llm=llm or FakeLLM(), sources=sources or fake_sources())
        created.append(engine)
        return engine

    yield factory
    for engine in created:
        engine.database.connection.close()


def run_session(engine, profile: dict) -> "object":
    """Create a session and run the full pipeline synchronously (no background task)."""
    from app.schemas.student import StudentProfile

    async def go():
        session = engine.pipeline.create_session(StudentProfile.model_validate(profile))
        engine.pipeline.start(session.session_id)
        await asyncio.gather(*engine.pipeline._tasks)
        return engine.pipeline.get_session(session.session_id)

    return asyncio.run(go())


PROFILE = {
    "academic_field": "Biomedical engineering", "interests": ["healthcare", "embedded systems"],
    "technical_skills": ["Python", "Arduino"], "budget": "3000 rupees", "deadline": "8 weeks", "team_size": 2,
    "project_type": "final_year_project", "available_hardware": ["laptop", "ESP32"],
}
