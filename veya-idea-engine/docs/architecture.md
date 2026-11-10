# Architecture

## The flow

```
 StudentProfile
      │
      ▼
 1 Profile review ──── missing fields, questions, assumptions   (no model call)
      │
      ▼
 2 Research plan  ──── domains, web / GitHub / paper queries     (model)
      │
      ▼  ┌──────────────── research round (max MAX_RESEARCH_ROUNDS) ───────────────┐
 3 Problems ─────── web + news + GitHub issues + papers → model extracts problems  │
      │             (problems without real sources are dropped)                    │
 4 Existing work ── repos + papers + products; README and open issues of top repos │
      │             newer-paper search when a paper reports a limitation           │
 5 Gaps ─────────── model proposes gaps → counter-evidence search per gap          │
      │             → weaken / discard contradicted gaps                           │
      │  no usable gap? next round with categories, keywords, open questions ──────┘
      ▼
 6 Candidate ideas (only from usable gaps, max MAX_CANDIDATES)
      │
      ▼  for each idea
 7 Feasibility ──── not feasible → one scope-reduction revision → re-check
      │             data unavailable → dataset search
 8 Similarity ───── new searches → lexical overlap + model label (4 labels only)
 9 Critic ───────── accept / revise / reject; revise → revised idea → critic again
      │             (max MAX_CRITIC_ROUNDS)
      ▼
10 Ranking ──────── weighted score with a per-criterion breakdown, MIN_FINAL_SCORE,
                    top MAX_FINAL_IDEAS. Never padded with weak ideas.
```

## Main pieces

| Module | Role |
|---|---|
| `services/discovery_pipeline.py` | Runs the stages in a background task, saves progress after each step, bounds every loop |
| `services/research_tools.py` | The only way the pipeline reaches research APIs: cache, per-session call budget, failure → warning, results → evidence |
| `repositories/evidence_repository.py` | Numbers sources per session (E1, E2 …), deduplicates by URL, validates every claim's citations |
| `core/llm_client.py` | OpenAI-compatible client (Ollama by default), JSON mode, validation with retry |
| `prompts/stages.py` | All stage prompts in one place |
| `services/ranking.py` | Transparent scoring |

## Evidence handling

1. Research APIs return `SourceRecord`s (title, URL, type, date, excerpt). They are stored as `Evidence` with an ID.
2. The model sees sources as `[E3] (paper, 2021-04-02) Title — excerpt`. It never sees the URLs, so it has nothing to copy or invent.
3. Model output cites IDs only. On the way back:
   - unknown IDs are removed;
   - a `verified_fact`, `reported_limitation` or `contradicted_claim` left with no real source becomes `unverified_hypothesis`;
   - a problem with no real source is dropped;
   - an existing solution's URL is taken from its evidence, whatever the model wrote;
   - a contradiction the model can't back with a real source is recorded as an unverified assumption, not acted on.
4. Results include the full evidence list, so every ID resolves to a title and URL.

## Scoring

Each criterion is scored 0–10, multiplied by its weight and summed to a 0–100 score. Some criteria mix the critic's rating with things the engine measured itself, so one optimistic model answer can't carry an idea:

| Criterion | Default weight | Score basis |
|---|---|---|
| Problem relevance | 20% | critic |
| Evidence strength | 20% | average of critic and the gap's measured evidence (number of real sources, minus a penalty if counter-evidence was found) |
| Differentiation | 15% | critic, capped by the similarity label (overlap ≤ 3.5, insufficient evidence ≤ 6, potentially ≤ 7.5) |
| Feasibility | 20% | average of critic and the feasibility analysis |
| Impact | 10% | critic |
| Learning value | 10% | critic |
| Prototype clarity | 5% | critic |

An idea is recommended only if the critic accepted it, it is feasible (or a stretch), and its score is at least `MIN_FINAL_SCORE`. The breakdown is returned with every idea. The score is a ranking aid, not a measure of novelty.

## Keeping usage bounded

- `MAX_RESEARCH_ROUNDS`, `MAX_PROBLEMS`, `MAX_CANDIDATES`, `MAX_CRITIC_ROUNDS`, `MAX_QUERIES_PER_SOURCE`, `MAX_SEARCH_RESULTS_PER_QUERY`.
- At most 80 research API calls per session.
- Identical searches are cached for 7 days in SQLite.
- A source that fails hard (missing key, auth error) is not retried within the session. A rate limit is retried once if the wait is 10 seconds or less.
- Invalid model output is retried with the validation error at most `LLM_MAX_ATTEMPTS` times.

## Failure behaviour

| Situation | Result |
|---|---|
| Web search not configured | Warning; GitHub and papers still used |
| Source rate limited or down | Warning; run continues |
| Model unreachable | Session `failed` with a clear message; `/health` shows `degraded` |
| Model output unusable for one idea | That idea is rejected with a reason; others continue |
| No gap with enough evidence | Session completes with no ideas and a warning; nothing is invented |
| Service restarted mid-run | Session marked failed ("interrupted") on the next read |
