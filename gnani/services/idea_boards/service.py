"""
Research what a board is for, and rate its ideas against that.

Hackathon: pages are gathered (sources.py), then the model extracts the
theme, tracks, judging criteria, dates, prizes and rules, citing pages by ID
only. Without official judging criteria, typical hackathon criteria are used
and labelled as such.

Other purposes use criteria that fit them (no web search): a college
project is judged differently from a startup or a personal project.

Rating: the model scores each idea per criterion (1-10) with a reason; the
total and the best idea are computed in code, so the ranking is transparent.
"""

import json
import logging
import re
from typing import Any

from pydantic import BaseModel, Field, ValidationError, field_validator

from services.idea_boards.schemas import (
    BoardContext,
    BoardRating,
    Criterion,
    CriterionScore,
    IdeaInput,
    IdeaRating,
    Source,
    ImprovePlan,
    Improvement,
)
from services.idea_boards.sources import Gathered, gather
from services.idea_check.schemas import IdeaCheck
from services.language_layer.language_pipeline import strip_code_fence

logger = logging.getLogger(__name__)


class BoardError(RuntimeError):
    """Research or rating failed; the message is safe to show."""


# =========================================================
# CRITERIA FOR EACH PURPOSE
# =========================================================

TYPICAL_HACKATHON_CRITERIA = [
    Criterion(name="Innovation", description="How original the idea is compared with what already exists."),
    Criterion(name="Technical complexity", description="How technically impressive and well built the solution is."),
    Criterion(name="Impact", description="How much the problem matters and how many people it helps."),
    Criterion(name="Theme fit", description="How well it fits the hackathon's theme and tracks."),
    Criterion(name="Feasibility of a demo", description="Whether a working demo can be built in the hackathon time."),
    Criterion(name="Presentation", description="How clearly the idea can be explained and shown to judges."),
]

PURPOSE_PRESETS: dict[str, dict[str, Any]] = {
    "college_project": {
        "name": "College project",
        "summary": "Ideas for a college or final-year project, judged the way faculty and external examiners usually evaluate projects.",
        "criteria": [
            Criterion(name="Problem relevance", description="A real, well-defined problem with a clear user or societal need.", weight=15),
            Criterion(name="Novelty", description="New compared with past projects and existing work; a contribution, not a copy.", weight=20),
            Criterion(name="Technical depth", description="Uses concepts from the course at a suitable level (algorithms, design, hardware).", weight=20),
            Criterion(name="Feasibility in the semester", description="Can be completed and tested by the team within the semester.", weight=15),
            Criterion(name="Documentation and research", description="Room for a literature survey, methodology, results and a report or paper.", weight=15),
            Criterion(name="Demonstrability", description="Produces a working prototype or measurable results for the viva.", weight=15),
        ],
    },
    "startup": {
        "name": "Startup",
        "summary": "Ideas that could become a startup, judged like an early-stage pitch.",
        "criteria": [
            Criterion(name="Problem severity", description="How painful and frequent the problem is for customers.", weight=20),
            Criterion(name="Market size", description="How many customers have it and would pay.", weight=15),
            Criterion(name="Differentiation", description="Why customers would choose this over existing alternatives.", weight=20),
            Criterion(name="MVP feasibility", description="Whether a minimum viable product can be built and tested quickly.", weight=15),
            Criterion(name="Business model", description="A clear way to make money or sustain it.", weight=15),
            Criterion(name="Founder fit", description="How well it matches the founders' skills and access to users.", weight=15),
        ],
    },
    "personal": {
        "name": "Personal project",
        "summary": "Ideas to build for yourself: to learn, for your portfolio, or for fun.",
        "criteria": [
            Criterion(name="Learning value", description="New skills you would gain by building it.", weight=25),
            Criterion(name="Portfolio value", description="How well it shows your abilities to recruiters or colleges.", weight=25),
            Criterion(name="Motivation", description="How likely you are to enjoy it and finish it.", weight=20),
            Criterion(name="Feasibility", description="Buildable with your time and resources.", weight=15),
            Criterion(name="Usefulness", description="Whether you or others would actually use it.", weight=15),
        ],
    },
    "other": {
        "name": "Other",
        "summary": "Ideas for another purpose.",
        "criteria": [
            Criterion(name="Usefulness", description="How useful it is for the intended people."),
            Criterion(name="Originality", description="How it differs from what already exists."),
            Criterion(name="Feasibility", description="Whether it can be built with the time and resources available."),
            Criterion(name="Impact", description="How much difference it makes."),
        ],
    },
}


# =========================================================
# MODEL CALLS
# =========================================================


def _as_list(value: Any) -> list:
    if value is None:
        return []
    return value if isinstance(value, list) else [value]


def _strings(value: Any) -> list[str]:
    return [str(item).strip() for item in _as_list(value) if str(item).strip()]


def ask_json(llm_client: Any, model: str, system: str, user: str, max_tokens: int) -> dict:
    response = llm_client.chat.completions.create(
        model=model,
        messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
        temperature=0.2,
        max_tokens=max_tokens,
        response_format={"type": "json_object"},
        extra_body={"options": {"num_ctx": 16384}},
    )
    data = json.loads(strip_code_fence(response.choices[0].message.content or ""))
    if not isinstance(data, dict):
        raise ValueError("Expected a JSON object.")
    return data


# =========================================================
# RESEARCH
# =========================================================

EXTRACT_SYSTEM = """You read web pages about a hackathon and extract the facts a student needs to choose and shape a project idea.

You get the student's query and pages P1, P2, ... Some pages may be about OTHER hackathons with similar names: use only pages about the hackathon the student means. If none of the pages is clearly about it, set "found" to false.

Return JSON with exactly these keys:
{
  "found": true,
  "page_ids": ["P1", ...],
  "name": "official name",
  "url": "",
  "summary": "2-3 sentences: what it is, who organises it, who can take part",
  "themes": ["..."],
  "tracks": ["..."],
  "judging_criteria": [{"name": "...", "description": "...", "weight": 25}],
  "dates": "...",
  "prizes": "...",
  "rules": ["..."]
}

Rules:
- Use ONLY facts written in the pages you list in page_ids. Never invent themes, criteria, dates or prizes. Unknown text fields are "", unknown lists are [].
- page_ids: the pages about this hackathon that you used.
- url: leave "" (links are added from the pages).
- judging_criteria: only criteria the pages state. weight: the percentage or points share if stated, otherwise null.
- tracks: problem statements, tracks or categories teams pick from (at most 12, shortened).
- rules: at most 6 that matter when choosing an idea (team size, eligibility, what must be submitted, technologies required or banned, original work only).
- Plain English, no Markdown."""


def _context_from_pages(llm_client: Any, model: str, query: str, gathered: Gathered) -> BoardContext:
    if not gathered.pages:
        return BoardContext(
            purpose="hackathon",
            name=query,
            found=False,
            judging_criteria=TYPICAL_HACKATHON_CRITERIA,
            summary="I couldn't find this hackathon online. Paste the link to its page, or rate your ideas with typical hackathon criteria.",
            warnings=gathered.warnings,
        )

    pages = {f"P{index}": page for index, page in enumerate(gathered.pages, start=1)}
    listing = "\n\n".join(f"=== {pid} ({page.origin}) {page.title}\n{page.text}" for pid, page in pages.items())
    data = ask_json(llm_client, model, EXTRACT_SYSTEM, f"STUDENT'S QUERY: {query}\n\nPAGES:\n{listing}", max_tokens=2500)

    used = [pages[pid] for pid in dict.fromkeys(str(p).strip().upper() for p in _as_list(data.get("page_ids"))) if pid in pages]
    found = bool(data.get("found", True)) and bool(used)
    criteria = []
    for item in _as_list(data.get("judging_criteria")):
        if isinstance(item, dict) and str(item.get("name", "")).strip():
            weight = item.get("weight")
            try:
                weight = float(weight) if weight not in (None, "") else None
            except (TypeError, ValueError):
                weight = None
            criteria.append(Criterion(name=str(item["name"]).strip()[:120], description=str(item.get("description") or "")[:400],
                                      weight=weight if weight is not None and 0 < weight <= 100 else None))

    return BoardContext(
        purpose="hackathon",
        name=str(data.get("name") or query).strip()[:150] if found else query,
        url=used[0].url if used else "",
        summary=str(data.get("summary") or "").strip() if found else (
            "I couldn't confirm which hackathon this is from the pages I found. Paste the link to its page for exact details."
        ),
        themes=_strings(data.get("themes"))[:12] if found else [],
        tracks=_strings(data.get("tracks"))[:12] if found else [],
        judging_criteria=_with_typical(criteria) if (found and criteria) else TYPICAL_HACKATHON_CRITERIA,
        criteria_source="official" if (found and criteria) else "typical",
        dates=str(data.get("dates") or "").strip() if found else "",
        prizes=str(data.get("prizes") or "").strip() if found else "",
        rules=_strings(data.get("rules"))[:6] if found else [],
        sources=[Source(title=page.title, url=page.url) for page in used],
        found=found,
        warnings=gathered.warnings,
    )


MIN_CRITERIA = 3


def _with_typical(criteria: list[Criterion]) -> list[Criterion]:
    """A hackathon that publishes only one or two criteria still needs a fair rating: add typical ones."""

    if len(criteria) >= MIN_CRITERIA:
        return criteria
    names = {c.name.lower() for c in criteria}
    extra = [c for c in TYPICAL_HACKATHON_CRITERIA if c.name.lower() not in names][: MIN_CRITERIA + 1 - len(criteria)]
    # Mixed official and typical criteria: equal weights (published weights no longer add up).
    return [c.model_copy(update={"weight": None}) for c in criteria] + extra


def research(llm_client: Any, model: str, purpose: str, query: str = "", notes: str = "") -> BoardContext:
    """Blocking (web and model calls): run it in a thread."""

    if purpose == "hackathon":
        query = query.strip()
        if not query:
            raise BoardError("Tell me which hackathon, or paste its link.")
        try:
            context = _context_from_pages(llm_client, model, query, gather(query))
        except (ValueError, ValidationError) as error:
            logger.warning("Hackathon extraction failed: %s", type(error).__name__)
            raise BoardError("I found pages about the hackathon but couldn't read them properly. Please try again.") from error
        except Exception as error:
            logger.exception("Hackathon research failed")
            raise BoardError("The research couldn't be finished. Check that the model is reachable and try again.") from error
        context.notes = notes.strip()
        official = [c for c in context.judging_criteria if c not in TYPICAL_HACKATHON_CRITERIA]
        if context.criteria_source == "official" and len(official) < len(context.judging_criteria):
            context.warnings.append(
                f"The hackathon lists only {len(official)} judging criteria, so typical ones were added: "
                + ", ".join(c.name for c in context.judging_criteria if c in TYPICAL_HACKATHON_CRITERIA) + "."
            )
        if context.criteria_source == "typical":
            context.warnings.append("No official judging criteria were found, so typical hackathon criteria are used.")
        return context

    preset = PURPOSE_PRESETS[purpose]
    return BoardContext(
        purpose=purpose,
        name=preset["name"],
        summary=preset["summary"],
        judging_criteria=preset["criteria"],
        criteria_source="typical",
        notes=notes.strip(),
    )


# =========================================================
# RATING
# =========================================================

RATE_SYSTEM = """You are a fair, experienced judge helping a student pick and improve project ideas for a specific purpose.

Score EVERY idea on EVERY criterion from 1 (poor) to 10 (excellent), with a one-sentence reason grounded in the idea and the context. Be honest and use the full range: ideas that are common, vague or too big for the time must score lower.

Return JSON:
{
  "ratings": [
    {
      "idea_id": "...",
      "scores": [{"criterion": "<exact criterion name>", "score": 7, "reason": "..."}],
      "verdict": "one sentence: the idea's overall chance for this purpose",
      "strengths": ["..."],
      "risks": ["..."],
      "improvements": ["..."],
      "other_uses": ["..."]
    }
  ]
}

Rules:
- Use the idea ids and the criterion names exactly as given.
- strengths and risks: 1-3 short items each.
- improvements: 3 concrete changes that would raise the score FOR THIS PURPOSE: tie the idea to a specific theme or track, a judging criterion, a stronger demo, a sharper user group, or a feature that sets it apart. Name the theme or criterion when relevant.
- other_uses: 2 other places the idea could work well (another hackathon theme, a college project, a startup, a research paper, an NGO or government use), each with a few words on why.
- Plain English, no Markdown."""


class _Rated(BaseModel):
    idea_id: str
    scores: list[dict] = Field(default_factory=list)
    verdict: str = ""
    strengths: list[str] = Field(default_factory=list)
    risks: list[str] = Field(default_factory=list)
    improvements: list[str] = Field(default_factory=list)
    other_uses: list[str] = Field(default_factory=list)

    _lists = field_validator("scores", "strengths", "risks", "improvements", "other_uses", mode="before")(
        lambda cls, v: [item for item in _as_list(v) if item not in (None, "")]
    )


def context_text(context: BoardContext) -> str:
    lines = [f"PURPOSE: {context.purpose.replace('_', ' ')}: {context.name}"]
    for label, value in (("Summary", context.summary), ("Dates", context.dates), ("Prizes", context.prizes), ("Student's notes", context.notes)):
        if value:
            lines.append(f"{label}: {value}")
    for label, values in (("Themes", context.themes), ("Tracks / problem statements", context.tracks), ("Rules", context.rules)):
        if values:
            lines.append(f"{label}: " + "; ".join(values))
    return "\n".join(lines)


def _weights(criteria: list[Criterion]) -> dict[str, float]:
    given = [c.weight for c in criteria if c.weight]
    if len(given) == len(criteria) and sum(given) > 0:
        return {c.name: c.weight / sum(given) for c in criteria}
    return {c.name: 1 / len(criteria) for c in criteria}


def _score(value: Any) -> int:
    try:
        return max(1, min(10, round(float(value))))
    except (TypeError, ValueError):
        return 5


def rate(llm_client: Any, model: str, context: BoardContext, ideas: list[IdeaInput]) -> BoardRating:
    """Blocking (model call): run it in a thread."""

    criteria = context.judging_criteria or TYPICAL_HACKATHON_CRITERIA
    weights = _weights(criteria)
    criteria_text = "\n".join(
        f"- {c.name}{f' ({c.weight:g}%)' if c.weight else ''}: {c.description}" for c in criteria
    )
    ideas_text = "\n\n".join(
        f"IDEA {idea.id}: {idea.title}\n"
        + "\n".join(f"{label}: {value}" for label, value in (
            ("Description", idea.description), ("Problem", idea.problem), ("Solution", idea.solution), ("Users", idea.target_users)
        ) if value)
        for idea in ideas
    )
    user = f"{context_text(context)}\n\nJUDGING CRITERIA:\n{criteria_text}\n\nIDEAS:\n{ideas_text}"

    try:
        data = ask_json(llm_client, model, RATE_SYSTEM, user, max_tokens=1200 + 700 * len(ideas))
    except Exception as error:
        logger.warning("Rating failed: %s", type(error).__name__)
        raise BoardError("The ideas couldn't be rated right now. Check that the model is reachable and try again.") from error

    # Models sometimes echo the label ("IDEA a") or invent ids: match leniently,
    # then by position for whatever is left.
    known = {idea.id for idea in ideas}
    by_id: dict[str, _Rated] = {}
    unmatched: list[_Rated] = []
    for item in _as_list(data.get("ratings")):
        if isinstance(item, dict) and "idea_id" in item:
            item = {**item, "idea_id": str(item["idea_id"])}
        try:
            rated = _Rated.model_validate(item)
        except ValidationError:
            continue
        idea_id = re.sub(r"^(idea|id)[\s:#-]*", "", rated.idea_id.strip(), flags=re.I).strip()
        if idea_id in known and idea_id not in by_id:
            by_id[idea_id] = rated
        else:
            unmatched.append(rated)
    for idea in ideas:
        if idea.id not in by_id and unmatched:
            by_id[idea.id] = unmatched.pop(0)

    ratings: list[IdeaRating] = []
    for idea in ideas:
        rated = by_id.get(idea.id)
        if rated is None:
            continue
        given = {str(s.get("criterion", "")).strip().lower(): s for s in rated.scores if isinstance(s, dict)}
        scores = []
        for criterion in criteria:
            item = given.get(criterion.name.lower(), {})
            scores.append(CriterionScore(criterion=criterion.name, score=_score(item.get("score")), reason=str(item.get("reason") or "")))
        total = round(sum(weights[s.criterion] * s.score for s in scores) * 10)
        ratings.append(IdeaRating(
            idea_id=idea.id,
            total=total,
            scores=scores,
            verdict=rated.verdict.strip(),
            strengths=[str(x) for x in rated.strengths][:3],
            risks=[str(x) for x in rated.risks][:3],
            improvements=[str(x) for x in rated.improvements][:4],
            other_uses=[str(x) for x in rated.other_uses][:3],
        ))

    if not ratings:
        raise BoardError("The ideas couldn't be rated right now. Please try again.")

    ratings.sort(key=lambda rating: -rating.total)
    best = ratings[0]
    best_title = next(idea.title for idea in ideas if idea.id == best.idea_id)
    top = sorted(best.scores, key=lambda s: -s.score)[:2]
    reason = f"{best_title} scores highest ({best.total}/100)"
    if top:
        reason += ", strongest on " + " and ".join(s.criterion.lower() for s in top)
    if len(ratings) > 1 and ratings[1].total == best.total:
        reason += f". It's tied with {next(i.title for i in ideas if i.id == ratings[1].idea_id)}, so pick the one you're more excited about"
    return BoardRating(ratings=ratings, best_idea_id=best.idea_id, best_reason=reason + ".")


# =========================================================
# IDEA CHECK FOR AN ITEM ON A PAGE
# =========================================================


def check_details(item: IdeaInput, context: BoardContext | None) -> dict[str, Any]:
    """The idea (or project) plus what the page is for, in the shape Idea Check reads."""

    idea = item.title if not item.description else f"{item.title}: {item.description}"
    details: dict[str, Any] = {
        "initial_idea": idea[:1500],
        "problem_statement": item.problem or None,
        "proposed_solution": item.solution or None,
        "target_users": [item.target_users] if item.target_users else None,
    }
    if context is not None:
        details["project_type"] = context.purpose.replace("_", " ")
        if context.purpose == "hackathon":
            facts = [f"Hackathon: {context.name}"]
            if context.themes:
                facts.append("Hackathon themes: " + ", ".join(context.themes))
            if context.tracks:
                facts.append("Hackathon tracks: " + ", ".join(context.tracks))
            if context.judging_criteria:
                facts.append("Judging criteria: " + ", ".join(c.name for c in context.judging_criteria))
            details["additional_instructions"] = facts
        if context.dates:
            details["deadline"] = context.dates
        if context.rules:
            details["constraints"] = context.rules
        if context.notes:
            details["available_time"] = context.notes
    return details


# =========================================================
# MAKE IT BETTER
# =========================================================

IMPROVE_SYSTEM = """You are a hackathon mentor. A student's idea or project was judged against a specific purpose (usually a hackathon). Give the concrete changes that make it a much stronger fit AND more innovative than the similar projects that already exist.

Return JSON with exactly these keys:
{
  "summary": "1-2 sentences: the main direction of the changes",
  "changes": [{"title": "short name of the change", "detail": "what exactly to add or change, 1-3 sentences", "helps_with": "the judging criterion, theme or track it improves", "beats": "the existing project this makes it better than, or empty"}]
}

Rules:
- 3 to 6 changes, the most impactful first. Fix the lowest-scoring criteria first.
- Each change must be specific to THIS project and THIS purpose (its themes, tracks and judging criteria). No generic advice like "improve the UI".
- If similar existing projects are listed, at least two changes must make this project clearly different from and better than them (something they do not do). Name the existing project you are beating in "beats", exactly as listed; otherwise "beats" is "".
- Keep it buildable in the time the student has; prefer changes to scope, features, demo and pitch over a full rewrite.
- Do not invent facts about the hackathon that are not in the context."""


def improve(
    llm_client: Any,
    model: str,
    context: BoardContext,
    item: IdeaInput,
    rating: IdeaRating | None,
    check: IdeaCheck | None = None,
) -> ImprovePlan:
    """Concrete changes that make one item a better fit, plus the instruction to apply them to its plan."""

    lines = [context_text(context)]
    if context.judging_criteria:
        lines.append("Judging criteria: " + "; ".join(
            f"{c.name}{f' ({c.weight:g}%)' if c.weight else ''}{f': {c.description}' if c.description else ''}" for c in context.judging_criteria
        ))
    lines.append(f"\nTHE PROJECT: {item.title}")
    for label, value in (("Description", item.description), ("Problem", item.problem), ("Solution", item.solution), ("Users", item.target_users)):
        if value:
            lines.append(f"{label}: {value}")
    if rating:
        lines.append(f"\nIts rating: {rating.total}/100. {rating.verdict}")
        lines.extend(f"- {s.criterion}: {s.score}/10. {s.reason}" for s in rating.scores)
        if rating.risks:
            lines.append("Risks: " + "; ".join(rating.risks))
        if rating.improvements:
            lines.append("Ideas the judge already had: " + "; ".join(rating.improvements))
    if check:
        lines.append(f"\nWHAT ALREADY EXISTS ({check.label_text}): {check.explanation}")
        lines.extend(
            f"- {p.title} ({'Devpost, won a prize' if p.winner else 'Devpost' if p.source == 'devpost' else 'GitHub'}): {p.description[:200]}"
            for p in check.similar_projects[:6]
        )
        if check.angles:
            lines.append("Ways to stand out found earlier: " + "; ".join(f"{a.title}: {a.description}" for a in check.angles))

    try:
        data = ask_json(llm_client, model, IMPROVE_SYSTEM, "\n".join(lines), max_tokens=2000)
    except Exception as error:
        logger.warning("Improve failed: %s", str(error)[:300])
        raise BoardError("I couldn't work out the improvements right now. Please try again.") from error

    changes = []
    for raw in _as_list(data.get("changes")):
        if isinstance(raw, dict) and str(raw.get("title") or "").strip():
            beats = str(raw.get("beats") or "").strip()
            # Only projects that were really found (no invented competitors).
            known = {p.title.lower(): p.title for p in (check.similar_projects if check else [])}
            changes.append(Improvement(
                title=str(raw["title"]).strip(),
                detail=str(raw.get("detail") or "").strip(),
                helps_with=str(raw.get("helps_with") or "").strip(),
                beats=known.get(beats.lower(), ""),
            ))
    if not changes:
        raise BoardError("I couldn't work out the improvements right now. Please try again.")
    changes = changes[:6]
    return ImprovePlan(summary=str(data.get("summary") or "").strip(), changes=changes, instruction=improve_instruction(context, changes))


def improve_instruction(context: BoardContext, changes: list[Improvement]) -> str:
    """The changes as one request for the plan editor (written in code, so it says exactly what was shown)."""

    target = context.name if context.purpose == "hackathon" else f"this {context.purpose.replace('_', ' ')} ({context.name})"
    numbered = "\n".join(
        f"{index}. {change.title}: {change.detail}{f' (helps with {change.helps_with})' if change.helps_with else ''}"
        f"{f' (makes it better than the existing project {change.beats})' if change.beats else ''}"
        for index, change in enumerate(changes, 1)
    )
    return (
        f"Make this project a stronger fit for {target}. Apply ALL of these changes to the plan, and update every "
        f"section they affect (features, technology, implementation plan, build steps, timeline, demo checklist):\n{numbered}"
    )[:2000]
