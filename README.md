<div align="center">

<img src="assets/images/veya-logo-mark.png" alt="Veya logo" width="96" />

# Veya

**Think it. Speak it. Build it.**

Talk through a rough idea, and Veya turns it into a project plan you can actually build: a step-by-step blueprint, a README, a workflow diagram and a timeline that fits your deadline.

<a href="https://drive.google.com/file/d/1nNryG1SvNe19qxy6zwutwOx92dzWi12L/view">
  <img src="docs/demo-cover.jpg" alt="Watch the 2-minute Veya demo" width="720" />
</a>

<sub>▶ Click the image to watch the 2-minute demo · <a href="https://drive.google.com/file/d/1nNryG1SvNe19qxy6zwutwOx92dzWi12L/view">Open on Google Drive</a></sub>

</div>

---

## Why we built it

Every hackathon starts the same way. Someone has an idea, opens a chatbot, and an hour later there is a long thread of half-answers about React vs Flutter, which database, what the deadline really is, and the original idea is buried somewhere near the top.

Veya flips that around. Instead of you asking a chatbot questions, **Veya asks you** the few questions that matter, out loud, in your own language. Then it hands you a plan.

## What it does

Veya has five tabs: **Talk**, **Your Ideas**, **Innovator**, **Calendar** and **Settings**.

### Talk: plan a project by voice or chat

- **Voice.** Tap once and talk. Veya asks about your idea, your deadline and the tech you know, one question at a time. The mic opens on its own when Veya finishes speaking and sends your answer when you stop talking.
- **Chat.** Swipe left for a text chat. Veya decides what to ask next from what you've said, with no fixed script. Voice and chat are separate conversations, and old chats are kept in history.
- **Your language.** One setting covers listening, replying and speaking: English, Hindi, Tamil, Telugu, Kannada, Malayalam, Bengali, Marathi, Gujarati or Punjabi. Veya's fixed lines (greetings, the standard questions) are hand-translated, so they sound natural in every language.
- **Pick the model.** Each conversation thinks with the local Qwen model, Google Gemini or Groq. The model picker shows which one is in use.
- **Summary, then Idea Check.** Veya reads back what it understood, and you correct it or confirm. Then it runs an **Idea Check**:
  - **Similar projects** that already exist on GitHub and Devpost, with links, stars and whether they won a prize
  - **A verdict:** "Looks different from what's out there", "Some similar work exists", "Very similar projects already exist" or "Not enough evidence to tell"
  - **Ways to stand out**, so your project isn't a copy
  - **Feasibility:** whether you can build it in your time, and a smaller version if you can't
- **Choose and build.** Tick how you want to build it (as it is, or with one of the stand-out directions) and tap Build. You don't have to remember "the second one" from what Veya said.
- **Nothing is lost.** Conversations are saved on the server, so a restart doesn't wipe your answers.

### The project workspace

Every built project opens as a workspace with four tabs that stay at the top while you scroll:

- **Overview:** Veya's plan, covering the problem, solution, features, architecture, tech stack, risks and demo readiness
- **Build:** the implementation steps and a README you can drop into your repo
- **Visuals:** a workflow diagram, plus a concept image on request
- **Timeline:** the deadline, the phases and the tasks to tick off

You can edit any section by hand, or **change the plan by voice**: tap the glowing orb and say what to change ("use Firebase instead of PostgreSQL", "add a dark mode", "we only have one week now"). Veya rewrites only the sections that change, leaves everything else exactly as it was, and tells you what it changed. One tap undoes it.

### Your Ideas: projects, ideas and Analyze

Swipe between two pages:

- **Projects:** your project plans and saved ideas. Write an idea down now and turn it into a project later.
- **Analyze:** one folder per hackathon or event, where Veya helps you choose between your projects and makes the best one stronger. Hold any project or idea and drag it onto a folder to add it.

[How Analyze works](#analyze-step-by-step) is explained step by step below.

### Innovator: ideas you can back up

Don't have an idea yet? Tell Veya what you're into, your skills, budget and time. It researches real problems, checks what already exists on GitHub and in papers, tests each gap, and suggests up to three ideas with the sources behind them. Weak ideas are never used to fill the list.

### Calendar

- **Today:** a progress ring and quick numbers
- **Month view:** with deadlines marked
- **The chosen day:** as a timeline you tick off
- **What's coming up**
- **Progress:** every project's progress against its deadline

Say "this weekend" or "15 March" in the conversation and Veya splits the days into phases that suit the project, like UI, backend, auth and demo prep. Change a deadline and the phases are re-planned. Add your own tasks and milestones on any day.

### Settings

- **Profile:** your name and a photo or one of ten mascots
- **Veya's language**
- **Theme:** Violet, Graphite or Emerald
- **Account:** sign in with email or Google through Clerk

## How it works

```
 Expo app (iOS · Android · Web)
        │  REST, with a Clerk session token on every request
        ▼
 FastAPI backend (gnani/)
        ├── Auth                                     (checks the Clerk token, knows who is asking)
        ├── Gnani speech-to-text / text-to-speech   (voice in, voice out)
        ├── Language layer                           (translate to and from English)
        ├── Conversation manager                     (questions, summary, confirmation)
        ├── Perception + Reasoning layers            (Qwen via Ollama, Gemini or Groq)
        ├── Idea Check                               (GitHub + Devpost search, then the model compares)
        ├── Analyze (idea boards)                    (research an event, rate, check, enhance)
        ├── Project edit                             (change a plan by voice, with undo)
        ├── README + Mermaid diagram generation
        ├── Stable Diffusion                         (concept images, only on request)
        ├── Idea engine (veya-idea-engine/)          (Innovator, runs inside the backend)
        └── SQLite                                   (saved projects)
```

The app never talks to the speech or model services directly. All keys stay on the server.

### From a voice answer to a plan

1. **You speak.** The app records until you stop talking and sends the audio to the backend.
2. **Speech to text.** Gnani turns it into text in your language. The language layer translates it to English, so the rest of the system works in one language.
3. **Veya asks the next question.** The conversation manager keeps track of what it knows (idea, deadline, skills, tech) and asks only about what is missing. Fixed lines like greetings come from hand-written translations; model-written replies are translated back and spoken with Gnani's voice.
4. **Summary and confirmation.** Veya reads back what it understood. You correct it or confirm.
5. **Idea Check.** The model writes a few search queries, GitHub and Devpost are searched in parallel, and results are ranked by how many of your idea's words they share. The model then compares your idea with the closest ones, citing them only by ID, so titles and links always come from the search results, never from the model. If nothing turns up, Veya says there isn't enough evidence; it never claims an idea is new.
6. **The plan.** The reasoning layer writes the blueprint and README, a Mermaid diagram is drawn from it, and the timeline is split into phases up to your deadline. The project is saved in SQLite under your account.

Every step of a conversation is saved to SQLite as it happens. If the server restarts, the conversation picks up where it left off. If a project was being generated at the time, it's marked as failed with a clear message, and confirming again retries.

### Analyze step by step

After you create a folder, it walks you through five steps (**Add → Analyze → Check → Enhance → Implement**), shown as a progress bar at the top. The button at the bottom is always the next step.

1. **Create the folder.** Say what it's for: a hackathon, a college project, a startup, a personal project or something else.
   - **For a hackathon,** give its name or link, by voice or text. Veya searches Devpost, Unstop, Devfolio and the web (DuckDuckGo), reads the best pages, and pulls out the themes, tracks, judging criteria (with weights when they're published), dates, prizes and rules. If the hackathon has no official judging criteria, Veya uses typical ones and says so.
   - **For other purposes,** Veya uses criteria that suit them, with no web search: a college project is judged differently from a startup.
2. **Add.** Drag projects or ideas onto the folder, or add them from inside it, or write a new idea there. Up to 12 are rated at once.
3. **Analyze.** The model scores every project 1 to 10 on each criterion, with a reason for each score, plus strengths, risks and a verdict. The weighted totals and the winner are worked out in code, not by the model, so the ranking is easy to follow. **Why it's the strongest** explains the pick. If you change a project, Veya asks you to analyze again.
4. **Check.** Runs an Idea Check on every rated project, two at a time, to show what already exists on GitHub and Devpost and how each one compares.
5. **Enhance.** For the strongest project (or another one you pick), Veya suggests concrete changes that make it a better fit for this event and push it ahead of what already exists. Each change says which criterion it helps with.
6. **Implement.** One tap applies those changes to the project's README and plan, using the same editor as voice edits. **Updated** lists what changed. Projects a folder changed take on the folder's colour, so you can see where they were improved. (An idea has to be turned into a project first.)

Folders and the ideas in them are kept on the device. The backend only does the research, rating, checking and rewriting.

### Accounts and plans

The app signs in with Clerk and sends Clerk's session token with every request. The backend checks the token's signature and uses the user ID inside it, so each person only sees their own projects.

Each user is on a plan, which sets limits such as how many projects they can keep and whether concept images are on. Free and paid limits are set in one place (`VEYA_DEFAULT_PLAN`, `VEYA_PAID_USERS`, `VEYA_FREE_MAX_PROJECTS`, `VEYA_FREE_IMAGES`), and the app shows them through `GET /plan`.

### Choosing a model

Every pipeline talks to its model through the same OpenAI-style API, which Ollama, Gemini and Groq all offer. Only the client and model name change, and the app sends the choice with each request.

| Model | Good for | Watch out for |
|---|---|---|
| Qwen 2.5 7B (Ollama) | Free, private, works offline | Slower; weaker at Indian languages |
| Gemini (`gemini-flash-lite-latest`) | Fast, good Indian languages | Free-tier quotas |
| Groq (`openai/gpt-oss-120b`) | Very fast, reliable JSON | Free tier: 8,000 tokens a minute and 200,000 a day per model |

When a cloud model hits its limit, Veya says so instead of failing silently. Switch models, or set `GROQ_MODEL` to another Groq model, which has its own daily allowance.

## Tech stack

| Part | Built with |
|---|---|
| Mobile and web app | Expo SDK 58, React Native, Expo Router, TypeScript, Zustand |
| Sign-in | Clerk (email and Google); the backend verifies Clerk's session tokens |
| Voice | expo-audio, Gnani (Vachana) STT and TTS |
| Backend | FastAPI, Pydantic, SQLite |
| Language model | Qwen 2.5 (7B) through Ollama, Google Gemini or Groq (your choice per conversation) |
| Research | GitHub and Devpost search (Idea Check); Devpost, Unstop, Devfolio and DuckDuckGo (idea pages) |
| Diagrams and images | Mermaid, Stable Diffusion (diffusers) |

## Project structure

```
veya/
├── src/
│   ├── app/          screens (file-based routes): Talk, Your Ideas, Innovator, Calendar, Settings
│   ├── components/   UI building blocks
│   ├── stores/       app state (conversation, chat, projects, …)
│   ├── lib/          API client, audio, voice detection, helpers
│   └── theme/        colours, typography, themes
├── assets/           fonts, logo, mascots
├── docs/             demo video
├── veya-idea-engine/ research-driven idea discovery service (Innovator)
└── gnani/            FastAPI backend
    ├── services/     conversation, chat, language, perception, reasoning, speech, visuals, projects,
    │                 idea_check, idea_boards, project_edit, llm_providers
    ├── tools/        tools the reasoning layer can call
    ├── webapp/       API routes and auth
    └── tests/
```

## Getting started

### What you need

- Node.js 20+ and npm
- Python 3.12 and [uv](https://docs.astral.sh/uv/)
- [ffmpeg](https://ffmpeg.org/) (converts recordings for speech-to-text)
- [Ollama](https://ollama.com/) with the Qwen model: `ollama pull qwen2.5:7b`
- A Gnani (Vachana) API key and a Clerk publishable key
- Optional: a Gemini API key ([Google AI Studio](https://aistudio.google.com/)) and/or a Groq API key ([console.groq.com](https://console.groq.com/)) to use cloud models

### 1. Configure

Both the app and the backend read one `.env` file in the project root. Start from the example and fill in your keys:

```bash
cp gnani/.env.example .env
```

Then add the app settings to the same file:

```bash
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
EXPO_PUBLIC_VEYA_API_URL=http://localhost:8000
```

`EXPO_PUBLIC_VEYA_API_URL` is where the app finds the backend:

| Running on | Use |
|---|---|
| iOS simulator or web | `http://localhost:8000` |
| Android emulator | `http://10.0.2.2:8000` |
| A phone on the same Wi-Fi | `http://<your computer's IP>:8000` |

Only `EXPO_PUBLIC_*` values end up in the app. Everything else stays on the server.

Cloud models and sign-in checks are set in the same file:

```bash
GEMINI_API_KEY=...        # turns Gemini on
GROQ_API_KEY=gsk_...      # turns Groq on
# GROQ_MODEL=openai/gpt-oss-120b   (optional; another model gets its own daily quota)

# VEYA_AUTH=clerk         (default) every request needs a valid Clerk token
# VEYA_AUTH=header        development only: trusts an X-Veya-User header
```

If you pick a model whose key isn't set, Veya tells you which setting to add. Qwen works whenever Ollama is running.

### 2. Run the backend

```bash
ollama serve
cd gnani
uv sync
uv run uvicorn webapp.app:app --host 0.0.0.0 --port 8000
```

### 3. The idea engine (Innovator tab) starts with the backend

Nothing extra to run: the backend imports `veya-idea-engine/` and starts it when it starts ("Idea engine started inside the backend" in the log). Its settings go in `veya-idea-engine/.env` (copy `.env.example`); it shares the backend's Ollama. Web search needs a `TAVILY_API_KEY`; GitHub and paper search work without keys but are rate limited. See [veya-idea-engine/README.md](veya-idea-engine/README.md).

To use a separately running engine instead, set `IDEA_ENGINE_URL` (for example `http://localhost:8100`).

### 4. Run the app

```bash
npm install
npx expo start
```

Scan the QR code with Expo Go, or press `i`, `a` or `w` for the iOS simulator, Android emulator or web.

## Tests

```bash
# backend (no API credits or running model needed; external services are faked)
cd gnani && uv run pytest

# app
npx tsc --noEmit
npx expo lint
```

## What's next

- Let people interrupt Veya by talking, instead of waiting for the reply to finish.

## License

See [LICENSE](LICENSE).
