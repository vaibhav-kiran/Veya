"""
Stage 5: find potential gaps, then actively look for evidence AGAINST each one.

Each gap's `contradiction_query` is searched. If the results show the gap is
already addressed, the gap is weakened or discarded. An empty search is never
treated as proof that no solution exists.
"""

import asyncio

from app.prompts.stages import CONTRADICTION_SYSTEM, GAP_SYSTEM
from app.schemas.evidence import Claim
from app.schemas.gaps import ContradictionCheck, Gap, GapDraft, GapDrafts
from app.schemas.research import Problem, SolutionLandscape
from app.schemas.session import DiscoverySession
from app.services.context import EngineContext
from app.services.evidence_format import format_evidence, unique

MAX_GAPS = 6
NO_COUNTER_EVIDENCE = "The counter-evidence search found nothing relevant; that is not proof that no solution exists."


def describe_landscape(problem: Problem, landscape: SolutionLandscape | None) -> str:
    lines = [f"PROBLEM {problem.problem_id}: {problem.problem_title} — {problem.description}"]
    if landscape:
        for solution in landscape.solutions[:8]:
            limits = "; ".join(f"{c.statement} [{', '.join(c.evidence_ids)}]" for c in solution.documented_limitations)
            lines.append(f"  existing: {solution.solution_name} ({solution.solution_type}, {solution.evidence_id or 'no source'})"
                         f"{' — limitations: ' + limits if limits else ''}")
        if landscape.already_solved:
            lines.append("  already solved: " + "; ".join(landscape.already_solved))
        if landscape.uncertain_limitations:
            lines.append("  uncertain: " + "; ".join(landscape.uncertain_limitations))
        if landscape.newer_work:
            lines.append("  newer work: " + ", ".join(ref.evidence_id for ref in landscape.newer_work))
    return "\n".join(lines)


def evidence_strength(claims: list[Claim]) -> tuple[str, float]:
    """Strength from how many distinct real sources support the gap."""
    sourced = {i for c in claims if c.status in {"verified_fact", "reported_limitation"} for i in c.evidence_ids}
    inferred = {i for c in claims if c.status == "supported_inference" for i in c.evidence_ids} - sourced
    points = len(sourced) + 0.5 * len(inferred)
    if points >= 3:
        return "strong", 0.75
    if points >= 2:
        return "moderate", 0.6
    if points >= 1:
        return "weak", 0.4
    return "insufficient", 0.15


async def find_gaps(
    ctx: EngineContext, session: DiscoverySession, problems: list[Problem], start_index: int
) -> list[Gap]:
    landscapes = {landscape.problem_id: landscape for landscape in session.landscapes}
    ids = [i for p in problems for i in (landscapes[p.problem_id].evidence_ids if p.problem_id in landscapes else
                                         [r.evidence_id for r in p.source_references])]
    sources = ctx.evidence_by_ids(session, list(dict.fromkeys(ids)))
    user = (
        f"{ctx.profile_text(session)}\n\n" + "\n\n".join(describe_landscape(p, landscapes.get(p.problem_id)) for p in problems)
        + f"\n\nSOURCES:\n{format_evidence(sources[:35], excerpt_chars=300)}\n\nIdentify the potential gaps."
    )
    drafts = await ctx.ask(GAP_SYSTEM, user, GapDrafts)
    valid_problems = {p.problem_id for p in problems}

    gaps: list[Gap] = []
    for draft in drafts.gaps:
        if draft.problem_id not in valid_problems:
            if len(problems) != 1:
                continue
            draft.problem_id = problems[0].problem_id
        gaps.append(await challenge_gap(ctx, session, draft, f"G{start_index + len(gaps) + 1}"))
        if len(gaps) >= MAX_GAPS:
            break
    return gaps


async def challenge_gap(ctx: EngineContext, session: DiscoverySession, draft: GapDraft, gap_id: str) -> Gap:
    supporting = ctx.evidence.validate_claims(session.session_id, draft.supporting_claims)
    strength, confidence = evidence_strength(supporting)
    gap = Gap(
        gap_id=gap_id,
        problem_id=draft.problem_id,
        gap_title=draft.gap_title.strip(),
        gap_type=draft.gap_type,
        description=draft.description.strip(),
        existing_approaches=draft.existing_approaches,
        supporting_evidence=supporting,
        evidence_strength=strength,
        confidence=confidence,
        unverified_assumptions=draft.unverified_assumptions,
        further_research_required=draft.further_research_required,
    )

    query = (draft.contradiction_query or f"{draft.gap_title} existing solution").strip()
    jobs = [ctx.tools.repositories(session, query), ctx.tools.web(session, query)]
    if draft.gap_type == "research":
        jobs.append(ctx.tools.papers(session, query))
    counter = unique([item for batch in await asyncio.gather(*jobs) for item in batch])
    if not counter:
        gap.further_research_required.append(NO_COUNTER_EVIDENCE)
        return gap

    user = (
        f"GAP: {gap.gap_title}\n{gap.description}\nSupporting claims:\n"
        + "\n".join(f"- {c.statement} [{', '.join(c.evidence_ids)}]" for c in supporting)
        + f"\n\nNEW SEARCH RESULTS (query: {query}):\n{format_evidence(counter[:10])}\n\nDo these results contradict the gap?"
    )
    check = await ctx.ask(CONTRADICTION_SYSTEM, user, ContradictionCheck)
    contradicting = ctx.evidence.known_ids(session.session_id, check.contradicting_evidence_ids)
    if check.contradicted and contradicting:
        gap.contradicting_evidence = [Claim(statement=check.explanation or "Existing work appears to address this gap.",
                                            status="contradicted_claim", evidence_ids=contradicting)]
        gap.confidence = round(min(gap.confidence, check.revised_confidence), 2)
        gap.status = "discarded" if gap.confidence < 0.3 else "weakened"
    elif check.contradicted:
        # The model claimed a contradiction without citing a real source: note it, don't act on it.
        gap.unverified_assumptions.append(f"Possible existing coverage (unverified): {check.explanation}")
    else:
        gap.further_research_required.append(NO_COUNTER_EVIDENCE if not check.explanation else
                                             f"Counter-evidence check: {check.explanation}")
    return gap


def usable_gaps(gaps: list[Gap]) -> list[Gap]:
    return [gap for gap in gaps if gap.status != "discarded" and gap.evidence_strength != "insufficient"]
