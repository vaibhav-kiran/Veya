"""
Stage 7: can THIS student build the idea? If data looks unavailable, search
for alternative datasets (adaptive step).
"""

import asyncio
import re

from app.prompts.stages import FEASIBILITY_SYSTEM
from app.schemas.ideas import CandidateIdea, FeasibilityAssessment
from app.schemas.session import DiscoverySession
from app.services.context import EngineContext
from app.services.evidence_format import unique

NO_DATA = re.compile(r"\b(unavailable|not available|no (public|open|existing) data|lack of data|scarce|hard to (get|obtain)|must be collected)\b", re.I)


def idea_text(idea: CandidateIdea) -> str:
    return idea.model_dump_json(
        include={"title", "problem_statement", "target_users", "proposed_solution", "technical_approach", "required_technologies",
                 "hardware_requirements", "software_requirements", "estimated_budget", "estimated_timeline", "prototype_scope", "risks"},
        indent=1,
    )


async def assess_feasibility(ctx: EngineContext, session: DiscoverySession, idea: CandidateIdea) -> FeasibilityAssessment:
    user = f"{ctx.profile_text(session)}\n\nIDEA:\n{idea_text(idea)}\n\nAssess whether this student can build it."
    assessment = await ctx.ask(FEASIBILITY_SYSTEM, user, FeasibilityAssessment)
    if NO_DATA.search(assessment.dataset_availability or ""):
        query = f"{idea.title} dataset"
        found = unique([item for batch in await asyncio.gather(ctx.tools.papers(session, query), ctx.tools.web(session, f"open dataset {idea.title}"))
                        for item in batch])
        assessment.dataset_leads = ctx.evidence.refs(session.session_id, [item.evidence_id for item in found[:5]])
    return assessment


def scope_reduction_instructions(assessment: FeasibilityAssessment) -> list[str]:
    """Used when an idea is not feasible: try a smaller, cheaper version once before giving up."""
    instructions = ["Reduce the scope so this student can build a credible prototype before the deadline."]
    instructions += [f"Remove or work around this blocker: {blocker}" for blocker in assessment.blockers[:3]]
    instructions.append("Prefer lower-cost hardware and free software or simulated data where possible.")
    return instructions
