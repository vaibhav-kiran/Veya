"""Everything a pipeline stage needs, passed around as one object."""

import json
from dataclasses import dataclass
from typing import TypeVar

from pydantic import BaseModel

from app.core.config import Settings
from app.core.llm_client import LLMClient, generate_structured
from app.prompts.common import profile_block
from app.repositories.evidence_repository import EvidenceRepository
from app.schemas.evidence import Evidence
from app.schemas.session import DiscoverySession
from app.services.research_tools import ResearchToolkit

Model = TypeVar("Model", bound=BaseModel)


@dataclass
class EngineContext:
    settings: Settings
    llm: LLMClient
    evidence: EvidenceRepository
    tools: ResearchToolkit

    async def ask(self, system: str, user: str, model: type[Model]) -> Model:
        return await generate_structured(self.llm, system, user, model, max_attempts=self.settings.llm_max_attempts)

    def profile_text(self, session: DiscoverySession) -> str:
        profile = session.profile.model_dump(exclude_none=True, exclude_defaults=True)
        return profile_block(json.dumps(profile, ensure_ascii=False, indent=1), session.review.assumptions)

    def evidence_by_ids(self, session: DiscoverySession, ids: list[str]) -> list[Evidence]:
        items = [self.evidence.get(session.session_id, evidence_id) for evidence_id in ids]
        return [item for item in items if item is not None]
