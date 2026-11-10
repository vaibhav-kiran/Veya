# Veya Idea Engine

A small research service for students who want to build something but don't have an idea yet.

Most "project idea generators" just ask a model for ten ideas. The ideas sound good and fall apart the moment someone searches GitHub. This engine works the other way round: it looks for **real problems first**, checks what already exists, looks for gaps, and only then suggests ideas. Every claim it makes points back to a source you can open.

It runs on its own (FastAPI + a local Qwen model through Ollama) and is meant to be called by the main Veya backend later. See [docs/integration.md](docs/integration.md).

## What it does

Give it a student profile (interests, skills, budget, deadline, team size, hardware). It then:

1. **Reviews the profile.** Lists what's missing, asks a few useful questions, and says what it will assume meanwhile.
2. **Plans the research.** Targeted queries for the web, GitHub and academic papers, not "AI project ideas".
3. **Finds real problems** in news, web pages, GitHub issues and papers. A problem is kept only if a source describes it.
4. **Maps existing solutions.** Reads the README and open issues of the most relevant repositories, and checks for newer papers when a paper reports a limitation.
5. **Finds gaps, then tries to disprove them.** Each gap gets a search designed to find counter-evidence. Gaps that turn out to be solved are weakened or dropped.
6. **Generates ideas** only from gaps that survived.
7. **Checks feasibility** for *this* student. Infeasible ideas get one attempt at a smaller, cheaper version. If data looks unavailable, it searches for datasets.
8. **Searches for similar work** and labels each idea: strongly differentiated, potentially differentiated, significant existing overlap, or insufficient evidence. It never claims anything is "completely novel".
9. **Runs a critic** whose only job is to reject the idea. Ideas can be revised, at most twice.
10. **Ranks** with a transparent, configurable score and returns **up to three** ideas. If only one is good, you get one.

## Honest by design

- The model can only cite sources by ID (`E1`, `E2`, …). URLs, titles and dates always come from the API responses, never from the model.
- Unknown IDs are thrown away. A claim marked as a fact without a real source is downgraded to `unverified_hypothesis`.
- Every claim carries a status: `verified_fact`, `reported_limitation`, `supported_inference`, `unverified_hypothesis` or `contradicted_claim`.
- An open GitHub issue is a *reported* limitation, not a verified one. An empty search is not proof that nothing exists.
- If a source is down or rate limited, the run continues and the result says so in `warnings`.

## Setup

You need Python 3.12, [uv](https://docs.astral.sh/uv/) and [Ollama](https://ollama.com/).

```bash
ollama pull qwen2.5:7b
cd veya-idea-engine
uv sync
cp .env.example .env      # add a TAVILY_API_KEY for web search (optional but recommended)
uv run uvicorn app.main:app --port 8100
```

Open http://localhost:8100/docs for the interactive API, or check http://localhost:8100/health.

GitHub and OpenAlex work without keys, but both are worth adding: unauthenticated GitHub search allows only 10 requests a minute, and anonymous OpenAlex use is limited to roughly 100 searches a day.

## Quick try

```bash
curl -s -X POST localhost:8100/api/v1/idea-discovery/start \
  -H 'Content-Type: application/json' \
  -d '{"profile": {"academic_field": "Electronics", "interests": ["agriculture", "IoT"],
       "technical_skills": ["Python", "Arduino"], "budget": "5000 rupees", "deadline": "8 weeks"},
       "auto_start": true}'

curl -s localhost:8100/api/v1/idea-discovery/<session_id>/status
curl -s localhost:8100/api/v1/idea-discovery/<session_id>/results
```

A full run makes about 20–40 model calls. On a laptop with a 7B model that's several minutes, which is why research runs in the background and you poll `/status`.

## API

| Method | Path | What it does |
|---|---|---|
| POST | `/api/v1/idea-discovery/start` | Create a session, get clarifying questions and assumptions |
| POST | `/api/v1/idea-discovery/{session_id}/research` | Start research in the background (optionally with answers) |
| GET | `/api/v1/idea-discovery/{session_id}/status` | Stage, progress, counts, warnings |
| GET | `/api/v1/idea-discovery/{session_id}/results` | Ideas, problems, gaps, existing solutions, evidence |
| GET | `/api/v1/ideas/{idea_id}` | One idea with its full evaluation |
| POST | `/api/v1/ideas/{idea_id}/refine` | Revise an idea with the student's feedback |
| POST | `/api/v1/ideas/{idea_id}/evaluate` | Re-evaluate an idea, e.g. after the budget changed |
| GET | `/health` | Model reachability and configured sources |

Request and response examples: [docs/api.md](docs/api.md). How it fits together: [docs/architecture.md](docs/architecture.md).

## Configuration

Everything lives in `.env`; see [.env.example](.env.example) for the full list. The most useful settings:

| Variable | Default | Meaning |
|---|---|---|
| `OLLAMA_MODEL` | `qwen2.5:7b` | Model used for every stage |
| `TAVILY_API_KEY` | – | Enables web and news search |
| `GITHUB_TOKEN` | – | Higher GitHub rate limits |
| `OPENALEX_API_KEY` | – | Higher OpenAlex daily allowance |
| `RESEARCH_MODE` | `live` | `mock` for offline development (results are labelled `[MOCK]`) |
| `MAX_RESEARCH_ROUNDS` | 3 | Extra research rounds when evidence is thin |
| `MAX_CANDIDATES` / `MAX_FINAL_IDEAS` | 8 / 3 | Ideas evaluated / returned |
| `MAX_CRITIC_ROUNDS` | 2 | Critic passes per idea |
| `MIN_FINAL_SCORE` | 55 | Ideas below this are not recommended |
| `RANKING_WEIGHTS` | see example | Scoring weights |

## Tests

```bash
uv run pytest
```

The tests use a scripted model and fake sources, so they need no network, no model and no keys. They cover a full run, malformed model output, rate-limited and unavailable sources, contradicted gaps, invented citations, infeasible ideas, the bounded critic loop, ranking that never pads, and the REST API.

## Project layout

```
app/
├── main.py              FastAPI app and error handling
├── api/                 routes and engine wiring
├── core/                settings, model client, errors
├── schemas/             Pydantic models for every stage
├── prompts/             stage prompts in one place
├── integrations/        Tavily, GitHub, OpenAlex, Semantic Scholar, mock sources
├── repositories/        SQLite: evidence, sessions, search cache
└── services/            the ten stages and the pipeline that runs them
docs/                    architecture, API examples, integration guide
tests/
```

## Limits worth knowing

- Searches miss things. The engine says "potentially differentiated", not "novel", for a reason.
- A 7B model sometimes misreads a source. Every claim links to its source so a person can check.
- Without a Tavily key there is no general web or news search, so problem discovery leans on GitHub issues and papers.
- Sessions running when the service stops are marked as interrupted and need to be started again.
