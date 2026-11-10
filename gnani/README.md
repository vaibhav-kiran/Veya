# VEYA — Conversational Voice Project Assistant

VEYA helps you turn a rough idea into a project you can build. You press
**Start Conversation** and VEYA asks **three questions**: your idea, your
timeline, and which technologies you want (or whether it should recommend
some). In **hands-free mode** (on by default) you never press Record: VEYA
starts listening when it finishes speaking and sends your answer when you stop
talking. After the third answer VEYA says *"Okay, got it! Give me a few seconds
to put everything together"*, reads back a summary, and shows **Confirm
Project**. After you confirm it generates a project plan, a README and a
workflow diagram.

- **Speech:** Gnani (Vachana) STT and TTS
- **Conversation intelligence:** local Qwen model (`qwen2.5:7b`) through Ollama
- **Project generation:** the existing Perception and Reasoning layers

---

## How a conversation works

```text
1. THREE FIXED QUESTIONS — no Qwen call, so VEYA replies as soon as the
   transcript is ready. The question audio is generated once and cached.

   Q1 (opening) "Tell me about the idea you have in mind..."
   Q2           "What's your timeline?..."
   Q3           "Do you have any technologies in mind, or should I recommend some?"

   Browser ── POST /conversation/{id}/respond (audio_file or text)
           → ffmpeg → Gnani STT → answer stored → next question (cached TTS)

2. "OKAY, GOT IT" — after the third answer the response has
   summary_pending: true. The browser downloads that line's audio, then
   immediately calls POST /conversation/{id}/summary and plays the line,
   so Qwen works while VEYA is speaking.

   /summary → Language Layer (non-English answers → English)
            → ONE Qwen call reads all three answers (JSON, validated)
            → project details saved → summary built by code
            → Gnani TTS → browser plays it → Confirm Project appears

3. AFTER THE SUMMARY — say "yes", say a correction ("the deadline is one
   month"), or press Confirm Project. A spoken reply goes through one Qwen
   decision call; a correction leads to a new summary.

After the user confirms:
ProjectGenerator → Perception Layer → Reasoning Layer (tools, project name,
README) → Mermaid diagram. Stable Diffusion runs ONLY when the user presses
"Generate Image".
```

### Hands-free mode (browser)

Controlled by the **Hands-free** checkbox on the page (in `webapp/app.py`):

1. When VEYA's reply audio ends, the browser starts recording automatically.
   It never records while VEYA is speaking.
2. The Web Audio API measures the microphone volume ten times per second.
   About **2 seconds of silence after speech** stops the recording and sends it.
3. If nothing is said for **8 seconds**, the recording is thrown away (nothing
   is sent) and VEYA waits for a tap, so background noise cannot cause a loop.
4. You can still tap the button to stop early. Typing in the text box, or
   pressing **Confirm Project**, cancels the automatic recording.

The thresholds are constants at the top of the hands-free section of the page
script: `SPEECH_VOLUME_THRESHOLD`, `SILENCE_BEFORE_SENDING_MS`,
`NO_SPEECH_TIMEOUT_MS`, `MAX_RECORDING_MS`. Raise the volume threshold if a
noisy room keeps the recording going; raise the silence time if answers get cut
off while you pause to think.

### Who decides what

Qwen reads the answers (and, after the summary, understands corrections), but
**the code decides what is allowed**. The model output is always validated:

| Rule enforced in code | Why |
|---|---|
| Unknown actions and field names are rejected or dropped | Never trust arbitrary model output |
| The three questions are fixed and asked in code | Fast and predictable; no model call per answer |
| If Qwen leaves out the idea, the user's own first answer is used | The idea is never lost |
| Placeholder values ("Not specified", "unknown", ...) are treated as unknown | Seen with the real model: VEYA read "a deadline of Not specified" aloud |
| Only the timeline and technologies can be marked "not sure" | The model otherwise marked budget, hardware, team... as skipped although VEYA never asked |
| After the summary, a question the model repeats is replaced by the summary | The local model tends to repeat questions |
| The summary is built from stored details (`conversation_summary.py`) | It always matches the screen and never invents facts |
| Generation only starts after the user agrees to a summary of the latest details | No project without confirmation |
| List corrections use add + remove (`removed_information`) and removal wins | The local model rarely rewrites a whole list correctly |

---

## Folder structure (new and changed parts)

```text
services/
└── conversation_manager/
    ├── __init__.py               Public classes of the package
    ├── schemas.py                All Pydantic models: status, project details,
    │                             messages, Qwen decision, API requests/responses
    ├── errors.py                 Errors with messages that are safe to show users
    ├── conversation_state.py     In-memory session store, status transitions,
    │                             merging answers, corrections and skipped fields
    ├── conversation_prompts.py   The three fixed questions, the "got it" line, the
    │                             one-time extraction prompt, and the prompt for
    │                             answers after the summary
    ├── conversation_pipeline.py  Calls Qwen (extraction of the three answers, and
    │                             decisions after the summary), validates/retries,
    │                             applies decisions with the rules above
    ├── conversation_summary.py   Builds the spoken confirmation summary
    ├── conversation_service.py   The conversation end to end: fixed questions
    │                             (STT only), the summary (one Qwen call), answers
    │                             after it, confirm, cancel and on-demand image
    └── project_generation.py     Confirmed details → Perception → Reasoning →
                                  diagram, with a README fallback
services/speech_to_text/
└── audio_conversion.py           ffmpeg WebM → 16 kHz mono WAV (shared with /transcribe)
webapp/
├── app.py                        Creates the existing pipelines once, registers the
│                                 conversation routes, serves the VEYA web page
└── conversation_routes.py        The /conversation endpoints
tests/                            Automated tests (no real Gnani/Ollama calls)
```

The existing STT, TTS, Language, Perception, Reasoning, tools and visual
generation code is reused, not copied.

---

## Setup

Requirements: Python 3.12, [uv](https://docs.astral.sh/uv/), `ffmpeg`
(`brew install ffmpeg`), and [Ollama](https://ollama.com) with the Qwen model:

```bash
ollama pull qwen2.5:7b
```

Create your environment file and fill in your Gnani API key:

```bash
cp .env.example .env
```

| Variable | Example | Used by |
|---|---|---|
| `OLLAMA_BASE_URL` | `http://localhost:11434/v1` | Language, Perception, Reasoning, Conversation |
| `OLLAMA_API_KEY` | `ollama` | same |
| `OLLAMA_MODEL` | `qwen2.5:7b` | same |
| `GNANI_API_KEY` | your key | STT and TTS (sent as `X-API-Key-ID`) |
| `GNANI_BASE_URL` | `https://api.vachana.ai` | STT and TTS |
| `GNANI_STT_ENDPOINT` | `/stt/v3` | STT (`prisma-v3.0`, `indic-auto`) |
| `GNANI_TTS_ENDPOINT` | `/api/v1/tts/inference` | TTS (`timbre-v2.5`, voice `Nalini`) |

## Run the application

```bash
ollama serve            # if Ollama is not already running
uv run uvicorn webapp.app:app --port 8000
```

Open <http://127.0.0.1:8000> in Chrome or Edge and allow microphone access.

To use it from the VEYA Expo app (the parent `veya/` folder), see
[Using it from the VEYA app](#using-it-from-the-veya-app) below.

## Run the tests

```bash
uv run pytest
```

The tests replace Gnani, Ollama/Qwen, Perception, Reasoning and Stable
Diffusion with small fakes, so they need no API credits and no running model.
Tests that convert real audio need `ffmpeg` and are skipped without it.

---

## API

All endpoints use Pydantic request/response models. Errors always look like
`{"detail": "<message for the user>"}`; internal error details are only logged.

| Method & path | Purpose |
|---|---|
| `POST /conversation/start` | Create a session and get VEYA's opening line |
| `POST /conversation/{session_id}/respond` | Send one answer: `audio_file` **or** `text` (multipart form) |
| `POST /conversation/{session_id}/summary` | After the three questions: one Qwen call reads the answers; returns the spoken summary. Can be retried if it failed |
| `GET /conversation/{session_id}` | Current status, collected details, messages, result |
| `GET /conversation/{session_id}/audio` | WAV audio of VEYA's latest reply |
| `POST /conversation/{session_id}/confirm` | Confirm the summary and generate the project |
| `POST /conversation/{session_id}/cancel` | Cancel the conversation |
| `POST /conversation/{session_id}/generate-image` | Stable Diffusion concept image (only on request) |
| `GET /projects` | Saved projects of the user in `X-Veya-User` |
| `POST /projects` | Create a project from an idea written in the app (`title`, optional `sections`) |
| `GET /projects/{project_id}` | One saved project: sections, plan, README, diagram, image |
| `PATCH /projects/{project_id}` | Update `title` and/or individual `sections` |
| `DELETE /projects/{project_id}` | Delete a project |
| `GET /projects/{project_id}/readme` | The README as a Markdown file download |
| `POST /projects/{project_id}/generate-image` | Stable Diffusion image for a saved project (only on request; works after a restart) |
| `GET /plan` | The user's plan (`free` / `paid`), its entitlements and projects used |

`POST /conversation/{session_id}/confirm` now also saves the generated project
and returns its `project_id`. A project belongs to the `X-Veya-User` header
sent with `POST /conversation/start`.

### Start

```bash
curl -X POST http://127.0.0.1:8000/conversation/start \
  -H 'Content-Type: application/json' -d '{"preferred_language": "English"}'
```

```json
{
  "session_id": "P0sPeMab6xt6sLXMjgHoHHAR--vjC8POzD-5kl0O6UE",
  "status": "collecting_information",
  "message": "Hey! I'm VEYA. Tell me about the idea you have in mind. It doesn't have to be fully planned. We can figure it out together.",
  "next_action": "ask_question",
  "transcript": null,
  "detected_language": null,
  "audio_available": true,
  "audio_error": null,
  "project_details": { "initial_idea": null, "...": null },
  "skipped_fields": []
}
```

`preferred_language` is one of: English, Hindi, Tamil, Telugu, Kannada,
Malayalam, Bengali, Marathi, Gujarati, Punjabi. VEYA speaks in that language;
project details are always stored in English.

### Respond

```bash
# voice answer (what the browser sends)
curl -X POST http://127.0.0.1:8000/conversation/$SID/respond -F "audio_file=@answer.webm;type=audio/webm"
# typed answer
curl -X POST http://127.0.0.1:8000/conversation/$SID/respond -F "text=A hackathon next weekend, about three days."
```

Answers to the first two questions return the next question. The answer to the
third returns VEYA's "got it" line and `summary_pending: true`:

```json
{
  "session_id": "P0sPeMab...",
  "status": "collecting_information",
  "message": "Okay, got it! Give me a few seconds to put everything together.",
  "next_action": "summarise",
  "transcript": "I know JavaScript and React. Please recommend the backend and database.",
  "detected_language": "en-IN",
  "audio_available": true,
  "audio_error": null,
  "project_details": { "initial_idea": null, "...": null },
  "skipped_fields": [],
  "summary_pending": true
}
```

While `summary_pending` is waiting, `/respond` returns **409**.
After the summary, `/respond` is used for "yes" or a correction.

If Gnani TTS fails, a reply is still returned as text with
`audio_available: false` and a short `audio_error`.

### Summary

```bash
curl -X POST http://127.0.0.1:8000/conversation/$SID/summary
```

Returns the same shape as `/respond`, with `status: "awaiting_confirmation"`,
`next_action: "request_confirmation"` and the summary (real example):

```text
Here's what I've understood so far. Your project idea is an app that helps
college students find study partners for the same subject. It's meant for
college students. You're building it for a hackathon, with a deadline of next
weekend. Time available: 3 days. You'd like to use React. You already know
JavaScript. You'd like me to recommend backend, database and technologies.
Is everything correct, or would you like to change anything?
```

It returns **409** before the three answers are in or when called a second
time, and **503** if Qwen is unavailable (the answers are kept; call it again).

### Confirm

```json
{
  "session_id": "P0sPeMab...",
  "status": "completed",
  "result": {
    "project_name": "SmartParkingFinder",
    "response": "# SmartParkingFinder ...",
    "readme_markdown": "# SmartParkingFinder\n\n## Project Overview ...",
    "readme_filename": "SmartParkingFinder.md",
    "workflow_diagram": "flowchart TD ...",
    "image_generation_available": true,
    "perception_input": "Confirmed project brief collected by VEYA: ...",
    "perception": { "intent": "develop_new_project_idea", "...": "..." }
  }
}
```

A second Confirm after success returns the same result without generating again.

### Error status codes

| Code | When |
|---|---|
| 400 | Empty, unreadable or non-audio upload |
| 404 | Session does not exist or expired |
| 409 | Action not allowed now (e.g. confirm before summary, answer after cancel), or the session is busy with another request |
| 422 | Empty transcript, or neither/both of `audio_file` and `text` sent, or a malformed session ID |
| 502 | Gnani STT failed, or project generation failed (answers are kept; Confirm can be retried) |
| 503 | Ollama/Qwen unavailable or kept returning invalid output |
| 500 | Image generation failed |

---

## Session lifecycle

```text
created → collecting_information (3 fixed questions, then /summary)
        → awaiting_confirmation ⇄ collecting_information (after a correction
          the model may ask a clarifying question) → ready_to_generate
        → generating_project → completed
any active status → cancelled          generating_project → error → (retry confirm)
```

- `awaiting_confirmation`: VEYA read the summary. The user can press
  **Confirm Project**, say "yes", or correct/add details (which leads to a new
  summary).
- Only one request per session runs at a time; a second one gets **409**
  (prevents double-clicked Confirm generating twice).
- Session IDs are 43-character random tokens (`secrets.token_urlsafe(32)`).
  They are not proof of identity; there is no login system.
- Sessions live **in memory** and expire after 2 hours without activity.

---

## Manual test sequence

1. Start Ollama and the app (see above). Open <http://127.0.0.1:8000>.
2. Press **Start Conversation**. VEYA speaks the first question (your idea);
   the button shows "Stop VEYA's voice" while it speaks and never records at
   the same time. When it finishes, the button changes to "Listening..." by itself.
3. Say: *"A plant disease app for farmers that works from a photo."* and stop
   talking. After about two seconds the answer is sent and VEYA immediately
   asks about your timeline (no thinking pause).
4. Say: *"It's for a hackathon next weekend."* VEYA asks about technologies.
5. Say: *"Python and React. Please recommend the rest."* VEYA says
   *"Okay, got it! Give me a few seconds..."*, the status shows
   "putting everything together", then VEYA reads the summary.
   "What VEYA Has Understood" fills in.
6. Only after the summary has been spoken, **Confirm Project** appears.
7. Correct something by voice: *"Actually use Flutter instead of React."* —
   VEYA reads a new summary and React disappears from the panel.
8. Type an answer in the text box instead of speaking (fallback input).
9. Press **Confirm Project** or say *"Yes"*. Generation takes a few minutes on
   a local 7B model. Check the plan, README (with **Download README**) and
   workflow diagram. No image is generated until you press **Generate Image**.
10. Hands-free checks: stay silent after VEYA speaks (after 8 seconds it shows
    "I didn't hear anything" and sends nothing); start typing while it listens
    (listening stops).
11. Error checks: deny microphone permission (VEYA suggests typing), stop
    Ollama and answer (clear error, conversation kept), press **Cancel
    Conversation** while VEYA is thinking (the late reply is ignored).
12. Hindi check: choose Hindi before starting and speak Hindi; VEYA replies in Hindi.

---

## Plans

`services/plans/plans.py` defines a `free` and a `paid` plan with their
entitlements (`image_generation`, `max_projects`). A conversation's plan
is decided once at `POST /conversation/start` from the `X-Veya-User`
header (`PlanResolver`: `VEYA_DEFAULT_PLAN`, plus `VEYA_PAID_USERS` for
testing). Limits are enforced on the conversation and project routes
(HTTP 403), and `GET /plan` returns the user's plan. To launch real plans,
replace `PlanResolver.plan_for()` with a lookup in your billing system.

## Using it from the VEYA app

The Expo app in the parent folder talks to this server over REST.

1. Start the server so phones and emulators can reach it:

   ```bash
   ollama serve
   uv run uvicorn webapp.app:app --host 0.0.0.0 --port 8000
   ```

   (If `.venv/bin/uvicorn` fails with "bad interpreter", the folder was moved
   after the venv was made: use `.venv/bin/python -m uvicorn ...` or recreate
   the venv with `uv sync`.)

2. In `veya/.env` set `EXPO_PUBLIC_VEYA_API_URL`:
   `http://localhost:8000` (iOS simulator, web), `http://10.0.2.2:8000`
   (Android emulator) or `http://<your-LAN-IP>:8000` (physical phone).

3. In `veya/`: `npx expo run:ios` / `npx expo run:android` (a new dev build
   is needed after adding `expo-audio` and `react-native-webview`), or
   `npx expo start --web`.

| Variable | Default | Purpose |
|---|---|---|
| `VEYA_CORS_ORIGINS` | `http://localhost:8081,http://127.0.0.1:8081` | Browser origins allowed by CORS (Expo web). Native apps ignore CORS. Never `*` in production |
| `VEYA_DB_PATH` | `data/veya_projects.db` | SQLite file for saved projects (`data/` is git-ignored) |

Phone recordings are `.m4a` (AAC); web recordings are WebM/Opus. Both go
through the existing ffmpeg conversion, so no frontend conversion is needed.

**`X-Veya-User` is not authentication.** The app sends the signed-in Clerk
user id so accounts on a shared device stay apart, but the server does not
verify it — anyone who can reach the API can read any user's projects by
sending their id. Before exposing this server beyond your own machine, verify
Clerk session tokens (JWT) on the server instead.

## Known limitations

- **Saved projects, not saved conversations.** Generated projects are stored
  in SQLite and survive restarts. Conversations in progress are still
  in-memory (see below); the app detects an expired session and asks the user
  to start again.

- **In-memory sessions.** Restarting the server loses all conversations, and
  they are not shared between several server processes. `ConversationStore`
  has a small interface so it can be replaced by a database-backed store.
- **Fixed questions.** VEYA always asks the same three questions, even if
  your first answer already mentioned the timeline or technologies, and it
  does not ask follow-ups for vague answers. The summary is where you catch
  and correct anything.
- **Local model quality.** `qwen2.5:7b` sometimes guesses a detail the user
  did not say (for example "college project" from the word "students") or
  misses one in a long sentence. The summary is read back before anything is
  generated, so these can be corrected by voice. Code rules prevent the worst
  mistakes (placeholder values, invented "not sure" fields, wrong list
  corrections), not all of them.
- **README fallback.** The Reasoning Layer is asked explicitly for the README,
  but the local model often still returns an empty one. VEYA then builds the
  README with the existing `tools/readme_generator.py` from the confirmed
  facts and the Reasoning Layer's implementation steps, and logs a warning.
  The older `/analyse` endpoint does not have this fallback.
- **Speed.** The three questions take only as long as Gnani STT (usually
  1–8 s; Gnani reports ~0.1 s of processing, the rest is network time, and it
  occasionally takes 15–20 s or fails). The summary step takes about 7–13 s,
  partly hidden behind "Okay, got it". A spoken "yes" or correction after the
  summary needs one Qwen call (about 5–15 s); pressing **Confirm Project** is
  faster. Project generation takes 2–5 minutes. What keeps it short:
  - No Qwen call during the three questions; their audio is cached.
  - Qwen is warmed up when the server starts (with the summary prompt), so the
    first summary is not slow.
  - TTS uses 24 kHz audio (`TTS_SAMPLE_RATE`), the greeting audio is cached
    per language, and a TTS call that takes over 20 s (`TTS_TIMEOUT_SECONDS`)
    falls back to text.
  - Gnani rejects parallel TTS requests (HTTP 429), so long replies cannot be
    split into sentences and synthesised in parallel.
- **Turn-based audio.** Speech uses the REST STT/TTS APIs; there is no
  streaming or barge-in yet. You cannot
  interrupt VEYA by talking; tap "Stop VEYA's voice" instead, and listening
  starts right after.
- **Simple silence detection.** Hands-free mode uses a fixed volume threshold,
  not a speech model. A long pause mid-answer (over 2 seconds) sends the answer
  early, and loud background noise can keep the recording going until the
  60-second limit.
- **No authentication.** Anyone with a session ID can use that session.
- **Older endpoints.** `/greeting`, `/transcribe`, `/analyse` and
  `/generate-image` from the single-shot flow are still present and unchanged.
  `/greeting` synthesises its audio once and reuses it.
