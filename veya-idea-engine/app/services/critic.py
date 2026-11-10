"""Stage 9: an independent critic that tries to reject the idea."""

from app.prompts.stages import CRITIC_SYSTEM
from app.schemas.ideas import CRITERIA, Critique, EvaluatedIdea
from app.schemas.session import DiscoverySession
from app.services.context import EngineContext
from app.services.evidence_format import format_evidence
from app.services.feasibility_analyzer import idea_text


def critic_input(ctx: EngineContext, session: DiscoverySession, evaluated: EvaluatedIdea) -> str:
    idea = evaluated.idea
    gap = next((g for g in session.gaps if g.gap_id == idea.gap_id), None)
    parts = [ctx.profile_text(session), f"IDEA:\n{idea_text(idea)}\nDifferentiator: {idea.differentiator}"]
    if gap:
        parts.append(
            f"GAP {gap.gap_id} ({gap.evidence_strength} evidence, confidence {gap.confidence}, status {gap.status}): "
            f"{gap.gap_title}\n{gap.description}"
            + ("\nCounter-evidence: " + "; ".join(c.statement for c in gap.contradicting_evidence) if gap.contradicting_evidence else "")
            + ("\nUnverified assumptions: " + "; ".join(gap.unverified_assumptions) if gap.unverified_assumptions else "")
        )
    if evaluated.feasibility:
        f = evaluated.feasibility
        parts.append(f"FEASIBILITY: {f.verdict} ({f.feasibility_score}/10). Blockers: {'; '.join(f.blockers) or 'none'}. "
                     f"Data: {f.dataset_availability or 'unknown'}. Safety: {'; '.join(f.safety_or_regulatory_notes) or 'none'}")
    if evaluated.similarity:
        s = evaluated.similarity
        parts.append(f"SIMILARITY: {s.label_text}. {s.explanation}")
    ids = [ref.evidence_id for ref in idea.supporting_evidence]
    parts.append(f"SOURCES:\n{format_evidence(ctx.evidence_by_ids(session, ids)[:15], excerpt_chars=250)}")
    return "\n\n".join(parts) + "\n\nChallenge this idea."


async def critique_idea(ctx: EngineContext, session: DiscoverySession, evaluated: EvaluatedIdea) -> Critique:
    critique = await ctx.ask(CRITIC_SYSTEM, critic_input(ctx, session, evaluated), Critique)
    critique.scores = {name: critique.scores.get(name, 5.0) for name in CRITERIA}
    if critique.verdict == "revise" and not critique.revision_instructions:
        critique.revision_instructions = critique.issues or [critique.strongest_rejection_reason or "Strengthen the idea."]
    return critique
