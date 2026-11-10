"""A scripted model and fake research sources, so tests need no network, model or API keys."""

import json
import re
from typing import Callable

from app.core.exceptions import SourceRateLimitedError, SourceUnavailableError
from app.schemas.evidence import SourceRecord

IDS = re.compile(r"\[(E\d+)\]")

STAGE_MARKERS = {
    "planner": "You plan research",
    "problems": "extract REAL-WORLD PROBLEMS",
    "solutions": "map EXISTING SOLUTIONS",
    "gaps": "identify POTENTIAL GAPS",
    "contradiction": "CONTRADICT a proposed gap",
    "candidates": "generate PROJECT IDEAS",
    "revision": "revise ONE project idea",
    "feasibility": "judge whether THIS student",
    "similarity": "compare a proposed idea",
    "critic": "independent CRITIC",
}

GOOD_SCORES = {"problem_relevance": 8, "evidence_strength": 7, "differentiation": 7, "feasibility": 8,
               "impact": 7, "learning_value": 8, "prototype_clarity": 8}


def ids_in(text: str) -> list[str]:
    return list(dict.fromkeys(IDS.findall(text)))


def idea(title: str, gap_id: str = "G1", evidence: str = "E1") -> dict:
    return {
        "title": title, "gap_id": gap_id, "approach_type": "low-cost",
        "problem_statement": "Rural clinics cannot monitor patient vitals continuously.",
        "target_users": ["rural clinic nurses"], "proposed_solution": f"{title}: a cheap wearable that logs vitals offline.",
        "technical_approach": "ESP32 with a pulse oximeter sensor and an offline Android app.",
        "existing_solutions": ["OpenVitals"], "identified_gap": "cost", "differentiator": "Works fully offline under 2000 rupees.",
        "supporting_claims": [{"statement": "Existing monitors are expensive.", "status": "verified_fact", "evidence_ids": [evidence]}],
        "required_technologies": ["ESP32", "Kotlin"], "hardware_requirements": ["ESP32", "MAX30102"],
        "software_requirements": ["Android Studio"], "estimated_budget": "1500 rupees", "estimated_timeline": "6 weeks",
        "prototype_scope": "One device and one app screen.", "risks": ["sensor noise"], "assumptions": ["clinics have phones"],
    }


def default_reply(stage: str, user: str) -> dict:
    ids = ids_in(user) or ["E1"]
    if stage == "planner":
        return {"domains": ["healthcare"], "problem_categories": ["rural patient monitoring"],
                "web_queries": ["rural clinic vital sign monitoring problems"], "github_queries": ["vital signs monitor"],
                "academic_queries": ["low cost patient monitoring rural"], "research_keywords": ["remote monitoring"],
                "priorities": ["cost"], "research_depth": "standard", "expected_evidence": ["reports"]}
    if stage == "problems":
        return {"problems": [{"problem_title": "Rural clinics lack continuous vital monitoring",
                              "description": "Nurses check vitals manually a few times a day.",
                              "affected_users": ["nurses"], "domain": "healthcare", "evidence_ids": ids[:3],
                              "impact_claims": [{"statement": "Manual checks miss deterioration.", "status": "verified_fact",
                                                 "evidence_ids": ids[:1]}],
                              "initial_relevance": "high", "unanswered_questions": ["How many clinics?"]}]}
    if stage == "solutions":
        return {"solutions": [{"solution_name": "OpenVitals", "solution_type": "github_repository",
                               "evidence_id": ids[0], "source_url": "https://invented.example/fake",
                               "documented_limitations": [{"statement": "Needs Wi-Fi.", "status": "reported_limitation",
                                                           "evidence_ids": ids[-1:]}]}],
                "already_solved": ["hospital monitoring"], "newer_work_query": "offline vital monitoring"}
    if stage == "gaps":
        return {"gaps": [
            {"problem_id": "P1", "gap_title": "No offline low-cost monitor", "gap_type": "cost", "description": "Existing tools need Wi-Fi.",
             "supporting_claims": [{"statement": s, "status": "reported_limitation", "evidence_ids": [i]}
                                   for s, i in zip(["Needs Wi-Fi", "Costly", "Hard to use"], ids[:3])],
             "contradiction_query": "offline low cost vital monitor"},
            {"problem_id": "P1", "gap_title": "Interfaces not in local languages", "gap_type": "usability",
             "description": "English-only apps.",
             "supporting_claims": [{"statement": "English only", "status": "verified_fact", "evidence_ids": ids[:2]}],
             "contradiction_query": "vital monitor local language app"},
        ]}
    if stage == "contradiction":
        return {"contradicted": False, "contradicting_evidence_ids": [], "explanation": "Results are unrelated.", "revised_confidence": 0.7}
    if stage == "candidates":
        return {"candidates": [idea("Offline Vitals Band", "G1", ids[0]), idea("Local Language Vitals App", "G2", ids[0]),
                               idea("Solar Vitals Kiosk", "G1", ids[0]), idea("Invented Gap Idea", "G9", ids[0])]}
    if stage == "revision":
        title = re.search(r'"title":\s*"([^"]+)"', user)
        return idea((title.group(1) if title else "Idea") + " (revised)")
    if stage == "feasibility":
        return {"verdict": "feasible", "feasibility_score": 8, "minimum_credible_demo": "Live readings on the phone",
                "dataset_availability": "Collected by the device", "testing_plan": ["compare with a clinical oximeter"]}
    if stage == "similarity":
        return {"label": "potentially_differentiated", "closest_evidence_ids": ids[:1], "differences": ["offline"], "explanation": "Similar but online-only."}
    if stage == "critic":
        return {"verdict": "accept", "strongest_rejection_reason": "Sensor accuracy", "issues": [], "scores": GOOD_SCORES}
    raise AssertionError(stage)


class FakeLLM:
    """Replies by stage. `overrides[stage]` may be a dict/str, or a callable(user, call_number) -> dict/str."""

    def __init__(self, overrides: dict[str, object] | None = None):
        self.overrides = overrides or {}
        self.calls: list[tuple[str, str]] = []

    def stage_of(self, system: str) -> str:
        return next(stage for stage, marker in STAGE_MARKERS.items() if marker in system)

    async def complete(self, system: str, user: str, *, json_mode: bool = True) -> str:
        stage = self.stage_of(system)
        self.calls.append((stage, user))
        number = sum(1 for s, _ in self.calls if s == stage)
        reply = self.overrides.get(stage)
        if callable(reply):
            reply = reply(user, number)
        if reply is None:
            reply = default_reply(stage, user)
        return reply if isinstance(reply, str) else json.dumps(reply)

    def count(self, stage: str) -> int:
        return sum(1 for s, _ in self.calls if s == stage)


def _records(provider: str, source_type: str, query: str, count: int, **meta) -> list[SourceRecord]:
    slug = re.sub(r"[^a-z0-9]+", "-", query.lower()).strip("-")
    return [SourceRecord(title=f"{query} — {provider} result {n}", url=f"https://{provider}.test/{slug}/{n}",
                         source_type=source_type, provider=provider,
                         excerpt=f"Report about {query}: monitoring is expensive and needs connectivity.",
                         published_date="2024-05-01", metadata={**meta, "full_name": f"org/{slug}-{n}"})
            for n in range(1, count + 1)]


class FakeWeb:
    name = "fakeweb"

    def __init__(self, error: Exception | None = None):
        self.error, self.queries = error, []

    async def search(self, query: str, *, limit: int, topic: str = "general") -> list[SourceRecord]:
        self.queries.append(query)
        if self.error:
            raise self.error
        return _records(f"web-{topic}", "news" if topic == "news" else "web_page", query, 2)


class FakeGitHub:
    name = "github"

    def __init__(self, error: Exception | None = None):
        self.error, self.calls = error, []

    async def search_repositories(self, query: str, *, limit: int) -> list[SourceRecord]:
        self.calls.append(("repos", query))
        if self.error:
            raise self.error
        return _records("github", "github_repository", query, 2, stars=40)

    async def readme_excerpt(self, full_name: str, *, limit: int = 1500) -> str:
        self.calls.append(("readme", full_name))
        return "A vitals monitor. Requires Wi-Fi."

    async def open_issues(self, full_name: str, *, limit: int) -> list[SourceRecord]:
        self.calls.append(("issues", full_name))
        return _records("github-issues", "github_issue", full_name, 1)

    async def search_issues(self, query: str, *, limit: int) -> list[SourceRecord]:
        self.calls.append(("search_issues", query))
        if self.error:
            raise self.error
        return _records("github-issues", "github_issue", query, 1)


class FakeOpenAlex:
    name = "openalex"

    def __init__(self, results: bool = True):
        self.results, self.calls = results, []

    async def search(self, query: str, *, limit: int, from_date: str | None = None) -> list[SourceRecord]:
        self.calls.append((query, from_date))
        return _records("doi", "academic_paper", query, 2) if self.results else []


def fake_sources(**overrides) -> dict:
    return {"web": FakeWeb(), "github": FakeGitHub(), "openalex": FakeOpenAlex(), "semantic_scholar": None, **overrides}


__all__ = ["FakeLLM", "FakeWeb", "FakeGitHub", "FakeOpenAlex", "fake_sources", "SourceRateLimitedError",
           "SourceUnavailableError", "idea", "GOOD_SCORES", "Callable"]
