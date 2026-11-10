"""
Stage 10: transparent scoring and final selection.

The score combines the critic's 0–10 ratings with signals the engine measured
itself (evidence count, similarity label, feasibility). Every contribution is
returned so the student can see why an idea ranked where it did. The score is
a ranking aid, not a measure of novelty. Weak ideas are never used as filler.
"""

from app.schemas.gaps import Gap
from app.schemas.ideas import EvaluatedIdea, ScoreBreakdown

# Upper bound on "differentiation" for each similarity label.
DIFFERENTIATION_CAP = {
    "strongly_differentiated": 10.0,
    "potentially_differentiated": 7.5,
    "insufficient_evidence": 6.0,
    "significant_existing_overlap": 3.5,
}
GAP_STRENGTH_SCORE = {"strong": 9.0, "moderate": 7.0, "weak": 4.5, "insufficient": 1.5}


def score_idea(evaluated: EvaluatedIdea, gap: Gap | None, weights: dict[str, float]) -> tuple[float, list[ScoreBreakdown]]:
    critic = evaluated.critique.scores if evaluated.critique else {}
    values: dict[str, tuple[float, str]] = {}

    for criterion in ("problem_relevance", "impact", "learning_value", "prototype_clarity"):
        values[criterion] = (critic.get(criterion, 5.0), "critic rating")

    measured = GAP_STRENGTH_SCORE[gap.evidence_strength] if gap else 1.5
    if gap and gap.status == "weakened":
        measured -= 2.0
    values["evidence_strength"] = (
        round((critic.get("evidence_strength", 5.0) + measured) / 2, 2),
        f"average of critic rating and gap evidence ({gap.evidence_strength if gap else 'none'}"
        f"{', weakened by counter-evidence' if gap and gap.status == 'weakened' else ''})",
    )

    label = evaluated.similarity.label if evaluated.similarity else "insufficient_evidence"
    cap = DIFFERENTIATION_CAP[label]
    values["differentiation"] = (min(critic.get("differentiation", 5.0), cap), f"critic rating, capped at {cap} ({label})")

    if evaluated.feasibility:
        feasibility = round((critic.get("feasibility", 5.0) + evaluated.feasibility.feasibility_score) / 2, 2)
        values["feasibility"] = (feasibility, f"average of critic rating and feasibility analysis ({evaluated.feasibility.verdict})")
    else:
        values["feasibility"] = (critic.get("feasibility", 5.0), "critic rating")

    breakdown = []
    for criterion, weight in weights.items():
        score, basis = values.get(criterion, (5.0, "default"))
        score = max(0.0, min(10.0, score))
        breakdown.append(ScoreBreakdown(criterion=criterion, score_0_10=round(score, 2), weight=round(weight, 3),
                                        contribution=round(score * weight * 10, 2), basis=basis))
    return round(sum(item.contribution for item in breakdown), 1), breakdown


def rejection_reason(evaluated: EvaluatedIdea, min_score: float) -> str | None:
    if evaluated.critique and evaluated.critique.verdict == "reject":
        return f"Rejected by the critic: {evaluated.critique.strongest_rejection_reason or 'fundamental weakness'}"
    if evaluated.critique and evaluated.critique.verdict == "revise":
        return "Still had unresolved issues after the maximum number of critic rounds."
    if evaluated.feasibility and evaluated.feasibility.verdict == "not_feasible":
        return "Not feasible for this student's skills, budget or deadline."
    if evaluated.score is not None and evaluated.score < min_score:
        return f"Score {evaluated.score} is below the minimum of {min_score}."
    return None


def selection_reason(evaluated: EvaluatedIdea) -> str:
    top = sorted(evaluated.score_breakdown, key=lambda item: -item.contribution)[:2]
    parts = [f"scored {evaluated.score}/100", "strongest on " + " and ".join(item.criterion.replace("_", " ") for item in top)]
    if evaluated.similarity:
        parts.append(evaluated.similarity.label_text.lower())
    if evaluated.feasibility:
        parts.append(f"feasibility: {evaluated.feasibility.verdict.replace('_', ' ')}")
    return "Selected: " + "; ".join(parts) + "."


def rank_and_select(ideas: list[EvaluatedIdea], gaps: list[Gap], weights: dict[str, float], min_score: float, max_final: int) -> None:
    """Score every evaluated idea, then mark the best (at most max_final) as selected. Never pads the list."""
    by_gap = {gap.gap_id: gap for gap in gaps}
    for evaluated in ideas:
        if evaluated.critique is None:
            evaluated.status = "rejected"
            evaluated.rejection_reason = evaluated.rejection_reason or "Could not be evaluated."
            continue
        evaluated.score, evaluated.score_breakdown = score_idea(evaluated, by_gap.get(evaluated.idea.gap_id or ""), weights)
        evaluated.status = "candidate"
        evaluated.rejection_reason = None
        evaluated.selection_reason = None

    eligible = [e for e in ideas if e.status != "rejected" and rejection_reason(e, min_score) is None]
    eligible.sort(key=lambda e: -(e.score or 0))
    selected = {id(e) for e in eligible[:max_final]}
    for evaluated in ideas:
        if id(evaluated) in selected:
            evaluated.status = "selected"
            evaluated.rejection_reason = None
            evaluated.selection_reason = selection_reason(evaluated)
        elif evaluated.status != "rejected":
            reason = rejection_reason(evaluated, min_score)
            evaluated.status = "rejected"
            evaluated.rejection_reason = reason or "Ranked below the top ideas."
