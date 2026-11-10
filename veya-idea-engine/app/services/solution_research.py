"""
Stage 4: for each problem, find what already exists (GitHub, papers, products)
and what its documented limitations are.

Adaptive steps:
- the most relevant GitHub repositories get a README read and their open issues
  checked (open issues are *reported* limitations, not verified ones);
- if a paper reports a limitation, newer papers are searched to see whether it
  has been addressed since.
"""

import asyncio
from datetime import date

from app.prompts.stages import SOLUTION_SYSTEM
from app.schemas.evidence import Evidence
from app.schemas.research import ExistingSolution, Problem, SolutionAnalysis, SolutionLandscape
from app.schemas.session import DiscoverySession
from app.services.context import EngineContext
from app.services.evidence_format import format_evidence, unique

REPOS_TO_INSPECT = 2
NEWER_WORK_YEARS = 3


def search_terms(problem: Problem) -> str:
    words = problem.problem_title
    if problem.domain and problem.domain.lower() not in words.lower():
        words += f" {problem.domain}"
    return words


async def research_solutions(ctx: EngineContext, session: DiscoverySession, problem: Problem) -> SolutionLandscape:
    terms = search_terms(problem)
    batches = await asyncio.gather(
        ctx.tools.repositories(session, terms),
        ctx.tools.papers(session, terms),
        ctx.tools.web(session, f"existing tools products solutions for {terms}"),
    )
    repos = [item for item in batches[0] if item.source_type == "github_repository"]
    details: list[Evidence] = []
    # Inspect the most-starred repositories more closely.
    for repo in sorted(repos, key=lambda r: -(r.metadata.get("stars") or 0))[:REPOS_TO_INSPECT]:
        details += await ctx.tools.repository_details(session, repo)

    found = unique([*batches[0], *batches[1], *batches[2], *details])
    prior = ctx.evidence_by_ids(session, [ref.evidence_id for ref in problem.source_references])
    user = (
        f"{ctx.profile_text(session)}\n\nPROBLEM {problem.problem_id}: {problem.problem_title}\n{problem.description}\n\n"
        f"SOURCES:\n{format_evidence(unique([*prior, *found])[:30])}\n\nMap the existing solutions."
    )
    analysis = await ctx.ask(SOLUTION_SYSTEM, user, SolutionAnalysis)
    landscape = to_landscape(ctx, session, problem, analysis, [item.evidence_id for item in found])

    # Adaptive: a reported limitation in research -> look for newer work that may have fixed it.
    if analysis.newer_work_query:
        since = f"{date.today().year - NEWER_WORK_YEARS}-01-01"
        newer = await ctx.tools.papers(session, analysis.newer_work_query, from_date=since)
        landscape.newer_work = ctx.evidence.refs(session.session_id, [item.evidence_id for item in newer])
        landscape.evidence_ids += [item.evidence_id for item in newer if item.evidence_id not in landscape.evidence_ids]
    return landscape


def to_landscape(
    ctx: EngineContext, session: DiscoverySession, problem: Problem, analysis: SolutionAnalysis, evidence_ids: list[str]
) -> SolutionLandscape:
    solutions = []
    for draft in analysis.solutions:
        ids = ctx.evidence.known_ids(session.session_id, [draft.evidence_id] if draft.evidence_id else [])
        source = ctx.evidence.get(session.session_id, ids[0]) if ids else None
        solutions.append(
            ExistingSolution(
                solution_name=draft.solution_name.strip(),
                solution_type=draft.solution_type,
                description=draft.description,
                # The URL always comes from the stored evidence, never from the model.
                source_url=source.url if source else None,
                evidence_id=source.evidence_id if source else None,
                technology_stack=draft.technology_stack,
                features=draft.features,
                target_users=draft.target_users,
                hardware_requirements=draft.hardware_requirements,
                documented_limitations=ctx.evidence.validate_claims(session.session_id, draft.documented_limitations),
                cost_information=draft.cost_information,
                last_updated=(source.metadata.get("last_pushed") or source.published_date) if source else None,
            )
        )
    return SolutionLandscape(
        problem_id=problem.problem_id,
        solutions=solutions,
        already_solved=analysis.already_solved,
        served_users=analysis.served_users,
        common_technologies=analysis.common_technologies,
        uncertain_limitations=analysis.uncertain_limitations,
        unsuitable_approaches=analysis.unsuitable_approaches,
        evidence_ids=list(dict.fromkeys([*(r.evidence_id for r in problem.source_references), *evidence_ids])),
    )
