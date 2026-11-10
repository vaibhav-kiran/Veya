"""
Stage 8: search again for the idea itself (with different terms) and compare.

Two signals: a lexical overlap score (transparent, reproducible) and the
model's reading of the closest matches, constrained to four labels. The
engine never claims an idea is verified as novel.
"""

import asyncio
import re

from app.prompts.stages import SIMILARITY_SYSTEM
from app.schemas.evidence import Evidence
from app.schemas.ideas import SIMILARITY_LABEL_TEXT, CandidateIdea, SimilarityAssessment, SimilarityJudgement, SimilarMatch
from app.schemas.session import DiscoverySession
from app.services.context import EngineContext
from app.services.evidence_format import format_evidence, unique

STOPWORDS = set("""a an and are as at be by for from has have in into is it its of on or that the this to with using based
low cost system app application tool platform smart device project students""".split())
HIGH_OVERLAP = 0.45
MAX_MATCHES = 5


def tokens(text: str) -> set[str]:
    return {word for word in re.findall(r"[a-z0-9]+", text.lower()) if len(word) > 2 and word not in STOPWORDS}


def overlap(a: set[str], b: set[str]) -> float:
    """Share of the idea's key words that the other text also contains."""
    return round(len(a & b) / len(a), 2) if a and b else 0.0


def idea_queries(idea: CandidateIdea) -> list[str]:
    tech = " ".join(idea.required_technologies[:2])
    users = idea.target_users[0] if idea.target_users else ""
    second = " ".join(f"{tech} {users} {idea.problem_statement[:80]}".split())
    return [idea.title, second]


async def check_similarity(ctx: EngineContext, session: DiscoverySession, idea: CandidateIdea) -> SimilarityAssessment:
    first, second = idea_queries(idea)
    batches = await asyncio.gather(
        ctx.tools.repositories(session, first), ctx.tools.web(session, first), ctx.tools.papers(session, second),
    )
    found = unique([item for batch in batches for item in batch])
    idea_words = tokens(f"{idea.title} {idea.problem_statement} {idea.proposed_solution} {' '.join(idea.target_users)}")
    scored: list[tuple[float, Evidence]] = sorted(
        ((overlap(idea_words, tokens(f"{item.title} {item.excerpt}")), item) for item in found), key=lambda pair: -pair[0]
    )
    closest = [(score, item) for score, item in scored if score > 0][:MAX_MATCHES]
    matches = [SimilarMatch(evidence=ctx.evidence.refs(session.session_id, [item.evidence_id])[0], lexical_overlap=score)
               for score, item in closest]

    if not closest:
        return SimilarityAssessment(
            label="insufficient_evidence", label_text=SIMILARITY_LABEL_TEXT["insufficient_evidence"],
            explanation="The follow-up searches returned nothing comparable. That does not mean nothing similar exists.",
        )

    user = (
        f"IDEA:\n{idea.title}\nProblem: {idea.problem_statement}\nSolution: {idea.proposed_solution}\n"
        f"Approach: {idea.technical_approach}\nClaimed differentiator: {idea.differentiator}\n\n"
        f"SIMILAR WORK FOUND:\n{format_evidence([item for _, item in closest])}\n\nCompare them."
    )
    judgement = await ctx.ask(SIMILARITY_SYSTEM, user, SimilarityJudgement)
    label = judgement.label
    # Guard: very high word overlap can't be "strongly differentiated" on the model's say-so.
    if label == "strongly_differentiated" and closest[0][0] >= HIGH_OVERLAP:
        label = "potentially_differentiated"
    return SimilarityAssessment(
        label=label,
        label_text=SIMILARITY_LABEL_TEXT[label],
        closest_matches=matches,
        differences=judgement.differences,
        explanation=judgement.explanation,
    )
