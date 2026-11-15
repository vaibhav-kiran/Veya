"""
Idea Check: is this already done, how can it stand out, and can THIS student
build it in time?

1. The model turns the idea into a few short search queries.
2. GitHub and Devpost are searched (in parallel).
3. Results are ranked by word overlap with the idea (transparent, no model).
4. The model compares the idea with the closest results, citing them only by
   ID (S1, S2, ...), and suggests ways to stand out and checks feasibility.

Honest by design (same rules as the Idea Discovery Engine):
- Titles and links come from the search APIs, never from the model.
- Unknown IDs the model cites are dropped.
- With nothing found, the label is "not enough evidence", never "new".
- A very high word overlap can't be called "strongly differentiated".
"""

import json
import logging
import re
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Callable, Optional

from pydantic import BaseModel, Field, ValidationError, field_validator

from services.idea_check.schemas import (
    SIMILARITY_LABEL_TEXT,
    Feasibility,
    IdeaCheck,
    SimilarProject,
    StandOutAngle,
)
from services.idea_check.sources import Found, SourceError, search_devpost, search_github
from services.language_layer.language_pipeline import strip_code_fence

logger = logging.getLogger(__name__)

MAX_QUERIES = 3
GITHUB_QUERIES = 2  # unauthenticated GitHub allows 10 searches a minute
MAX_CANDIDATES = 6  # shown to the model
MAX_SHOWN = 4  # shown to the student
MAX_ANGLES = 3
HIGH_OVERLAP = 0.45

STOPWORDS = set(
    """a an and are as at be by for from has have in into is it its of on or that the this to with using based
    want would like make build create help helps people user users my our your can will should
    low cost system app application tool platform smart device project projects student students""".split()
)

# The fields that describe WHAT the idea is (used for search and overlap).
IDEA_FIELDS = ("initial_idea", "problem_statement", "proposed_solution", "preferred_features")


# =========================================================
# MODEL OUTPUT (validated, never trusted blindly)
# =========================================================


def _as_list(value: Any) -> list:
    if value is None:
        return []
    return value if isinstance(value, list) else [value]


class _Queries(BaseModel):
    queries: list[str] = Field(default_factory=list)
    _list = field_validator("queries", mode="before")(lambda cls, v: _as_list(v))


class _Assessment(BaseModel):
    label: str = "insufficient_evidence"
    closest_ids: list[str] = Field(default_factory=list)
    explanation: str = ""
    angles: list[StandOutAngle] = Field(default_factory=list)
    feasibility: Feasibility = Field(default_factory=Feasibility)
    hackathon_fit: str = ""

    _lists = field_validator("closest_ids", "angles", mode="before")(lambda cls, v: _as_list(v))

    @field_validator("label", mode="before")
    @classmethod
    def _label(cls, value: Any) -> str:
        text = str(value or "").strip().lower().replace(" ", "_").replace("-", "_")
        return text if text in SIMILARITY_LABEL_TEXT else "insufficient_evidence"

    @field_validator("feasibility", mode="before")
    @classmethod
    def _feasibility(cls, value: Any) -> Any:
        if not isinstance(value, dict):
            return {}
        verdict = str(value.get("verdict") or "").strip().lower().replace(" ", "_").replace("-", "_")
        return {**value, "verdict": verdict if verdict in ("feasible", "stretch", "not_feasible") else "stretch"}


QUERY_SYSTEM = """You write search queries to find existing projects similar to a student's idea on GitHub and Devpost (a hackathon project site).

Return JSON: {"queries": ["...", "...", "..."]}

Rules:
- 3 queries, each 2-4 plain keywords naming the core idea: what it does and its domain.
- No quotes, operators, or filler words such as app, project, system, student, build.
- Different angles on the same idea (the main function, the problem, the key technology).

Example: "an app to help women stay safe when walking home at night"
-> {"queries": ["women safety", "night walk safety", "SOS location sharing"]}"""

ASSESS_SYSTEM = """You help a student at the ideation stage of a hackathon or college project. Compare their idea with existing projects found on GitHub and Devpost, suggest how it could stand out, and judge whether THEY can build it in time.

Return JSON with exactly these keys:
{
  "label": "strongly_differentiated" | "potentially_differentiated" | "significant_existing_overlap" | "insufficient_evidence",
  "closest_ids": ["S1", ...],
  "explanation": "...",
  "angles": [{"title": "...", "description": "...", "why": "..."}],
  "feasibility": {"verdict": "feasible" | "stretch" | "not_feasible", "reason": "...", "smaller_version": "..."},
  "hackathon_fit": "..."
}

Rules:
- Only cite projects by the IDs given (S1, S2, ...). Never invent projects, names or links.
- closest_ids: up to 4 IDs of the projects that really do something similar, most similar first. Leave out unrelated results.
- label: significant_existing_overlap if a listed project already does the same core thing; potentially_differentiated if similar projects exist but the idea differs in a meaningful way; strongly_differentiated only if none of the listed projects is close; insufficient_evidence if the results are too unrelated to judge. Never say the idea is completely new; an empty search is not proof.
- explanation: 1-2 plain sentences for the student. Name the similar projects by their title, not by ID.
- angles: 2-3 concrete ways to make THIS idea stand out from the similar projects: a specific feature, user group, setting or technical twist. Each must be buildable with the student's time, skills and resources. title: at most 8 words. description: one sentence on what to build. why: one sentence on why judges or users would care.
- feasibility: judge against the deadline, available time, team size, skills, hardware and budget given. verdict "stretch" if possible but tight, "not_feasible" if not in time. reason: one sentence. smaller_version: if stretch or not_feasible, one sentence describing a smaller version that fits; otherwise "".
- hackathon_fit: one sentence on how well the idea fits the hackathon theme, track or judging criteria, ONLY if the details mention them; otherwise "".
- Plain, friendly English. No Markdown."""


# =========================================================
# HELPERS
# =========================================================


def tokens(text: str) -> set[str]:
    return {word for word in re.findall(r"[a-z0-9]+", text.lower()) if len(word) > 2 and word not in STOPWORDS}


def overlap(idea_words: set[str], text: str) -> float:
    """Share of the idea's key words that the other text also contains."""
    other = tokens(text)
    return round(len(idea_words & other) / len(idea_words), 2) if idea_words and other else 0.0


def _value_text(value: Any) -> str:
    return ", ".join(str(item) for item in value) if isinstance(value, list) else str(value)


def idea_text(details: dict[str, Any]) -> str:
    """The idea itself (what is checked), from the confirmed details."""
    return " | ".join(_value_text(details[name]) for name in IDEA_FIELDS if details.get(name) not in (None, "", []))


def details_text(details: dict[str, Any]) -> str:
    return "\n".join(
        f"- {name.replace('_', ' ')}: {_value_text(value)}" for name, value in details.items() if value not in (None, "", [])
    )


def fallback_queries(idea: str) -> list[str]:
    words = [word for word in re.findall(r"[a-z0-9]+", idea.lower()) if len(word) > 2 and word not in STOPWORDS]
    return [" ".join(words[:3])] if words else []


# =========================================================
# CHECKER
# =========================================================


class IdeaChecker:

    def __init__(
        self,
        llm_client: Any,
        model_name: str,
        github: Callable[[str], list[Found]] = search_github,
        devpost: Callable[[str], list[Found]] = search_devpost,
    ):
        self.llm_client = llm_client
        self.model_name = model_name
        self.github = github
        self.devpost = devpost

    def _ask(self, system: str, user: str, schema: type[BaseModel], max_tokens: int) -> BaseModel:
        response = self.llm_client.chat.completions.create(
            model=self.model_name,
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
            temperature=0.2,
            max_tokens=max_tokens,
            response_format={"type": "json_object"},
            extra_body={"options": {"num_ctx": 8192}},
        )
        text = response.choices[0].message.content or ""
        return schema.model_validate(json.loads(strip_code_fence(text)))

    def _queries(self, idea: str) -> list[str]:
        try:
            result = self._ask(QUERY_SYSTEM, f"Idea: {idea}", _Queries, max_tokens=200)
            queries = [" ".join(str(query).split()) for query in result.queries if str(query).strip()]
        except (ValueError, ValidationError) as error:
            logger.warning("Idea check queries failed (%s); using keywords.", type(error).__name__)
            queries = []
        unique = list(dict.fromkeys(query[:80] for query in queries))[:MAX_QUERIES]
        return unique or fallback_queries(idea)

    def _search(self, queries: list[str]) -> tuple[list[Found], list[str]]:
        jobs = [(self.github, query) for query in queries[:GITHUB_QUERIES]] + [(self.devpost, query) for query in queries]
        found: list[Found] = []
        warnings: list[str] = []
        with ThreadPoolExecutor(max_workers=len(jobs) or 1) as pool:
            futures = [pool.submit(search, query) for search, query in jobs]
            for future in futures:
                try:
                    found.extend(future.result())
                except SourceError as error:
                    if str(error) not in warnings:
                        warnings.append(str(error))
                except Exception as error:  # a source must never break the check
                    logger.warning("Idea check search failed: %s", type(error).__name__)
        unique = list({item.url: item for item in found}.values())
        return unique, warnings

    def check(self, details: dict[str, Any]) -> IdeaCheck:
        """Blocking (model and web calls): run it in a thread."""

        idea = idea_text(details)
        if not idea:
            raise ValueError("There is no idea to check yet.")

        found, warnings = self._search(self._queries(idea))

        idea_words = tokens(idea)
        ranked = sorted(
            ((overlap(idea_words, f"{item.title} {item.description}"), item) for item in found),
            key=lambda pair: -pair[0],
        )
        candidates = [
            SimilarProject(
                id=f"S{index}",
                source=item.source,
                title=item.title,
                description=item.description,
                url=item.url,
                stars=item.stars,
                winner=item.winner,
                overlap=score,
            )
            for index, (score, item) in enumerate([pair for pair in ranked if pair[0] > 0][:MAX_CANDIDATES], start=1)
        ]

        listing = "\n".join(
            f"{c.id} [{c.source}{', won a prize' if c.winner else ''}{f', {c.stars} stars' if c.stars else ''}] "
            f"{c.title}: {c.description or 'no description'}"
            for c in candidates
        ) or "(nothing comparable was found)"
        user = (
            f"STUDENT'S CONFIRMED DETAILS:\n{details_text(details)}\n\n"
            f"EXISTING PROJECTS FOUND:\n{listing}\n\nAssess the idea."
        )
        assessment = self._ask(ASSESS_SYSTEM, user, _Assessment, max_tokens=1500)

        by_id = {c.id: c for c in candidates}
        closest = [by_id[i] for i in dict.fromkeys(str(i).strip().upper() for i in assessment.closest_ids) if i in by_id]
        label = assessment.label
        if not candidates:
            # Nothing found is not proof that nothing exists.
            label = "insufficient_evidence"
        elif label == "strongly_differentiated" and candidates[0].overlap >= HIGH_OVERLAP:
            label = "potentially_differentiated"
        if label == "significant_existing_overlap" and not closest:
            closest = candidates[:2]

        feasibility = assessment.feasibility
        if feasibility.verdict == "feasible":
            feasibility.smaller_version = ""

        return IdeaCheck(
            idea=idea,
            label=label,
            label_text=SIMILARITY_LABEL_TEXT[label],
            explanation=assessment.explanation.strip(),
            similar_projects=closest[:MAX_SHOWN],
            angles=[angle for angle in assessment.angles if angle.title.strip()][:MAX_ANGLES],
            feasibility=feasibility,
            hackathon_fit=assessment.hackathon_fit.strip(),
            warnings=warnings,
        )


# =========================================================
# WHAT VEYA SAYS
# =========================================================

ORDINALS = ("one", "two", "three")


def speech_for(check: IdeaCheck) -> str:
    """The Idea Check, spoken after the summary (English; translated like any reply)."""

    sentences: list[str] = []
    projects = check.similar_projects
    if projects:
        first = projects[0]
        prize = ", which won a hackathon prize" if first.winner else ""
        count = "one similar project" if len(projects) == 1 else f"{len(projects)} similar projects"
        sentences.append(f"I checked GitHub and Devpost and found {count}, like {first.title}{prize}.")
    else:
        sentences.append("I checked GitHub and Devpost and didn't find a close match, though that doesn't prove nothing similar exists.")

    if check.label == "significant_existing_overlap":
        sentences.append("Your idea is very close to existing work, so it's worth adding a twist.")
    elif check.label == "strongly_differentiated":
        sentences.append("Your idea looks different from what's out there.")

    if check.angles:
        listed = "; ".join(f"{ORDINALS[i]}, {angle.title.rstrip('.')}" for i, angle in enumerate(check.angles))
        sentences.append(f"To stand out, you could try: {listed}.")

    feasibility = check.feasibility
    if feasibility.verdict == "feasible":
        sentences.append("It fits your time and skills.")
    elif feasibility.verdict == "stretch":
        sentences.append(f"It's a stretch for your time. {feasibility.reason}".strip())
    else:
        sentences.append(f"As planned, it's too big for your time. {feasibility.reason}".strip())
    if feasibility.smaller_version:
        sentences.append(f"A smaller version: {feasibility.smaller_version}")

    if check.hackathon_fit:
        sentences.append(check.hackathon_fit)

    if check.angles:
        sentences.append("Shall I build it as it is, or with one of these ideas? Tick one on the screen, or say, for example, the first one.")
    else:
        sentences.append("Shall I start building your project plan, or would you like to change anything?")
    return " ".join(sentence if sentence.endswith((".", "?", "!")) else f"{sentence}." for sentence in sentences)


# =========================================================
# THE STUDENT'S CHOICE
# =========================================================

_CHOICE_PATTERNS = (
    (0, re.compile(r"\b(first|1st|option one|idea one|number one|angle one)\b")),
    (1, re.compile(r"\b(second|2nd|option two|idea two|number two|angle two)\b")),
    (2, re.compile(r"\b(third|3rd|option three|idea three|number three|angle three)\b")),
)
_DIGIT_CHOICE = re.compile(r"\b(?:option|idea|number|angle|no\.?)\s*([1-3])\b|^\s*([1-3])\s*$")
_SMALLER = re.compile(r"\b(smaller|simpler|smallest|simplest|reduced|lighter) (version|one|scope)\b")
_REJECT = re.compile(r"\b(not|don't|do not|no,? not|instead of|but|change|except)\b")
MAX_CHOICE_WORDS = 14


def parse_choice(english_text: str, check: Optional[IdeaCheck]) -> Optional[str]:
    """
    "the second one" -> "angle:1", "the smaller version" -> "smaller", otherwise None
    (the reply is then handled like any other answer).
    """

    if check is None:
        return None
    text = " ".join(english_text.lower().replace("’", "'").split())
    if not text or len(text.split()) > MAX_CHOICE_WORDS or _REJECT.search(text):
        return None
    if check.feasibility.smaller_version and _SMALLER.search(text):
        return "smaller"
    digit = _DIGIT_CHOICE.search(text)
    if digit:
        index = int(digit.group(1) or digit.group(2)) - 1
        return f"angle:{index}" if index < len(check.angles) else None
    matches = [index for index, pattern in _CHOICE_PATTERNS if pattern.search(text)]
    if len(matches) == 1 and matches[0] < len(check.angles):
        return f"angle:{matches[0]}"
    return None


def chosen_direction(check: IdeaCheck, choice: Optional[str]) -> Optional[StandOutAngle]:
    """The angle (or the smaller version) to build, for a choice like "angle:1" or "smaller"."""

    if not choice or choice == "as_is":
        return None
    if choice == "smaller" and check.feasibility.smaller_version:
        return StandOutAngle(title="Smaller version", description=check.feasibility.smaller_version, why=check.feasibility.reason)
    if choice.startswith("angle:"):
        try:
            index = int(choice.split(":", 1)[1])
        except ValueError:
            return None
        if 0 <= index < len(check.angles):
            return check.angles[index]
    return None
