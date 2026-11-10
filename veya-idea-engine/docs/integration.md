# Integrating with the main Veya backend

The engine is a separate service. Veya talks to it over HTTP and keeps doing everything it already does (voice, language layer, reasoning layer, plans, README and diagram generation). Nothing in this service imports Veya code, and nothing in Veya needs to import this.

```
 Veya app ──► Veya backend (gnani/) ──HTTP──► Idea Engine (:8100) ──► Ollama, GitHub, OpenAlex, Tavily
                    │
                    └── existing reasoning layer turns the chosen idea into a full plan
```

## 1. Run it next to the Veya backend

```bash
cd veya-idea-engine
cp .env.example .env
uv sync
uv run uvicorn app.main:app --host 0.0.0.0 --port 8100
```

Both services can share the same Ollama. Add one setting to Veya's `.env`:

```
IDEA_ENGINE_URL=http://localhost:8100
```

## 2. Call it from the Veya backend

A small async client is enough. Research takes minutes on a local model, so start it, then poll.

```python
import asyncio
import httpx

IDEA_ENGINE_URL = os.getenv("IDEA_ENGINE_URL", "http://localhost:8100")


async def discover_ideas(profile: dict) -> dict:
    async with httpx.AsyncClient(base_url=IDEA_ENGINE_URL, timeout=30) as client:
        start = await client.post("/api/v1/idea-discovery/start", json={"profile": profile, "auto_start": True})
        start.raise_for_status()
        session_id = start.json()["session_id"]

        while True:
            status = (await client.get(f"/api/v1/idea-discovery/{session_id}/status")).json()
            if status["status"] in ("completed", "failed"):
                break
            await asyncio.sleep(5)

        if status["status"] == "failed":
            raise RuntimeError(status["error"])
        return (await client.get(f"/api/v1/idea-discovery/{session_id}/results")).json()
```

In the app it's nicer to return the `session_id` immediately and let the frontend poll a Veya endpoint that proxies `/status`, showing `stage` and `progress` while the student waits.

## 3. Build the profile from what Veya already knows

| Engine field | Where Veya can get it |
|---|---|
| `interests`, `preferred_domains` | The student's answers in the voice or chat conversation |
| `technical_skills`, `preferred_technology` | The "what tech do you know" question Veya already asks |
| `deadline` | The deadline Veya already parses (free text is fine: "8 weeks", "15 March") |
| `budget`, `team_size`, `available_hardware` | One or two extra conversation questions |
| `academic_field`, `academic_level`, `project_type` | Profile or conversation |

All fields are optional. Missing ones come back in `clarifying_questions`, which Veya can ask out loud (through its own language layer and TTS) and send back with `POST /{session_id}/research` as `profile_update`.

## 4. Use the results

- Show `recommended_ideas` (at most three, sometimes fewer). Each has a `selection_reason`, a `score_breakdown`, a feasibility verdict with a `minimum_credible_demo`, and a similarity label.
- Resolve citations with the `evidence` list (`evidence_id` → title and URL).
- Show `warnings` (for example, "web search is not configured").
- When the student says "make it cheaper" or "I only have two weeks", call `POST /api/v1/ideas/{idea_id}/refine` with their words, or `POST /api/v1/ideas/{idea_id}/evaluate` with a `profile_update`.
- When the student picks an idea, map it into Veya's existing project flow. The engine's job ends there:

| Idea field | Veya project field |
|---|---|
| `title` | project title |
| `problem_statement` | problem |
| `proposed_solution` + `technical_approach` | solution summary |
| `required_technologies`, `software_requirements` | tech stack |
| `feasibility.buildable_within_deadline`, `prototype_scope` | features for the first version |
| `risks` | risks |
| `estimated_timeline` | input to Veya's timeline builder |

Then Veya's reasoning layer generates the blueprint, README and workflow diagram as it does today.

## 5. Stable contract

- All endpoints are under `/api/v1/`. Fields may be added; existing ones won't change meaning within v1.
- Errors are JSON `{"detail": "..."}` with 404 (unknown session or idea), 409 (session busy, or no interests yet), 422 (invalid request), 503 (model unreachable).
- Request bodies reject unknown fields, so typos fail loudly instead of being ignored.
- Sessions are isolated: each has its own evidence IDs, and one session's work never appears in another.
- The engine has no authentication. Run it on a private network or behind the Veya backend, not on the public internet.
