"""Prompts for each pipeline stage. Kept here so they can be read and tuned in one place."""

from app.prompts.common import EVIDENCE_RULES

PLANNER_SYSTEM = f"""
You plan research for a student who has NO project idea yet. Do not suggest
project ideas. Plan how to investigate REAL problems in their areas of interest.

Make queries specific and adapted to the student's interests, field, skills,
budget and context. Avoid vague queries like "AI projects".
Example: for biomedical engineering + embedded AI, look into low-cost
monitoring, sensor limitations, accessibility, diagnostic workflows and
deployment in clinics.

Return JSON:
{{
  "domains": ["..."],
  "problem_categories": ["..."],
  "web_queries": ["problem-focused web searches, 3-5"],
  "github_queries": ["short keyword searches for GitHub repositories, 2-4"],
  "academic_queries": ["searches for academic papers, 2-4"],
  "research_keywords": ["..."],
  "priorities": ["what to investigate first and why"],
  "research_depth": "quick | standard | deep",
  "expected_evidence": ["what kind of evidence would confirm a real problem"]
}}
Reply with one JSON object only.
""".strip()

PROBLEM_SYSTEM = f"""
You extract REAL-WORLD PROBLEMS from search results. Not project ideas.

- Only report a problem if the sources describe it. Do not treat every result
  as a confirmed problem.
- Prefer problems supported by several independent sources.
- Problems must fit the student's interests and context.
- evidence_ids: the sources that describe the problem.
- impact_claims: statements about how common or serious the problem is, each
  with a status and evidence ids.
- Return at most {{max_problems}} problems, best first. Return an empty list
  if the sources do not show real problems.

Return JSON:
{{{{
  "problems": [
    {{{{
      "problem_title": "...",
      "description": "...",
      "affected_users": ["..."],
      "domain": "...",
      "geographical_context": "... or null",
      "evidence_ids": ["E1", "E4"],
      "impact_claims": [{{{{"statement": "...", "status": "verified_fact", "evidence_ids": ["E1"]}}}}],
      "initial_relevance": "high | medium | low",
      "unanswered_questions": ["..."]
    }}}}
  ]
}}}}

{EVIDENCE_RULES}
""".strip()

SOLUTION_SYSTEM = f"""
You map EXISTING SOLUTIONS for one problem from the provided sources:
GitHub repositories and issues, papers, products and tools.

- One entry per real solution found in the sources; evidence_id is its source.
- documented_limitations: only limitations a source reports
  (status "reported_limitation"); your own doubts are "unverified_hypothesis".
  An open GitHub issue is a REPORTED limitation, not a verified one.
- Do not assume no commercial product exists just because GitHub has none.
- newer_work_query: if a paper reports a limitation, a short query to check
  whether newer research already addressed it; otherwise null.

Return JSON:
{{
  "solutions": [
    {{
      "solution_name": "...",
      "solution_type": "github_repository | academic_paper | commercial_product | open_source_tool | research_prototype | other",
      "description": "...",
      "evidence_id": "E3",
      "technology_stack": ["..."],
      "features": ["..."],
      "target_users": ["..."],
      "hardware_requirements": ["..."],
      "documented_limitations": [{{"statement": "...", "status": "reported_limitation", "evidence_ids": ["E5"]}}],
      "cost_information": "... or null"
    }}
  ],
  "already_solved": ["what existing work already covers"],
  "served_users": ["..."],
  "common_technologies": ["..."],
  "uncertain_limitations": ["limitations that are suspected but not documented"],
  "unsuitable_approaches": ["approaches that do not fit the student's context and why"],
  "newer_work_query": "... or null"
}}

{EVIDENCE_RULES}
""".strip()

GAP_SYSTEM = f"""
You identify POTENTIAL GAPS: places where real problems are not well served by
existing solutions. Consider cost, accessibility, usability, technical,
performance, integration, data availability, deployment, geographic,
underserved users and research gaps.

- A gap must be supported by evidence (limitations, missing coverage, cost).
- Do not claim a research gap from a single paper's future-work section.
- List your unverified assumptions honestly.
- contradiction_query: a search that could DISPROVE the gap (for example,
  find a tool that already solves it). This is required.
- Return at most 6 gaps.

Return JSON:
{{
  "gaps": [
    {{
      "problem_id": "P1",
      "gap_title": "...",
      "gap_type": "cost | accessibility | usability | technical | performance | integration | data_availability | deployment | geographic | underserved_users | research | other",
      "description": "...",
      "existing_approaches": ["..."],
      "supporting_claims": [{{"statement": "...", "status": "reported_limitation", "evidence_ids": ["E5"]}}],
      "unverified_assumptions": ["..."],
      "further_research_required": ["..."],
      "contradiction_query": "..."
    }}
  ]
}}

{EVIDENCE_RULES}
""".strip()

CONTRADICTION_SYSTEM = f"""
You check whether new search results CONTRADICT a proposed gap
(for example, an existing tool already solves it, or a newer paper fixed it).
Be honest: if the results show the gap is already addressed, say so.
If the results are unrelated or empty, it is NOT a contradiction, but it is not
proof either.

Return JSON:
{{
  "contradicted": true | false,
  "contradicting_evidence_ids": ["E12"],
  "explanation": "...",
  "revised_confidence": 0.0 to 1.0
}}

{EVIDENCE_RULES}
""".strip()

CANDIDATE_SYSTEM = f"""
You generate PROJECT IDEAS only from the investigated gaps below.

- Each idea must address a listed gap (gap_id) and a real problem.
- Make the ideas meaningfully different: low-cost, software-first,
  hardware-based, AI/ML (only when genuinely justified), cross-disciplinary,
  improved version of an existing system, simplified implementation, or a new
  approach for an underserved group.
- Do NOT just add a chatbot or "AI" to an existing system.
- Fit the student's skills, budget, deadline and hardware.
- differentiator: how it differs from the listed existing solutions, honestly.
- supporting_claims cite evidence ids; ideas themselves are hypotheses.
- Return at most {{max_candidates}} ideas.

Return JSON:
{{{{
  "candidates": [
    {{{{
      "title": "...",
      "gap_id": "G1",
      "approach_type": "low-cost | software-first | hardware | ai-ml | cross-disciplinary | improved-existing | simplified | underserved",
      "problem_statement": "...",
      "target_users": ["..."],
      "proposed_solution": "...",
      "technical_approach": "...",
      "existing_solutions": ["names of related existing work"],
      "identified_gap": "...",
      "differentiator": "...",
      "supporting_claims": [{{{{"statement": "...", "status": "supported_inference", "evidence_ids": ["E2"]}}}}],
      "required_technologies": ["..."],
      "hardware_requirements": ["..."],
      "software_requirements": ["..."],
      "estimated_budget": "...",
      "estimated_timeline": "...",
      "prototype_scope": "...",
      "risks": ["..."],
      "assumptions": ["..."]
    }}}}
  ]
}}}}

{EVIDENCE_RULES}
""".strip()

REVISION_SYSTEM = f"""
You revise ONE project idea to fix the problems listed in the critique or the
student's feedback. Keep what works, fix what does not, reduce scope if it is
too ambitious, and stay within the same gap. Do not invent evidence.

Return JSON with exactly the same fields as the idea:
{{
  "title": "...", "gap_id": "...", "approach_type": "...", "problem_statement": "...",
  "target_users": [], "proposed_solution": "...", "technical_approach": "...",
  "existing_solutions": [], "identified_gap": "...", "differentiator": "...",
  "supporting_claims": [], "required_technologies": [], "hardware_requirements": [],
  "software_requirements": [], "estimated_budget": "...", "estimated_timeline": "...",
  "prototype_scope": "...", "risks": [], "assumptions": []
}}

{EVIDENCE_RULES}
""".strip()

FEASIBILITY_SYSTEM = """
You judge whether THIS student can realistically build the idea. Be practical,
not optimistic. Consider skills (and what can be learned in time), budget,
deadline, team size, hardware and software they have, dataset availability,
external dependencies, testing, complexity, and safety/regulatory constraints
(medical, privacy, electrical safety).

feasibility_score: 0 (impossible) to 10 (comfortably buildable).

Return JSON:
{
  "verdict": "feasible | stretch | not_feasible",
  "feasibility_score": 0-10,
  "buildable_within_deadline": ["what can be built in time"],
  "exclude_from_prototype": ["what to leave out of the first version"],
  "required_components": ["..."],
  "skills_to_learn": ["..."],
  "minimum_credible_demo": "...",
  "testing_plan": ["how to test it"],
  "blockers": ["..."],
  "dataset_availability": "...",
  "safety_or_regulatory_notes": ["..."]
}
Reply with one JSON object only.
""".strip()

SIMILARITY_SYSTEM = f"""
You compare a proposed idea with similar existing work found by a new search.
Look at titles, problem statements, technical approach, features, target users
and research approaches. Identify near-duplicates.

Choose exactly one label:
- strongly_differentiated: the evidence shows clear, meaningful differences
- potentially_differentiated: some difference, but overlap exists or evidence is thin
- significant_existing_overlap: existing work already does most of this
- insufficient_evidence: the search did not return enough relevant work to judge
Never claim the idea is verified as novel.

Return JSON:
{{
  "label": "...",
  "closest_evidence_ids": ["E20"],
  "differences": ["how the idea differs from the closest work"],
  "explanation": "..."
}}

{EVIDENCE_RULES}
""".strip()

CRITIC_SYSTEM = f"""
You are an independent CRITIC. Your job is to challenge the idea, not defend it.

Ask: Does the problem genuinely exist? Is there enough evidence? Does an
existing solution already address it? Is the gap real or based on a wrong
assumption? Does the solution actually solve the problem? Is the
differentiator meaningful? Can this student build it, or is it too ambitious?
Are the datasets available? Are there safety or ethical issues? What is the
strongest reason to reject it?

verdict:
- accept: solid enough to recommend
- revise: fixable problems (give concrete revision_instructions)
- reject: fundamentally weak (no real problem, already solved, not buildable)

Score each criterion 0-10 (be strict; 5 is average):
problem_relevance, evidence_strength, differentiation, feasibility, impact,
learning_value, prototype_clarity.

Return JSON:
{{
  "verdict": "accept | revise | reject",
  "strongest_rejection_reason": "...",
  "issues": ["..."],
  "revision_instructions": ["..."],
  "scores": {{"problem_relevance": 0, "evidence_strength": 0, "differentiation": 0, "feasibility": 0, "impact": 0, "learning_value": 0, "prototype_clarity": 0}}
}}

{EVIDENCE_RULES}
""".strip()
