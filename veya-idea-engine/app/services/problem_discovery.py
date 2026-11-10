"""
Stage 3: search news, the web, GitHub issues and papers, then extract REAL
problems. A problem is kept only if the model ties it to evidence that exists.
"""

import asyncio
from urllib.parse import urlparse

from app.prompts.stages import PROBLEM_SYSTEM
from app.schemas.evidence import Evidence
from app.schemas.research import Problem, ProblemExtraction
from app.schemas.session import DiscoverySession
from app.services.context import EngineContext
from app.services.evidence_format import format_evidence, unique

MAX_EVIDENCE_IN_PROMPT = 30


def independent_sources(items: list[Evidence]) -> int:
    """Count distinct publishers (web domains / repositories / papers) rather than raw results."""
    keys = set()
    for item in items:
        if item.source_type in {"github_repository", "github_issue"}:
            keys.add(str(item.metadata.get("full_name") or item.url).split("#")[0].lower())
        elif item.source_type == "academic_paper":
            keys.add(item.url.lower())
        else:
            keys.add(urlparse(item.url).netloc.lower().removeprefix("www."))
    return len(keys)


async def gather_problem_evidence(
    ctx: EngineContext, session: DiscoverySession, web_queries: list[str], academic_queries: list[str], github_queries: list[str]
) -> list[Evidence]:
    jobs = []
    for query in web_queries:
        jobs.append(ctx.tools.web(session, query))
        jobs.append(ctx.tools.web(session, query, topic="news"))
    jobs += [ctx.tools.papers(session, query) for query in academic_queries]
    # GitHub issues are first-hand reports of problems with existing tools.
    jobs += [ctx.tools.issues(session, query) for query in github_queries[:2]]
    results = await asyncio.gather(*jobs)
    return unique([item for batch in results for item in batch])


async def extract_problems(
    ctx: EngineContext, session: DiscoverySession, found: list[Evidence], start_index: int
) -> list[Problem]:
    if not found:
        return []
    known = "\n".join(f"- {p.problem_title}" for p in session.problems) or "(none)"
    system = PROBLEM_SYSTEM.format(max_problems=ctx.settings.max_problems)
    user = (
        f"{ctx.profile_text(session)}\n\nPROBLEMS ALREADY FOUND (do not repeat):\n{known}\n\n"
        f"SOURCES:\n{format_evidence(found[:MAX_EVIDENCE_IN_PROMPT])}\n\nExtract the real problems."
    )
    extraction = await ctx.ask(system, user, ProblemExtraction)

    existing_titles = {p.problem_title.strip().lower() for p in session.problems}
    problems: list[Problem] = []
    for draft in extraction.problems:
        ids = ctx.evidence.known_ids(session.session_id, [*draft.evidence_ids, *(i for c in draft.impact_claims for i in c.evidence_ids)])
        title = draft.problem_title.strip()
        if not ids or not title or title.lower() in existing_titles:
            continue  # a problem nobody reported is not a confirmed problem
        existing_titles.add(title.lower())
        problems.append(
            Problem(
                problem_id=f"P{start_index + len(problems) + 1}",
                problem_title=title,
                description=draft.description.strip(),
                affected_users=draft.affected_users,
                domain=draft.domain,
                geographical_context=draft.geographical_context,
                source_references=ctx.evidence.refs(session.session_id, ids),
                frequency_or_impact_evidence=ctx.evidence.validate_claims(session.session_id, draft.impact_claims),
                initial_relevance=draft.initial_relevance,
                unanswered_questions=draft.unanswered_questions,
                independent_source_count=independent_sources(ctx.evidence_by_ids(session, ids)),
            )
        )
        if len(session.problems) + len(problems) >= ctx.settings.max_problems:
            break
    # Problems backed by several independent sources first.
    order = {"high": 0, "medium": 1, "low": 2}
    problems.sort(key=lambda p: (-min(p.independent_source_count, 3), order[p.initial_relevance]))
    for index, problem in enumerate(problems):
        problem.problem_id = f"P{start_index + index + 1}"
    return problems
