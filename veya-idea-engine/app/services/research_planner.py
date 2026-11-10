"""Stage 2: turn the profile into a targeted research plan (domains, queries, priorities)."""

from app.prompts.stages import PLANNER_SYSTEM
from app.schemas.research import ResearchPlan
from app.schemas.session import DiscoverySession
from app.services.context import EngineContext


def _clean(queries: list[str], limit: int) -> list[str]:
    seen, result = set(), []
    for query in queries:
        text = " ".join(str(query).split())[:200]
        if len(text) >= 4 and text.lower() not in seen:
            seen.add(text.lower())
            result.append(text)
    return result[:limit]


def fallback_queries(session: DiscoverySession) -> list[str]:
    topics = session.profile.interests or session.profile.preferred_domains or [session.profile.academic_field or ""]
    return [f"{topic} problems challenges" for topic in topics if topic]


async def plan_research(ctx: EngineContext, session: DiscoverySession) -> ResearchPlan:
    plan = await ctx.ask(PLANNER_SYSTEM, ctx.profile_text(session) + "\n\nCreate the research plan.", ResearchPlan)
    limit = ctx.settings.max_queries_per_source
    plan.web_queries = _clean(plan.web_queries, limit) or _clean(fallback_queries(session), limit)
    plan.github_queries = _clean(plan.github_queries, limit)
    plan.academic_queries = _clean(plan.academic_queries, limit) or _clean(plan.research_keywords, limit)
    return plan


def follow_up_queries(session: DiscoverySession, used: set[str], limit: int) -> list[str]:
    """Queries for a further research round: categories and keywords not searched yet, then open questions."""
    plan = session.plan or ResearchPlan()
    pool = [*plan.problem_categories, *plan.research_keywords, *plan.domains]
    pool += [question for problem in session.problems for question in problem.unanswered_questions]
    return [query for query in _clean(pool, 50) if query.lower() not in used][:limit]
