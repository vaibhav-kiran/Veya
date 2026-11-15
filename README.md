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

Every hackathon starts the same way: an idea, a chatbot, and an hour of half-answers about which framework and which database. Veya flips that around. **Veya asks you** the few questions that matter, out loud, in your own language, then hands you a plan.

## Features

**Talk**
- Plan a project by voice or text chat, in English or nine Indian languages
- Veya asks only what it still needs, then reads back a summary to confirm
- **Idea Check:** finds similar projects on GitHub and Devpost, suggests how to stand out, and checks whether you can build it in time
- Choose the model per conversation: Qwen (local), Gemini or Groq

**Projects**
- Each plan has a blueprint, README, workflow diagram, optional concept image and timeline
- Edit any section by hand, or say what to change by voice (with undo)

**Analyze**
- Make a folder for a hackathon or event. For a hackathon, Veya looks up its themes, tracks and judging criteria
- Drag in your projects, then go through five steps: **Add → Analyze → Check → Enhance → Implement**
- Veya scores each project against the criteria, checks it against existing work, suggests improvements and applies them to the plan

**Innovator**
- No idea yet? Veya researches real problems and suggests up to three ideas, with sources

**Calendar**
- Deadlines split into phases, daily tasks to tick off, and every project's progress

**Settings**
- Language, theme, and a profile photo or mascot

## How it works

```
 Expo app (iOS · Android · Web)
        │  REST + Clerk sign-in
        ▼
 FastAPI backend (gnani/)
        ├── Gnani speech-to-text / text-to-speech
        ├── Language layer          (translate to and from English)
        ├── Conversation manager    (questions, summary, confirmation)
        ├── Language model          (Qwen via Ollama, Gemini or Groq)
        ├── Idea Check + Analyze    (GitHub, Devpost and hackathon-site search)
        ├── Plans, diagrams, images (README, Mermaid, Stable Diffusion)
        ├── Idea engine             (Innovator)
        └── SQLite                  (projects and conversations)
```

All keys stay on the server; the app only talks to the backend.

## Tech stack

| Part | Built with |
|---|---|
| App | Expo, React Native, Expo Router, TypeScript, Zustand |
| Sign-in | Clerk (email and Google) |
| Voice | expo-audio, Gnani (Vachana) STT and TTS |
| Backend | FastAPI, Pydantic, SQLite |
| Models | Qwen 2.5 7B (Ollama), Google Gemini, Groq |
| Visuals | Mermaid, Stable Diffusion |

## Project structure

```
veya/
├── src/               the app (screens, components, state, API client)
├── assets/            fonts, logo, mascots
├── veya-idea-engine/  Innovator's research engine
└── gnani/             FastAPI backend (services, routes, tests)
```

## Getting started

### What you need

- Node.js 20+ and npm
- Python 3.12 and [uv](https://docs.astral.sh/uv/)
- [ffmpeg](https://ffmpeg.org/) (converts recordings for speech-to-text)
- [Ollama](https://ollama.com/) with the Qwen model: `ollama pull qwen2.5:7b`
- A Gnani (Vachana) API key and a Clerk publishable key
- Optional: a Gemini and/or Groq API key to use cloud models

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

For cloud models, also add `GEMINI_API_KEY` and/or `GROQ_API_KEY`. Only `EXPO_PUBLIC_*` values end up in the app.

### 2. Run the backend

```bash
ollama serve
cd gnani
uv sync
uv run uvicorn webapp.app:app --host 0.0.0.0 --port 8000
```

The Innovator engine starts with the backend. Its settings are in `veya-idea-engine/.env` (see its [README](veya-idea-engine/README.md)).

### 3. Run the app

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

## License

See [LICENSE](LICENSE).
