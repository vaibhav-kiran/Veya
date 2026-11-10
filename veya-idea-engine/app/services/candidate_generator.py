"""Stage 6: candidate ideas, generated only from investigated gaps; and revisions of an idea."""

import uuid

from app.prompts.stages import CANDIDATE_SYSTEM, REVISION_SYSTEM
from app.schemas.gaps import Gap
from app.schemas.ideas import CandidateDraft, CandidateDrafts, CandidateIdea
from app.schemas.session import DiscoverySession
from app.services.context import EngineContext
from app.services.evidence_format import format_evidence


def new_idea_id() -> str:
    return f"idea_{uuid.uuid4().hex[:12]}"


def describe_gaps(session: DiscoverySession, gaps: list[Gap]) -> str:
    problems = {p.problem_id: p for p in session.problems}
    landscapes = {l.problem_id: l for l in session.landscapes}
    blocks = []
    for gap in gaps:
        problem = problems.get(gap.problem_id)
        landscape = landscapes.get(gap.problem_id)
        existing = ", ".join(s.solution_name for s in landscape.solutions[:6]) if landscape else ""
        blocks.append(
            f"{gap.gap_id} [{gap.gap_type}, evidence {gap.evidence_strength}, confidence {gap.confidence}"
            f"{', WEAKENED by counter-evidence' if gap.status == 'weakened' else ''}] {gap.gap_title}\n"
            f"  problem: {problem.problem_title if problem else gap.problem_id}\n  {gap.description}\n"
            f"  evidence: " + "; ".join(f"{c.statement} [{', '.join(c.evidence_ids)}]" for c in gap.supporting_evidence)
            + (f"\n  existing solutions: {existing}" if existing else "")
        )
    return "\n\n".join(blocks)


def gap_evidence_ids(gap: Gap | None) -> list[str]:
    return [i for c in gap.supporting_evidence for i in c.evidence_ids] if gap else []


def to_idea(ctx: EngineContext, session: DiscoverySession, draft: CandidateDraft, gap: Gap, idea_id: str, revision: int) -> CandidateIdea:
    claims = ctx.evidence.validate_claims(session.session_id, draft.supporting_claims)
    ids = [*(i for c in claims for i in c.evidence_ids), *gap_evidence_ids(gap)]
    data = draft.model_dump(exclude={"supporting_claims", "gap_id"})
    return CandidateIdea(
        **data,
        gap_id=gap.gap_id,
        supporting_claims=claims,
        idea_id=idea_id,
        session_id=session.session_id,
        revision=revision,
        supporting_evidence=ctx.evidence.refs(session.session_id, list(dict.fromkeys(ids))),
    )


async def generate_candidates(ctx: EngineContext, session: DiscoverySession, gaps: list[Gap]) -> list[CandidateIdea]:
    by_id = {gap.gap_id: gap for gap in gaps}
    ids = list(dict.fromkeys(i for gap in gaps for i in gap_evidence_ids(gap)))
    user = (
        f"{ctx.profile_text(session)}\n\nINVESTIGATED GAPS:\n{describe_gaps(session, gaps)}\n\n"
        f"SOURCES:\n{format_evidence(ctx.evidence_by_ids(session, ids)[:25], excerpt_chars=250)}\n\n"
        "Generate the candidate project ideas."
    )
    system = CANDIDATE_SYSTEM.format(max_candidates=ctx.settings.max_candidates)
    drafts = await ctx.ask(system, user, CandidateDrafts)

    ideas, titles = [], set()
    for draft in drafts.candidates:
        gap = by_id.get((draft.gap_id or "").strip().upper()) or (gaps[0] if len(gaps) == 1 else None)
        title = draft.title.strip()
        if gap is None or not title or title.lower() in titles:
            continue  # ideas must come from an investigated gap
        titles.add(title.lower())
        ideas.append(to_idea(ctx, session, draft, gap, new_idea_id(), 0))
        if len(ideas) >= ctx.settings.max_candidates:
            break
    return ideas


async def revise_idea(
    ctx: EngineContext, session: DiscoverySession, idea: CandidateIdea, instructions: list[str]
) -> CandidateIdea:
    gap = next((g for g in session.gaps if g.gap_id == idea.gap_id), None)
    if gap is None:
        return idea
    current = idea.model_dump(exclude={"idea_id", "session_id", "revision", "supporting_evidence"})
    user = (
        f"{ctx.profile_text(session)}\n\nGAP:\n{describe_gaps(session, [gap])}\n\n"
        f"CURRENT IDEA:\n{CandidateDraft.model_validate(current).model_dump_json(indent=1)}\n\n"
        "FIX THESE PROBLEMS:\n- " + "\n- ".join(instructions)
        + f"\n\nSOURCES:\n{format_evidence(ctx.evidence_by_ids(session, gap_evidence_ids(gap))[:15], excerpt_chars=250)}"
    )
    draft = await ctx.ask(REVISION_SYSTEM, user, CandidateDraft)
    return to_idea(ctx, session, draft, gap, idea.idea_id, idea.revision + 1)
