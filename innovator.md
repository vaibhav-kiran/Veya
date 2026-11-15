PROJECT: VEYA — Research-Driven Idea Discovery Engine

1. Your Role

Act as a senior AI systems architect, Python backend engineer, AI research engineer, and product developer.

Your task is to design and build an independent research-driven idea discovery engine for VEYA.

This is NOT a simple AI idea generator.

VEYA should behave like an intelligent research assistant that investigates real-world problems, searches existing solutions, studies research papers, identifies potential gaps, evaluates opportunities, and recommends projects that students can realistically build.

The objective is to help students who have no initial project idea discover meaningful, innovative, technically feasible project opportunities.

You must build this as a standalone project because it will be developed on a different laptop and integrated into the main VEYA application later.

Do not assume that the main VEYA backend, its files, database, or services are available on this machine.

The entire implementation must be portable and integration-ready.

⸻

2. Core Product Vision

The Idea Discovery Engine should follow this principle:

“Don’t generate ideas first. Investigate problems first, understand what already exists, identify what is missing, and then determine what the student can realistically build.”

The system should:

1. Understand the student’s academic field, interests, skills, and resources.
2. Discover real-world problems using online sources.
3. Investigate existing open-source projects on GitHub.
4. Research existing academic solutions and publications.
5. Examine existing commercial products and approaches.
6. Identify potential gaps and unmet needs.
7. Generate multiple solution approaches.
8. Evaluate whether each solution is genuinely different.
9. Check whether the student can realistically build it.
10. Critically challenge and reject weak ideas.
11. Return the strongest three project opportunities with supporting evidence.

Never claim that an idea is completely novel merely because a search did not find an identical project.

Clearly distinguish verified facts, reported limitations, inferences, and unverified hypotheses.

⸻

3. Technology Stack

Use the following technologies:

Component	Technology
Programming language	Python 3.12+
Backend framework	FastAPI
Reasoning model	Qwen 2.5 7B
Local model runtime	Ollama
LLM integration	OpenAI Python SDK
Web research	Tavily API or configurable alternative
Open-source research	GitHub REST API
Academic research	OpenAlex API
Additional academic research	Semantic Scholar API (optional)
Biomedical literature	PubMed E-utilities (optional)
Data validation	Pydantic
Environment management	uv
Configuration	python-dotenv
Database	SQLite initially; PostgreSQL-compatible design
Testing	pytest

Model configuration

Use the existing local Qwen model through an OpenAI-compatible Ollama endpoint.

Default configuration:

LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434/v1
OLLAMA_MODEL=qwen2.5:7b
OLLAMA_API_KEY=ollama

Do not hardcode the model name throughout the application.

Build a configurable model-provider interface so Groq or another OpenAI-compatible provider can be added later without rewriting the research pipeline.

For the first version, implement Ollama only. Do not waste time implementing unnecessary providers.

⸻

4. Research APIs

Implement the following integrations.

A. GitHub REST API

Official documentation:
https://docs.github.com/en/rest

VEYA must be able to:

* Search public repositories.
* Search repositories by technology, domain, and problem.
* Retrieve repository descriptions and metadata.
* Retrieve README content.
* Examine repository structure.
* Inspect open issues and reported limitations.
* Retrieve relevant source files when necessary.
* Examine repository activity and last update dates.
* Identify similar implementations.

Do not download entire repositories unnecessarily.

Use GitHub authentication through an optional personal access token stored in .env.

Respect GitHub API rate limits.

Do not assume an open issue represents a verified technical limitation.

B. Web Search API

Primary recommendation: Tavily.

Documentation:
https://docs.tavily.com/

Implement:

* Search for real-world problems.
* Search for news and recent developments.
* Search for existing products.
* Search for user complaints and documented limitations.
* Retrieve relevant source information.
* Preserve URLs, source titles, and dates where available.

Keep the search provider modular so Brave Search or self-hosted SearXNG can be added later.

Do not fabricate search results or sources.

C. OpenAlex API

Documentation:
https://docs.openalex.org/

Use OpenAlex to:

* Search academic papers.
* Find papers relevant to identified problems.
* Retrieve abstracts when available.
* Retrieve authors and publication dates.
* Retrieve DOI and source information.
* Find related research.
* Investigate whether documented limitations have been addressed by newer publications.

Use Semantic Scholar or PubMed as optional additional sources when relevant.

Do not claim a research gap based only on one paper’s future-work section.

⸻

5. Core Research Pipeline

This is the most important part of the application.

Build a multi-stage orchestration pipeline.

Do not put the entire workflow into one enormous LLM prompt.

Each stage should have a defined input, output, validation schema, and responsibility.

STAGE 1 — Student Profile Understanding

Collect the following information:

{
  "academic_field": "",
  "academic_level": "",
  "interests": [],
  "technical_skills": [],
  "preferred_domains": [],
  "available_hardware": [],
  "available_software": [],
  "budget": null,
  "deadline": "",
  "team_size": null,
  "project_type": "",
  "preferred_technology": [],
  "constraints": [],
  "additional_information": []
}

The system must accept incomplete information.

Do not force students to fill every field.

If information is missing, either ask a relevant question or proceed with clearly stated assumptions.

Support different project purposes:

* Hackathon.
* Final-year project.
* Academic mini-project.
* Research project.
* Startup concept.
* Personal learning project.

STAGE 2 — Research Planning

Use Qwen to create a structured research plan based on the student profile.

The research plan should contain:

* Main domains to investigate.
* Problem categories.
* Search queries.
* Relevant research keywords.
* GitHub search terms.
* Academic search terms.
* Search priorities.
* Research depth.
* Expected evidence.

Generate targeted queries instead of sending vague searches.

For example, if the student is interested in biomedical engineering and embedded AI, search for problems involving low-cost monitoring, sensor limitations, accessibility, diagnostic workflows, and healthcare deployment.

The queries must be adapted to the student’s interests and constraints.

STAGE 3 — Real-World Problem Discovery

Search relevant sources:

* News articles.
* Public reports.
* Government publications.
* GitHub issues.
* Academic publications.
* Existing product reviews.
* Public discussions.
* Available datasets.

Extract potential problems.

For every potential problem, record:

{
  "problem_id": "",
  "problem_title": "",
  "description": "",
  "affected_users": [],
  "domain": "",
  "geographical_context": "",
  "source_references": [],
  "frequency_or_impact_evidence": [],
  "initial_relevance": "",
  "unanswered_questions": []
}

Do not treat every search result as a confirmed problem.

Look for repeated signals from independent sources where possible.

STAGE 4 — Existing Solution Investigation

For each promising problem, search:

1. GitHub repositories.
2. Academic papers.
3. Commercial products.
4. Open-source tools.
5. Existing research prototypes.
6. Related implementations.

For every existing solution, capture:

{
  "solution_name": "",
  "solution_type": "",
  "description": "",
  "source_url": "",
  "technology_stack": [],
  "features": [],
  "target_users": [],
  "hardware_requirements": [],
  "documented_limitations": [],
  "cost_information": null,
  "last_updated": null
}

Compare the solutions.

Determine:

* What has already been solved?
* Which users are served?
* What technologies are used?
* What limitations are documented?
* What limitations remain uncertain?
* Which approaches are unsuitable for the identified environment?

Do not assume commercial products do not exist simply because no GitHub repository is available.

STAGE 5 — Gap Analysis

This stage must analyse the collected evidence and identify potential opportunities.

Investigate different types of gaps:

* Cost gaps.
* Accessibility gaps.
* Usability gaps.
* Technical gaps.
* Performance gaps.
* Integration gaps.
* Data availability gaps.
* Deployment gaps.
* Geographic or environmental gaps.
* Underserved user groups.
* Research gaps.

For every potential gap, generate:

{
  "gap_id": "",
  "problem_id": "",
  "gap_title": "",
  "description": "",
  "existing_approaches": [],
  "supporting_evidence": [],
  "contradicting_evidence": [],
  "evidence_strength": "",
  "confidence": 0.0,
  "unverified_assumptions": [],
  "further_research_required": []
}

The model must actively search for evidence that contradicts its own hypothesis.

A lack of search results is not proof that no solution exists.

STAGE 6 — Candidate Idea Generation

Only after investigating the problem and existing solutions should Qwen generate candidate ideas.

Generate several meaningfully different approaches.

Explore:

* Low-cost alternatives.
* Software-first approaches.
* Hardware-based approaches.
* AI/ML approaches when genuinely justified.
* Cross-disciplinary approaches.
* Improved versions of existing systems.
* Simplified implementations.
* New approaches to underserved use cases.

For every candidate:

{
  "idea_id": "",
  "title": "",
  "problem_statement": "",
  "target_users": [],
  "proposed_solution": "",
  "technical_approach": "",
  "existing_solutions": [],
  "identified_gap": "",
  "differentiator": "",
  "supporting_evidence": [],
  "required_technologies": [],
  "hardware_requirements": [],
  "software_requirements": [],
  "estimated_budget": "",
  "estimated_timeline": "",
  "prototype_scope": "",
  "risks": [],
  "assumptions": []
}

Do not generate ideas that simply add a chatbot or AI feature to an existing system without addressing a meaningful problem.

STAGE 7 — Student-Specific Feasibility Analysis

Evaluate whether the student can build each candidate.

Consider:

* Existing skills.
* Skills that can realistically be learned.
* Budget.
* Deadline.
* Team size.
* Hardware availability.
* Software availability.
* Dataset availability.
* External dependencies.
* Testing requirements.
* Technical complexity.
* Safety and regulatory constraints.

For every candidate, define:

1. What can be built within the deadline?
2. What should be excluded from the first prototype?
3. What components are required?
4. What skills must be learned?
5. What is the minimum credible demonstration?
6. How can the project be tested?

Do not recommend an unrealistic project simply because it sounds innovative.

STAGE 8 — Similarity and Novelty Investigation

Search again for the generated candidate ideas.

Use different search terms and compare:

* Similar project titles.
* Similar problem statements.
* Similar technical implementations.
* Similar features.
* Similar target users.
* Similar research approaches.

Identify near-duplicate projects.

The system must explain how the proposed solution differs from existing approaches.

Do not claim verified novelty.

Use labels such as:

* Strongly differentiated based on available evidence.
* Potentially differentiated.
* Significant existing overlap.
* Insufficient evidence to assess.

STAGE 9 — Independent Critic

Create a separate critic stage.

The critic’s role is to challenge the candidate, not defend it.

Ask:

* Does this problem genuinely exist?
* Is there enough evidence?
* Does an existing solution already address it?
* Is the proposed gap real or based on an incorrect assumption?
* Does the proposed solution actually solve the problem?
* Is the differentiator meaningful?
* Can the student build it?
* Is the project too ambitious?
* Are the required datasets available?
* Are there safety or ethical issues?
* What is the strongest reason to reject this idea?

If an idea fails, return it for revision or discard it.

Implement a limited revision loop, for example, a maximum of two rounds.

Do not keep revising an idea indefinitely.

STAGE 10 — Ranking and Final Selection

Rank the surviving candidates using a transparent scoring system.

Suggested criteria:

Criterion	Weight
Problem relevance	20%
Evidence strength	20%
Meaningful differentiation	15%
Student feasibility	20%
Potential impact	10%
Technical learning value	10%
Prototype clarity	5%

These weights should be configurable.

Do not use the score as a scientific measure of novelty.

The final response should contain the three strongest candidates, with explanations of why they were selected.

If fewer than three candidates meet the minimum quality requirements, return fewer. Never invent weak candidates to fill the list.

⸻

6. Adaptive Research Orchestration

The workflow must not be a rigid linear sequence.

It should support conditional investigation.

Examples:

* If an existing GitHub project is found, investigate its issues and limitations.
* If a research paper identifies a limitation, search for newer publications addressing it.
* If a similar project is discovered, investigate whether the student’s proposed differentiator is meaningful.
* If evidence contradicts a gap, update or discard the hypothesis.
* If the project exceeds the student’s budget, investigate lower-cost alternatives.
* If the dataset is unavailable, investigate alternative datasets or prototype approaches.
* If a solution is too ambitious, reduce its scope.

Use a bounded research loop with configurable limits:

MAX_RESEARCH_ROUNDS=3
MAX_CANDIDATES=8
MAX_FINAL_IDEAS=3
MAX_CRITIC_ROUNDS=2
MAX_SEARCH_RESULTS_PER_QUERY=5

The system must avoid unlimited API calls.

Cache search results and avoid repeating identical queries.

⸻

7. Evidence Management

This is a critical requirement.

Every important research claim must be traceable to a source.

Build an evidence manager that:

* Stores source title.
* Stores source URL.
* Stores source type.
* Stores publication date when available.
* Stores retrieval date.
* Stores relevant supporting excerpts.
* Connects evidence to problems, gaps, and candidate ideas.
* Deduplicates repeated sources.
* Tracks contradictory findings.
* Records whether a claim is verified or inferred.

Use these evidence statuses:

verified_fact
reported_limitation
supported_inference
unverified_hypothesis
contradicted_claim

Do not fabricate:

* URLs.
* Paper titles.
* Authors.
* Publication dates.
* GitHub repositories.
* Statistics.
* Research findings.

If a source cannot be accessed or verified, mark it accordingly.

Never generate fake citations.

⸻

8. API Design

Build FastAPI endpoints that make the engine usable independently.

Suggested endpoints:

POST /api/v1/idea-discovery/start
POST /api/v1/idea-discovery/{session_id}/research
GET  /api/v1/idea-discovery/{session_id}/status
GET  /api/v1/idea-discovery/{session_id}/results
GET  /api/v1/ideas/{idea_id}
POST /api/v1/ideas/{idea_id}/refine
POST /api/v1/ideas/{idea_id}/evaluate
GET  /health

Define clear Pydantic request and response schemas.

Support long-running research tasks without blocking the API.

Use background tasks or an appropriate task architecture.

Support session isolation.

Provide meaningful error messages and handle external API failures.

Keep the API versioned under /api/v1/.

⸻

9. Integration Requirements — VERY IMPORTANT

This project is being developed on a separate laptop.

It will be integrated into the main VEYA application later.

Therefore:

1. Build this as a completely independent service.
2. Do not assume access to the existing VEYA backend.
3. Do not modify or recreate VEYA’s existing Language Layer, Perception Layer, Reasoning Layer, Gnani STT, or Gnani TTS.
4. Do not create dependencies on files that exist only on the other laptop.
5. Do not hardcode absolute filesystem paths.
6. Keep configuration in .env.
7. Use environment variables for model and API configuration.
8. Expose all functionality through documented REST APIs.
9. Keep input and output schemas stable and clearly documented.
10. Ensure the service can run independently through FastAPI.
11. Provide a README explaining setup, dependencies, API endpoints, environment variables, and execution.
12. Provide sample JSON requests and responses.
13. Provide a clear integration guide explaining how the main VEYA backend can call this service later.

Expected future integration

The main VEYA application will eventually pass a student profile to this service.

The service will return structured research findings and project opportunities.

The main VEYA application will then:

* Present the results through its frontend.
* Allow the student to discuss and refine ideas using its voice conversation system.
* Save the selected idea in the main VEYA project database.
* Pass the selected idea to the existing Reasoning Layer.
* Generate implementation plans, workflow diagrams, and README files.

Do not implement these existing VEYA responsibilities in this independent project.

⸻

10. Project Structure

Use this as a starting point. Adjust it when there is a strong technical reason.

veya-idea-engine/
│
├── app/
│   ├── main.py
│   ├── api/
│   │   ├── routes/
│   │   │   ├── discovery.py
│   │   │   ├── ideas.py
│   │   │   └── health.py
│   │   └── dependencies.py
│   │
│   ├── core/
│   │   ├── config.py
│   │   ├── llm_client.py
│   │   └── exceptions.py
│   │
│   ├── schemas/
│   │   ├── student.py
│   │   ├── research.py
│   │   ├── evidence.py
│   │   ├── gaps.py
│   │   └── ideas.py
│   │
│   ├── services/
│   │   ├── discovery_pipeline.py
│   │   ├── research_planner.py
│   │   ├── problem_discovery.py
│   │   ├── solution_research.py
│   │   ├── gap_analyzer.py
│   │   ├── candidate_generator.py
│   │   ├── feasibility_analyzer.py
│   │   ├── similarity_checker.py
│   │   ├── critic.py
│   │   └── ranking.py
│   │
│   ├── integrations/
│   │   ├── github_client.py
│   │   ├── web_search_client.py
│   │   ├── openalex_client.py
│   │   ├── semantic_scholar_client.py
│   │   └── pubmed_client.py
│   │
│   ├── repositories/
│   │   ├── evidence_repository.py
│   │   └── idea_repository.py
│   │
│   └── utils/
│       ├── text_extraction.py
│       └── deduplication.py
│
├── tests/
├── docs/
│   ├── architecture.md
│   ├── api.md
│   └── integration.md
│
├── .env.example
├── .gitignore
├── pyproject.toml
├── README.md
└── AGENTS.md

Do not create empty files simply to match this structure.

Build only modules that are actually needed.

⸻

11. Development Instructions

Before writing code:

1. Inspect the laptop’s environment.
2. Check Python and uv availability.
3. Check whether Ollama is installed.
4. Check whether Qwen 2.5 7B is available.
5. Check whether the required APIs can be accessed.
6. Explain the proposed architecture briefly.
7. Identify any technical limitations.

Then implement the system incrementally.

Development phases

Phase 1: Foundation

* Create project structure.
* Set up uv and FastAPI.
* Configure Ollama and Qwen.
* Create Pydantic schemas.
* Implement health endpoint.

Phase 2: Research integrations

* GitHub API.
* Web search API.
* OpenAlex API.
* Source extraction and evidence storage.

Phase 3: Discovery pipeline

* Student profile.
* Research planning.
* Problem discovery.
* Existing solution investigation.
* Gap analysis.

Phase 4: Idea intelligence

* Candidate generation.
* Feasibility evaluation.
* Similarity investigation.
* Independent critic.
* Ranking.

Phase 5: API and integration

* Complete REST endpoints.
* Session handling.
* API documentation.
* Integration guide.

Phase 6: Testing

* Unit tests.
* API tests.
* Mocked external API tests.
* End-to-end research pipeline test.
* Test malformed model output.
* Test API rate limits.
* Test unavailable sources.
* Test conflicting evidence.
* Test insufficient evidence.
* Test student constraints.

⸻

12. Coding Standards

* Write modular Python code.
* Use type hints.
* Use Pydantic for structured data.
* Use async HTTP clients where appropriate.
* Use clear exception handling.
* Avoid unnecessary abstractions.
* Keep prompts in dedicated files.
* Keep API clients separate from reasoning logic.
* Avoid giant files.
* Never hardcode API keys.
* Never fabricate external data.
* Avoid excessive LLM calls.
* Cache research results.
* Add useful logging.
* Write tests for critical logic.
* Explain important architectural decisions in simple language.

Do not overengineer the first version.

Do not introduce LangChain or complex agent frameworks unless there is a clear technical need. Implement the orchestration transparently so that each research step can be understood and debugged.

⸻

13. Definition of Done

The project is complete when:

1. It runs independently on this laptop.
2. Qwen works through Ollama.
3. GitHub research works.
4. Web research works.
5. Academic research works.
6. Evidence is stored with source references.
7. The engine identifies potential gaps.
8. It generates multiple candidate ideas.
9. It checks student-specific feasibility.
10. It searches for similar existing solutions.
11. The critic can reject weak ideas.
12. It returns a ranked shortlist of up to three ideas.
13. Every significant research claim is traceable.
14. The REST API is documented.
15. Tests cover the major workflows.
16. A separate integration guide explains how to connect this service to the main VEYA application.

If an external API requires credentials or a paid plan, implement the integration and provide a mock/test mode. Do not pretend that an unconfigured integration has been successfully tested.

⸻

FINAL INSTRUCTION

Think like an engineer building a real research product, not someone generating a demonstration chatbot.

The quality of VEYA depends on the quality of its investigation.

Do not generate ideas first and invent evidence afterward.

Investigate → Verify → Compare → Identify gaps → Generate → Evaluate → Challenge → Recommend.

Most importantly, remember that this is an independent service that will later become part of VEYA. Maintain clean boundaries, portable configuration, documented APIs, and stable schemas throughout development.
