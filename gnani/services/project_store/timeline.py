"""
Deadlines and phase timelines for saved projects.

1. parse_deadline(): turns what the user said ("this weekend", "15 March",
   "in 10 days", "next Friday") into a calendar date. Deterministic, so it
   is instant and never invents a date: unknown wording gives None and the
   user can pick the date in the app.

2. build_timeline(): splits the days from the project's start to its
   deadline into phases that fit THIS project (UI, backend, auth, AI/ML,
   hardware, ...), each with a date range and what to focus on.
"""

import re
from datetime import date, timedelta
from typing import Optional

from pydantic import BaseModel

from services.conversation_manager.schemas import ProjectDetails

# =========================================================
# DEADLINE PARSING
# =========================================================

MONTHS = {
    name: index
    for index, names in enumerate(
        [
            ("january", "jan"), ("february", "feb"), ("march", "mar"), ("april", "apr"),
            ("may",), ("june", "jun"), ("july", "jul"), ("august", "aug"),
            ("september", "sep", "sept"), ("october", "oct"), ("november", "nov"), ("december", "dec"),
        ],
        start=1,
    )
    for name in names
}
WEEKDAYS = {name: index for index, name in enumerate(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"])}
NUMBER_WORDS = {
    "a": 1, "an": 1, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7,
    "eight": 8, "nine": 9, "ten": 10, "eleven": 11, "twelve": 12, "fifteen": 15, "twenty": 20,
    "thirty": 30, "couple": 2, "few": 3,
}
UNIT_DAYS = {"day": 1, "week": 7, "fortnight": 14, "month": 30}

MONTH_PATTERN = "|".join(sorted(MONTHS, key=len, reverse=True))


def _last_day_of_month(year: int, month: int) -> date:
    first_next = date(year + (month // 12), month % 12 + 1, 1)
    return first_next - timedelta(days=1)


def _next_weekday(today: date, weekday: int, skip_today: bool = True) -> date:
    days_ahead = (weekday - today.weekday()) % 7
    if days_ahead == 0 and skip_today:
        days_ahead = 7
    return today + timedelta(days=days_ahead)


def _future_date(today: date, month: int, day: int, year: Optional[int]) -> Optional[date]:
    try:
        if year:
            return date(year, month, day)
        candidate = date(today.year, month, day)
        return candidate if candidate >= today else date(today.year + 1, month, day)
    except ValueError:
        return None


def _amount(word: str) -> Optional[int]:
    return int(word) if word.isdigit() else NUMBER_WORDS.get(word)


def parse_deadline(text: Optional[str], today: date) -> Optional[date]:
    """Best-effort date for a deadline phrase, relative to `today`. None if unsure."""

    if not text:
        return None
    t = " " + re.sub(r"\s+", " ", text.lower().replace(",", " ")) + " "

    # 2026-03-15
    if match := re.search(r"(\d{4})-(\d{1,2})-(\d{1,2})", t):
        try:
            return date(int(match[1]), int(match[2]), int(match[3]))
        except ValueError:
            return None

    # 15/03/2026, 15-03, 15.3 (day first, as used in India)
    # (not ranges like "2-3 weeks" or "10-15 days")
    if match := re.search(r"\b(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?\b(?!\s*(?:days?|weeks?|months?|hours?|hrs?)\b)", t):
        year = int(match[3]) if match[3] else None
        if year is not None and year < 100:
            year += 2000
        if found := _future_date(today, int(match[2]), int(match[1]), year):
            return found

    # 15 March / 15th of March 2027 / March 15 / March 15th
    if match := re.search(rf"\b(\d{{1,2}})(?:st|nd|rd|th)?(?: of)? ({MONTH_PATTERN})\b(?: (\d{{4}}))?", t):
        return _future_date(today, MONTHS[match[2]], int(match[1]), int(match[3]) if match[3] else None)
    if match := re.search(rf"\b({MONTH_PATTERN}) (\d{{1,2}})(?:st|nd|rd|th)?\b(?: (\d{{4}}))?", t):
        return _future_date(today, MONTHS[match[1]], int(match[2]), int(match[3]) if match[3] else None)

    # 14th of this month / 3rd of next month / the 20th
    if match := re.search(r"\b(?:the )?(\d{1,2})(?:st|nd|rd|th)(?: of)? (this|next) month\b", t):
        day = int(match[1])
        year, month = today.year, today.month
        if match[2] == "next" or day < today.day:
            year, month = (year + 1, 1) if month == 12 else (year, month + 1)
        try:
            return date(year, month, day)
        except ValueError:
            return None
    if match := re.search(r"\b(?:on |by |before )?the (\d{1,2})(?:st|nd|rd|th)\b", t):
        day = int(match[1])
        year, month = today.year, today.month
        if day < today.day:
            year, month = (year + 1, 1) if month == 12 else (year, month + 1)
        try:
            return date(year, month, day)
        except ValueError:
            return None

    if re.search(r"\b(today|tonight)\b", t):
        return today
    if "day after tomorrow" in t:
        return today + timedelta(days=2)
    if re.search(r"\btomorrow\b", t):
        return today + timedelta(days=1)

    # in 10 days / 2 weeks / a month / couple of weeks / 48 hours
    if match := re.search(r"\b(\d+|" + "|".join(NUMBER_WORDS) + r")(?: of)? (day|week|fortnight|month)s?\b", t):
        if (amount := _amount(match[1])) is not None:
            return today + timedelta(days=amount * UNIT_DAYS[match[2]])
    if match := re.search(r"\b(\d+) (?:hours?|hrs?)\b", t):
        return today + timedelta(days=max(0, int(match[1]) // 24))
    if re.search(r"\b(a|one) fortnight\b", t):
        return today + timedelta(days=14)

    if "next weekend" in t:
        return _next_weekday(today, 6, skip_today=True) + timedelta(days=7)
    if re.search(r"\b(this weekend|weekend|end of (the )?week|this week)\b", t):
        return _next_weekday(today, 6, skip_today=False)
    if "next week" in t:
        return _next_weekday(today, 6, skip_today=True) + timedelta(days=7)
    if re.search(r"\b(end of (the )?month|this month)\b", t):
        return _last_day_of_month(today.year, today.month)
    if "next month" in t:
        month = today.month % 12 + 1
        return _last_day_of_month(today.year + (1 if month == 1 else 0), month)

    # (next) Friday
    for name, weekday in WEEKDAYS.items():
        if re.search(rf"\b{name}\b", t):
            return _next_weekday(today, weekday, skip_today=True)

    # Just a month: "March" -> end of March
    if match := re.search(rf"\b({MONTH_PATTERN})\b", t):
        month = MONTHS[match[1]]
        year = today.year if month >= today.month else today.year + 1
        return _last_day_of_month(year, month)

    return None


def deadline_from_details(details: Optional[ProjectDetails], today: date) -> Optional[date]:
    """The deadline the user gave, or, failing that, start + their available time."""

    if details is None:
        return None
    return parse_deadline(details.deadline, today) or parse_deadline(details.available_time, today)


# =========================================================
# TIMELINE
# =========================================================


class TimelinePhase(BaseModel):
    name: str
    days: int
    start_date: date
    end_date: date
    focus: list[str]


class ProjectTimeline(BaseModel):
    start_date: date
    deadline_date: date
    total_days: int
    phases: list[TimelinePhase]


# (name, weight, word patterns that make the phase relevant; None = always included).
# Patterns are matched on word boundaries, so "ml" never matches "html" or "email".
PHASE_RULES: list[tuple[str, int, Optional[str]]] = [
    ("Plan & set up", 1, None),
    ("UI / Frontend", 2, r"front-?end|ui|ux|apps?|react|react native|flutter|mobile|websites?|web|android|ios|expo|html|screens?|dashboards?"),
    ("Backend & database", 2, r"back-?end|apis?|servers?|databases?|flask|django|fastapi|node(\.js)?|express|firebase|mongodb|sql|postgres(ql)?|mysql|supabase"),
    ("Authentication", 1, r"log ?in|auth\w*|sign[ -]?in|sign[ -]?up|accounts?|otp|clerk|passwords?"),
    ("AI / ML model", 2, r"ai|ml|machine learning|ai models?|ml models?|datasets?|object detection|classif\w*|nlp|llms?|computer vision|tensorflow|pytorch|predictions?|image recognition|speech recognition"),
    ("Hardware & sensors", 2, r"arduino|raspberry( pi)?|esp32|sensors?|iot|hardware|robots?|microcontrollers?"),
    ("Core features", 2, None),
    ("Test & polish", 1, None),
]

FINAL_PHASE_DEMO = ("Demo & submission", 1)
FINAL_PHASE_LAUNCH = ("Deploy & launch", 1)
DEMO_PATTERN = r"hackathons?|demos?|present\w*|submission|submit|pitch\w*|college|judges?|viva"


def _mentions(pattern: str, corpus: str) -> bool:
    return re.search(rf"\b(?:{pattern})\b", corpus) is not None

FACT_PATTERN = re.compile(r"\*\*(frontend|backend|database|apis?|ai/ml models?|hardware[^*]*)\*\*\s*:\s*(.+)", re.IGNORECASE)
# "AI/ML Models: Not required for MVP", "No hardware needed", "None"
NOT_NEEDED = re.compile(
    r"(not required|not needed|none required|no .{0,40}(required|needed)|^none\b|:\s*none\b|^n/?a\b|\bunknown\b|not specified)",
    re.IGNORECASE,
)
# Lines that describe the user's resources or are headings, not work to do.
NOT_WORK = re.compile(r"^\s*#|available (hardware|software)|existing skills", re.IGNORECASE)


def _plan_facts(plan_text: str) -> dict[str, str]:
    facts: dict[str, str] = {}
    for label, value in FACT_PATTERN.findall(plan_text or ""):
        value = value.strip().rstrip(".")
        if not NOT_NEEDED.search(value):
            facts.setdefault(label.lower().split("/")[0].split(" ")[0], value)
    return facts


def _focus_for(name: str, facts: dict[str, str], details: Optional[ProjectDetails]) -> list[str]:
    features = [f for f in (details.preferred_features if details else None) or [] if f][:3]
    if name == "Plan & set up":
        return ["Lock the scope and must-have features", "Set up the repo, tools and accounts"]
    if name == "UI / Frontend":
        tech = facts.get("frontend")
        return ["Build the main screens and navigation"] + ([f"Use {tech}"] if tech else [])
    if name == "Backend & database":
        parts = [value for key in ("backend", "database") if (value := facts.get(key))]
        return ["Set up the API and data model"] + ([f"Use {' + '.join(parts)}"] if parts else [])
    if name == "Authentication":
        return ["Sign up, log in and protect user data"]
    if name == "AI / ML model":
        tech = facts.get("ai")
        return ["Pick or train the model and test it on real data"] + ([f"Use {tech}"] if tech else [])
    if name == "Hardware & sensors":
        tech = facts.get("hardware")
        return ["Wire up and test the hardware"] + ([tech] if tech else [])
    if name == "Core features":
        return [f"Build: {feature}" for feature in features] or ["Build the features that make the idea work"]
    if name == "Test & polish":
        return ["Fix bugs and rough edges", "Try it end to end like a real user"]
    if name == "Demo & submission":
        return ["Prepare the demo and slides", "Record a backup video and submit"]
    return ["Deploy and share it with the first users"]


def _allocate_days(weights: list[int], total_days: int) -> list[int]:
    """At least one day each, the rest split by weight (largest remainder)."""

    days = [1] * len(weights)
    extra = total_days - len(weights)
    if extra <= 0:
        return days
    total_weight = sum(weights)
    shares = [extra * weight / total_weight for weight in weights]
    for index, share in enumerate(shares):
        days[index] += int(share)
    remaining = total_days - sum(days)
    for index in sorted(range(len(weights)), key=lambda i: shares[i] - int(shares[i]), reverse=True)[:remaining]:
        days[index] += 1
    return days


def build_timeline(
    start: date,
    deadline: date,
    details: Optional[ProjectDetails],
    plan_text: str = "",
    extra_text: str = "",
) -> ProjectTimeline:
    start = min(start, deadline)
    total_days = (deadline - start).days + 1

    # Only what the user and the plan actually say: field VALUES (not names like
    # "available_hardware"), and no lines that rule something out ("AI/ML: Not required").
    detail_values: list[str] = []
    if details:
        resources = {"available_hardware", "available_software", "technical_skills"}
        for field, value in details.model_dump(exclude_none=True).items():
            if field not in resources:
                detail_values.extend(value if isinstance(value, list) else [str(value)])
    plan_lines = [line for line in (plan_text or "").splitlines() if not NOT_NEEDED.search(line) and not NOT_WORK.search(line)]
    corpus = " " + " ".join([*plan_lines, extra_text, *detail_values]).lower() + " "

    selected = [(name, weight) for name, weight, pattern in PHASE_RULES if pattern is None or _mentions(pattern, corpus)]
    project_type = details.project_type if details else None
    demo = project_type in ("hackathon", "college_project", "academic_research") or _mentions(DEMO_PATTERN, corpus)
    selected.append(FINAL_PHASE_DEMO if demo else FINAL_PHASE_LAUNCH)

    # Fewer days than phases: merge neighbouring phases into one per day.
    if total_days < len(selected):
        groups: list[list[tuple[str, int]]] = [[] for _ in range(total_days)]
        for index, phase in enumerate(selected):
            groups[index * total_days // len(selected)].append(phase)
        merged = [(" + ".join(name for name, _ in group), sum(weight for _, weight in group)) for group in groups]
        names_per_group = [[name for name, _ in group] for group in groups]
        allocations = [1] * total_days
    else:
        merged = selected
        names_per_group = [[name] for name, _ in selected]
        allocations = _allocate_days([weight for _, weight in selected], total_days)

    facts = _plan_facts(plan_text)
    phases: list[TimelinePhase] = []
    cursor = start
    for (name, _), days, members in zip(merged, allocations, names_per_group):
        focus: list[str] = []
        for member in members:
            focus.extend(_focus_for(member, facts, details))
        phases.append(
            TimelinePhase(
                name=name,
                days=days,
                start_date=cursor,
                end_date=cursor + timedelta(days=days - 1),
                focus=focus[:3],
            )
        )
        cursor += timedelta(days=days)

    return ProjectTimeline(start_date=start, deadline_date=deadline, total_days=total_days, phases=phases)
