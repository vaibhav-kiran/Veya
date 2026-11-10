import os
import sys
import asyncio
import logging
import tempfile
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import HTMLResponse, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

# Add project root before importing services
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

# One shared .env for the VEYA app and this backend lives in the parent
# folder (veya/.env). Load it before the services read their settings.
from dotenv import load_dotenv

load_dotenv(PROJECT_ROOT.parent / ".env")

from services.language_layer.language_pipeline import LanguagePipeline
from services.text_to_speech.tts_pipeline import TTSPipeline
from services.speech_to_text.stt_pipeline import STTPipeline
from services.perception_layer.perception_pipeline import PerceptionPipeline
from services.reasoning_layer.reasoning_pipeline import ReasoningPipeline
from services.visual_generation.visual_pipeline import VisualPipeline
from services.speech_to_text.audio_conversion import (
    AudioConversionError,
    convert_to_wav
)
from services.conversation_manager import (
    ConversationPipeline,
    ConversationService,
    ConversationStore,
    ProjectGenerator
)
from services.plans import PlanResolver
from services.project_store import ProjectRepository
from services.chat_manager import ChatPipeline, ChatService
from webapp.chat_routes import router as chat_router
from webapp.conversation_routes import router as conversation_router
from webapp.innovator_routes import router as innovator_router
from webapp.plan_routes import router as plan_router
from webapp.project_routes import router as project_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s"
)


# =========================================================
# INITIALIZATION
# =========================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Load Qwen in the background while the server starts, so the
    # user's first answer is not slowed down by the model loading.
    app.state.qwen_warm_up = asyncio.create_task(
        asyncio.to_thread(conversation_pipeline.warm_up)
    )
    yield
    innovator_http = getattr(app.state, "innovator_http", None)
    if innovator_http is not None:
        await innovator_http.aclose()


app = FastAPI(title="HackMate AI", lifespan=lifespan)

# Browsers only: the native iOS/Android app is not subject to CORS.
# Set VEYA_CORS_ORIGINS (comma separated) for other origins; never "*" in production.
DEFAULT_CORS_ORIGINS = "http://localhost:8081,http://127.0.0.1:8081"
CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv("VEYA_CORS_ORIGINS", DEFAULT_CORS_ORIGINS).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Content-Type", "X-Veya-User"],
)

GENERATED_IMAGES_DIR = PROJECT_ROOT / "generated_images"
GENERATED_IMAGES_DIR.mkdir(parents=True, exist_ok=True)

app.mount(
    "/generated_images",
    StaticFiles(directory=str(GENERATED_IMAGES_DIR)),
    name="generated_images"
)

tts = TTSPipeline()
stt = STTPipeline()

language = LanguagePipeline()
perception = PerceptionPipeline()
reasoning = ReasoningPipeline()

# Who has which plan (free / paid) and what each plan may do.
plan_resolver = PlanResolver()
app.state.plan_resolver = plan_resolver
visual_pipeline = VisualPipeline()

# =========================================================
# VEYA MULTI-TURN CONVERSATIONS
# Reuses the pipelines created above. The conversation pipeline
# shares the Language Layer's Ollama client and model setting.
# =========================================================

conversation_pipeline = ConversationPipeline(
    llm_client=language.client,
    model_name=language.model
)

# Saved projects (SQLite). Survives server restarts, unlike conversations.
app.state.project_repository = ProjectRepository(
    os.getenv("VEYA_DB_PATH", str(PROJECT_ROOT / "data" / "veya_projects.db"))
)

app.state.conversation_service = ConversationService(
    store=ConversationStore(),
    stt_pipeline=stt,
    tts_pipeline=tts,
    language_pipeline=language,
    conversation_pipeline=conversation_pipeline,
    project_generator=ProjectGenerator(
        perception_pipeline=perception,
        reasoning_pipeline=reasoning,
        diagram_generator=visual_pipeline.diagram_generator
    ),
    image_generator=visual_pipeline.image_generator,
    project_repository=app.state.project_repository,
    plan_resolver=plan_resolver
)

# TEXT CHAT: model-driven questions (no fixed script), its own sessions,
# same project generation and storage as voice.
app.state.chat_service = ChatService(
    store=ConversationStore(),
    language_pipeline=language,
    chat_pipeline=ChatPipeline(
        llm_client=language.client,
        model_name=language.model
    ),
    project_generator=ProjectGenerator(
        perception_pipeline=perception,
        reasoning_pipeline=reasoning,
        diagram_generator=visual_pipeline.diagram_generator
    ),
    image_generator=visual_pipeline.image_generator,
    project_repository=app.state.project_repository,
    plan_resolver=plan_resolver
)

app.include_router(conversation_router)
app.include_router(chat_router)
app.include_router(project_router)
app.include_router(plan_router)
app.include_router(innovator_router)

GREETING = "Hey Vaibhav! What idea do you have in mind?"

# Holds the latest analysed project's visual data.
# Stable Diffusion is NOT called during analysis.
latest_visual_project = None


# =========================================================
# HOME PAGE
# =========================================================

@app.get("/", response_class=HTMLResponse)
async def home():

    return """
    <!DOCTYPE html>
    <html>

    <head>
        <title>HackMate AI</title>

        <script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script>

        <style>

            body {
                font-family: Arial, sans-serif;
                background: #101827;
                color: white;
                padding: 40px;
                max-width: 900px;
                margin: auto;
            }

            h1, .subtitle {
                text-align: center;
            }

            button {
                display: block;
                margin: 25px auto;
                background: #2563eb;
                color: white;
                border: none;
                padding: 18px 45px;
                border-radius: 40px;
                font-size: 18px;
                cursor: pointer;
            }

            button:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }

            #status {
                text-align: center;
                margin: 25px;
            }

            .language-selector {
                text-align: center;
                margin-top: 30px;
            }

            select {
                padding: 12px;
                margin: 15px;
                border-radius: 8px;
                font-size: 15px;
            }

            .section {
                background: #1e293b;
                padding: 20px;
                margin-top: 25px;
                border-radius: 12px;
            }

            pre {
                white-space: pre-wrap;
                overflow-wrap: break-word;
                color: #cbd5e1;
            }

            #transcript,
            #response,
            #readme,
            #normalizedInput {
                line-height: 1.6;
                overflow-wrap: break-word;
            }

            #diagram {
                background: #ffffff;
                border-radius: 10px;
                padding: 15px;
                margin-top: 15px;
                overflow-x: auto;
                text-align: center;
            }

            #diagram svg {
                max-width: 100%;
                height: auto;
            }

            .diagram-placeholder {
                color: #94a3b8;
                text-align: center;
                padding: 30px;
            }

            #conceptImage {
                display: none;
                max-width: 100%;
                width: 512px;
                height: auto;
                border-radius: 12px;
                margin: 20px auto;
            }

            #imageStatus {
                text-align: center;
                color: #94a3b8;
            }

            #generateImageBtn {
                background: #16a34a;
            }

            a {
                color: #60a5fa;
            }

            /* ---------- VEYA conversation ---------- */

            .is-hidden {
                display: none !important;
            }

            .hands-free {
                display: flex;
                justify-content: center;
                align-items: center;
                gap: 8px;
                margin: 12px auto;
                color: #cbd5e1;
                font-size: 14px;
                cursor: pointer;
            }

            .conversation-controls {
                display: flex;
                justify-content: center;
                gap: 12px;
                flex-wrap: wrap;
            }

            .conversation-controls button {
                margin: 0;
                padding: 12px 28px;
                font-size: 16px;
            }

            #confirmBtn {
                background: #16a34a;
            }

            #cancelBtn {
                background: #475569;
            }

            .chat-log {
                max-height: 420px;
                overflow-y: auto;
                display: flex;
                flex-direction: column;
                gap: 10px;
            }

            .chat-msg {
                padding: 10px 14px;
                border-radius: 12px;
                max-width: 85%;
                line-height: 1.5;
                overflow-wrap: break-word;
            }

            .chat-msg.assistant {
                background: #0f172a;
                align-self: flex-start;
            }

            .chat-msg.user {
                background: #1d4ed8;
                align-self: flex-end;
            }

            .chat-role {
                display: block;
                font-size: 12px;
                color: #94a3b8;
                margin-bottom: 4px;
            }

            .chat-msg.user .chat-role {
                color: #dbeafe;
            }

            .chat-placeholder {
                color: #94a3b8;
                text-align: center;
                padding: 10px;
            }

            .text-answer {
                display: flex;
                gap: 10px;
                margin-top: 15px;
            }

            .text-answer input {
                flex: 1;
                min-width: 0;
                padding: 12px;
                border-radius: 8px;
                border: none;
                font-size: 15px;
            }

            .text-answer button {
                margin: 0;
                padding: 12px 22px;
                font-size: 15px;
            }

            .project-summary {
                display: grid;
                grid-template-columns: minmax(120px, 220px) 1fr;
                gap: 8px 16px;
                margin: 0;
            }

            .project-summary dt {
                color: #94a3b8;
            }

            .project-summary dd {
                margin: 0;
                overflow-wrap: break-word;
            }

            @media (max-width: 600px) {

                body {
                    padding: 20px 16px;
                }

                .project-summary {
                    grid-template-columns: 1fr;
                    gap: 2px;
                }

                .project-summary dd {
                    margin-bottom: 8px;
                }
            }

        </style>

    </head>

    <body>

        <h1>HackMate AI</h1>

        <p class="subtitle">
            Your voice-first hackathon copilot.
        </p>

        <!-- OUTPUT LANGUAGE SELECTION -->

        <div class="language-selector">

            <label for="outputLanguage">
                Preferred Response Language:
            </label>

            <select id="outputLanguage">
                <option value="English">English</option>
                <option value="Hindi">Hindi</option>
                <option value="Tamil">Tamil</option>
                <option value="Telugu">Telugu</option>
                <option value="Kannada">Kannada</option>
                <option value="Malayalam">Malayalam</option>
                <option value="Bengali">Bengali</option>
                <option value="Marathi">Marathi</option>
                <option value="Gujarati">Gujarati</option>
                <option value="Punjabi">Punjabi</option>
            </select>

        </div>

        <!-- HANDS-FREE MODE -->

        <label class="hands-free" for="handsFree">
            <input id="handsFree" type="checkbox" checked>
            Hands-free: listen automatically after VEYA speaks, and send when I stop talking
        </label>

        <!-- RECORD BUTTON -->

        <button id="recordBtn">Start Conversation</button>

        <p id="status">
            Press Start Conversation and VEYA will guide you.
        </p>

        <div class="conversation-controls">

            <button id="confirmBtn" class="is-hidden">
                Confirm Project
            </button>

            <button id="cancelBtn" class="is-hidden">
                Cancel Conversation
            </button>

        </div>

        <!-- CONVERSATION WITH VEYA -->

        <div class="section">

            <h3>Conversation with VEYA</h3>

            <div id="chatLog" class="chat-log">
                <div class="chat-placeholder">
                    VEYA will appear here.
                </div>
            </div>

            <form id="textAnswerForm" class="text-answer">

                <input
                    id="textAnswer"
                    type="text"
                    maxlength="4000"
                    placeholder="Prefer typing? Write your answer here."
                    aria-label="Type your answer"
                    disabled
                >

                <button id="sendTextBtn" type="submit" disabled>
                    Send
                </button>

            </form>

        </div>

        <!-- COLLECTED PROJECT DETAILS -->

        <div class="section">

            <h3>What VEYA Has Understood</h3>

            <dl id="projectSummary" class="project-summary">
                <div class="chat-placeholder">
                    Details will appear as you talk.
                </div>
            </dl>

        </div>

        <!-- ORIGINAL IDEA -->

        <div class="section">
            <h3>Your Original Idea</h3>
            <div id="transcript"></div>
        </div>

        <!-- NORMALIZED INPUT -->

        <div class="section">
            <h3>Confirmed Project Brief (English)</h3>
            <div id="normalizedInput"></div>
        </div>

        <!-- PERCEPTION OUTPUT -->

        <div class="section">
            <h3>Perception Layer Output</h3>
            <pre id="perception"></pre>
        </div>

        <!-- REASONING OUTPUT -->

        <div class="section">
            <h3>HackMate AI Response</h3>
            <div id="response"></div>
        </div>

        <!-- README -->

        <div class="section">
            <h3>Generated README (English)</h3>

            <pre id="readme"></pre>

            <a id="download" style="display:none;">
                Download README
            </a>
        </div>

        <!-- MERMAID WORKFLOW DIAGRAM -->

        <div class="section">

            <h3>Project Workflow Diagram</h3>

            <p>
                Technical representation of your project's
                architecture and component connections.
            </p>

            <div id="diagram">
                <div class="diagram-placeholder">
                    Your workflow diagram will appear here.
                </div>
            </div>

        </div>

        <!-- STABLE DIFFUSION CONCEPT IMAGE -->

        <div class="section">

            <h3>AI-Generated Project Concept Image</h3>

            <p>
                Generate a visual illustration of your proposed
                project using Stable Diffusion.
            </p>

            <button id="generateImageBtn" disabled>
                Generate Image
            </button>

            <p id="imageStatus">
                Finish your conversation first, then press Generate Image.
            </p>

            <img
                id="conceptImage"
                alt="AI-generated project concept illustration"
            >

        </div>

        <audio id="audio"></audio>

        <script>

            // =================================================
            // MERMAID INITIALIZATION
            // =================================================

            mermaid.initialize({
                startOnLoad: false,
                theme: "dark",
                securityLevel: "strict",
                flowchart: {
                    curve: "basis",
                    htmlLabels: true
                }
            });


            // =================================================
            // DOM ELEMENTS
            // =================================================

            const button = document.getElementById("recordBtn");

            const status = document.getElementById("status");

            const audio = document.getElementById("audio");

            const transcript = document.getElementById("transcript");

            const normalizedInput =
                document.getElementById("normalizedInput");

            const perception =
                document.getElementById("perception");

            const response =
                document.getElementById("response");

            const readme =
                document.getElementById("readme");

            const download =
                document.getElementById("download");

            const diagram =
                document.getElementById("diagram");

            const conceptImage =
                document.getElementById("conceptImage");

            const imageStatus =
                document.getElementById("imageStatus");

            const outputLanguage =
                document.getElementById("outputLanguage");

            const generateImageBtn =
                document.getElementById("generateImageBtn");


            // =================================================
            // RENDER MERMAID DIAGRAM
            // =================================================

            async function renderDiagram(mermaidCode) {

                if (!mermaidCode) {

                    diagram.innerHTML = `
                        <div class="diagram-placeholder">
                            No workflow diagram generated.
                        </div>
                    `;

                    return;
                }

                try {

                    const diagramId =
                        "hackmate-diagram-" + Date.now();

                    const result = await mermaid.render(
                        diagramId,
                        mermaidCode
                    );

                    diagram.innerHTML = result.svg;

                    if (result.bindFunctions) {
                        result.bindFunctions(diagram);
                    }

                } catch (error) {

                    console.error(
                        "Diagram rendering failed:",
                        error
                    );

                    diagram.innerHTML = `
                        <div class="diagram-placeholder">
                            Unable to render workflow diagram.
                        </div>
                    `;
                }
            }


            // =================================================
            // DISPLAY STABLE DIFFUSION IMAGE
            // =================================================

            function renderConceptImage(imageUrl) {

                if (!imageUrl) {

                    conceptImage.style.display = "none";

                    imageStatus.innerText =
                        "No concept image has been generated yet.";

                    return;
                }

                conceptImage.onload = () => {

                    conceptImage.style.display = "block";

                    imageStatus.innerText =
                        "Concept image generated successfully.";

                };

                conceptImage.onerror = () => {

                    conceptImage.style.display = "none";

                    imageStatus.innerText =
                        "Unable to load the generated image.";

                };

                conceptImage.src =
                    imageUrl + "?t=" + Date.now();
            }


            // =================================================
            // CONVERSATION ELEMENTS
            // =================================================

            const confirmBtn = document.getElementById("confirmBtn");
            const cancelBtn = document.getElementById("cancelBtn");
            const chatLog = document.getElementById("chatLog");
            const textAnswerForm = document.getElementById("textAnswerForm");
            const textAnswer = document.getElementById("textAnswer");
            const sendTextBtn = document.getElementById("sendTextBtn");
            const projectSummary = document.getElementById("projectSummary");

            const FIELD_LABELS = {
                initial_idea: "Idea",
                problem_statement: "Problem",
                proposed_solution: "Solution",
                project_type: "Project type",
                target_users: "Target users",
                expected_outcome: "Expected outcome",
                deadline: "Deadline",
                available_time: "Available time",
                team_size: "Team size",
                preferred_technologies: "Technologies you want",
                technical_skills: "Your skills",
                available_hardware: "Hardware you have",
                available_software: "Software you have",
                budget: "Budget",
                preferred_features: "Features",
                constraints: "Constraints",
                recommendations_requested: "Wants recommendations for",
                veya_recommendations: "VEYA's suggestions (not confirmed)",
                additional_instructions: "Other instructions"
            };


            // =================================================
            // CONVERSATION STATE (the backend owns the real state)
            // =================================================

            let sessionId = null;
            let uiState = "idle";
            let lastConversationStatus = null;
            let firstUserAnswer = null;

            // True between "Okay, got it" and the summary arriving.
            let summaryPending = false;

            let recorder = null;
            let stream = null;
            let chunks = [];
            let stopSpeaking = null;
            let readmeObjectUrl = null;

            const handsFree = document.getElementById("handsFree");


            // =================================================
            // HANDS-FREE LISTENING (automatic start and stop)
            // =================================================

            // Volume (0 to 1) above which we treat the microphone input as speech.
            // Raise it a little if background noise keeps the recording going.
            const SPEECH_VOLUME_THRESHOLD = 0.02;

            // Send the answer after this much silence following speech.
            const SILENCE_BEFORE_SENDING_MS = 2000;

            // Give up if nothing is said for this long after listening starts.
            const NO_SPEECH_TIMEOUT_MS = 8000;

            // Safety limit for one answer.
            const MAX_RECORDING_MS = 60000;

            let silenceTimer = null;
            let silenceAudioContext = null;

            function stopSilenceDetection() {

                if (silenceTimer) {
                    clearInterval(silenceTimer);
                    silenceTimer = null;
                }

                if (silenceAudioContext) {
                    silenceAudioContext.close().catch(() => {});
                    silenceAudioContext = null;
                }
            }

            // Measures the microphone volume ten times per second and calls
            // onFinishedSpeaking() after speech followed by silence, or
            // onNothingSaid() if the user never starts speaking.
            function startSilenceDetection(micStream, onFinishedSpeaking, onNothingSaid) {

                stopSilenceDetection();

                silenceAudioContext = new AudioContext();

                const analyser = silenceAudioContext.createAnalyser();
                analyser.fftSize = 2048;
                silenceAudioContext
                    .createMediaStreamSource(micStream)
                    .connect(analyser);

                const samples = new Float32Array(analyser.fftSize);
                const startedAt = Date.now();
                let lastSpeechAt = null;

                silenceTimer = setInterval(() => {

                    analyser.getFloatTimeDomainData(samples);

                    // Root-mean-square volume of the latest audio samples.
                    let sumOfSquares = 0;
                    for (const sample of samples) {
                        sumOfSquares += sample * sample;
                    }
                    const volume = Math.sqrt(sumOfSquares / samples.length);

                    const now = Date.now();

                    if (volume > SPEECH_VOLUME_THRESHOLD) {
                        lastSpeechAt = now;
                    }

                    const userHasSpoken = lastSpeechAt !== null;

                    if (userHasSpoken && now - lastSpeechAt > SILENCE_BEFORE_SENDING_MS) {
                        stopSilenceDetection();
                        onFinishedSpeaking();
                    } else if (!userHasSpoken && now - startedAt > NO_SPEECH_TIMEOUT_MS) {
                        stopSilenceDetection();
                        onNothingSaid();
                    } else if (now - startedAt > MAX_RECORDING_MS) {
                        stopSilenceDetection();
                        onFinishedSpeaking();
                    }

                }, 100);
            }

            // Stop the current recording WITHOUT sending it.
            function discardRecording() {

                stopSilenceDetection();

                if (recorder && recorder.state === "recording") {
                    recorder.onstop = null;
                    recorder.stop();
                }

                stopMicrophone();
            }

            const BUTTON_LABELS = {
                idle: "Start Conversation",
                starting: "Starting...",
                speaking: "Stop VEYA's voice",
                ready: "Tap to answer",
                recording: "Listening... tap to stop",
                processing: "Processing...",
                awaiting_confirmation: "Tap to answer",
                generating: "Generating project...",
                completed: "Start New Conversation"
            };

            function setVisible(element, visible) {
                element.classList.toggle("is-hidden", !visible);
            }

            function setUiState(newState, message) {

                uiState = newState;

                if (message) {
                    status.innerText = message;
                }

                if (newState === "error" && summaryPending) {
                    button.innerText = "Try again";
                } else if (newState === "error") {
                    button.innerText = sessionId
                        ? "Tap to answer"
                        : "Start Conversation";
                } else {
                    button.innerText = BUTTON_LABELS[newState] || "Record";
                }

                button.disabled = [
                    "starting",
                    "processing",
                    "generating"
                ].includes(newState);

                const conversationActive =
                    sessionId !== null &&
                    !["idle", "completed"].includes(newState);

                // Typing stays possible while listening, because hands-free
                // mode starts listening automatically after every reply.
                const canAnswer =
                    sessionId !== null &&
                    !summaryPending &&
                    ["ready", "awaiting_confirmation", "error", "recording"].includes(newState);

                textAnswer.disabled = !canAnswer;
                sendTextBtn.disabled = !canAnswer;

                setVisible(
                    confirmBtn,
                    newState === "awaiting_confirmation" ||
                    (["error", "recording"].includes(newState) &&
                        lastConversationStatus === "awaiting_confirmation")
                );

                setVisible(cancelBtn, conversationActive);

                outputLanguage.disabled = conversationActive;
            }


            // =================================================
            // HELPERS
            // =================================================

            async function readJson(httpResponse) {

                let data = null;

                try {
                    data = await httpResponse.json();
                } catch (error) {
                    data = null;
                }

                if (!httpResponse.ok) {

                    const detail = data && data.detail;

                    const error = new Error(
                        typeof detail === "string"
                            ? detail
                            : "Request failed (" + httpResponse.status + ")."
                    );

                    error.status = httpResponse.status;

                    throw error;
                }

                return data;
            }

            function addChatMessage(role, text) {

                const placeholder =
                    chatLog.querySelector(".chat-placeholder");

                if (placeholder) {
                    placeholder.remove();
                }

                const bubble = document.createElement("div");
                bubble.className = "chat-msg " + role;

                const label = document.createElement("span");
                label.className = "chat-role";
                label.textContent = role === "user" ? "You" : "VEYA";

                const body = document.createElement("div");
                body.textContent = text;

                bubble.appendChild(label);
                bubble.appendChild(body);
                chatLog.appendChild(bubble);

                chatLog.scrollTop = chatLog.scrollHeight;
            }

            function renderSummary(details, skippedFields) {

                projectSummary.innerHTML = "";

                let shown = 0;

                for (const [field, label] of Object.entries(FIELD_LABELS)) {

                    const value = details ? details[field] : null;

                    if (value === null || value === undefined) continue;
                    if (Array.isArray(value) && value.length === 0) continue;

                    const term = document.createElement("dt");
                    term.textContent = label;

                    const description = document.createElement("dd");
                    description.textContent = Array.isArray(value)
                        ? value.join(", ")
                        : String(value).replace(/_/g, " ");

                    projectSummary.appendChild(term);
                    projectSummary.appendChild(description);
                    shown += 1;
                }

                if (skippedFields && skippedFields.length > 0) {

                    const term = document.createElement("dt");
                    term.textContent = "Not sure yet";

                    const description = document.createElement("dd");
                    description.textContent = skippedFields
                        .map(field => FIELD_LABELS[field] || field)
                        .join(", ");

                    projectSummary.appendChild(term);
                    projectSummary.appendChild(description);
                    shown += 1;
                }

                if (shown === 0) {
                    projectSummary.innerHTML =
                        '<div class="chat-placeholder">Details will appear as you talk.</div>';
                }
            }

            function stopMicrophone() {

                if (stream) {
                    stream.getTracks().forEach(track => track.stop());
                }

                stream = null;
            }

            function resetOutputs() {

                chatLog.innerHTML =
                    '<div class="chat-placeholder">VEYA will appear here.</div>';

                renderSummary(null, []);

                transcript.innerText = "";
                normalizedInput.innerText = "";
                perception.innerText = "";
                response.innerText = "";
                readme.innerText = "";

                download.style.display = "none";

                if (readmeObjectUrl) {
                    URL.revokeObjectURL(readmeObjectUrl);
                    readmeObjectUrl = null;
                }

                diagram.innerHTML = `
                    <div class="diagram-placeholder">
                        Your workflow diagram will appear here.
                    </div>
                `;

                conceptImage.style.display = "none";
                generateImageBtn.disabled = true;
                imageStatus.innerText =
                    "Finish your conversation first, then press Generate Image.";
            }

            function showError(message) {

                console.error(message);

                setUiState("error", "Error: " + message);
            }


            // =================================================
            // PLAY VEYA'S REPLY (Gnani TTS audio)
            // =================================================

            // Download the audio of VEYA's latest reply. Returns null if it fails.
            async function fetchReplyAudio() {

                try {

                    const audioResponse = await fetch(
                        "/conversation/" + sessionId + "/audio"
                    );

                    if (!audioResponse.ok) {
                        throw new Error("Audio is not available.");
                    }

                    return await audioResponse.blob();

                } catch (error) {

                    console.warn("Could not load VEYA's reply:", error);
                    return null;
                }
            }

            async function playReply() {

                setUiState("speaking", "VEYA is speaking...");

                const audioBlob = await fetchReplyAudio();

                if (audioBlob) {
                    await playAudioBlob(audioBlob);
                }
            }

            // Play audio and wait until it ends, fails, or the user stops it.
            async function playAudioBlob(audioBlob) {

                try {

                    const audioUrl = URL.createObjectURL(audioBlob);

                    audio.src = audioUrl;

                    // Wait until the audio ends, fails, or the user stops it.
                    await new Promise(resolve => {

                        stopSpeaking = () => {
                            audio.pause();
                            resolve();
                        };

                        audio.onended = resolve;
                        audio.onerror = resolve;

                        audio.play().catch(error => {
                            console.warn("Audio playback failed:", error);
                            resolve();
                        });
                    });

                    URL.revokeObjectURL(audioUrl);

                } catch (error) {

                    console.warn("Could not play VEYA's reply:", error);

                } finally {

                    stopSpeaking = null;
                }
            }


            // =================================================
            // HANDLE ONE VEYA TURN
            // =================================================

            async function handleTurn(data) {

                if (data.transcript) {

                    addChatMessage("user", data.transcript);

                    if (!firstUserAnswer) {
                        firstUserAnswer = data.transcript;
                        transcript.innerText = data.transcript;
                    }
                }

                addChatMessage("assistant", data.message);

                renderSummary(data.project_details, data.skipped_fields);

                lastConversationStatus = data.status;

                if (data.status === "cancelled") {
                    sessionId = null;
                    setUiState("idle", "Conversation ended. Press Start Conversation to begin again.");
                    return;
                }

                // After the third question VEYA said "Okay, got it...".
                if (data.summary_pending) {
                    await sayGotItAndWaitForSummary(data);
                    return;
                }

                // Never start recording while VEYA is still speaking.
                if (data.audio_available) {
                    await playReply();
                }

                if (data.status === "ready_to_generate") {
                    await confirmProject();
                    return;
                }

                const voiceNote = data.audio_error ? " (" + data.audio_error + ")" : "";

                if (data.status === "awaiting_confirmation") {
                    setUiState(
                        "awaiting_confirmation",
                        "Check the summary. Press Confirm Project, or tap to answer to correct something." + voiceNote
                    );
                } else {
                    setUiState(
                        "ready",
                        "Tap to answer, or type your answer below." + voiceNote
                    );
                }

                // Hands-free: start listening as soon as VEYA has finished
                // speaking (playReply above waits for the audio to end).
                // Not if the user cancelled or started typing meanwhile.
                const stillWaitingForAnswer =
                    ["ready", "awaiting_confirmation"].includes(uiState) &&
                    sessionId === data.session_id &&
                    textAnswer.value.trim() === "";

                if (handsFree.checked && stillWaitingForAnswer) {
                    await startRecording();
                }
            }


            // =================================================
            // SUMMARY AFTER THE THREE QUESTIONS
            // =================================================

            // Ask the backend for the summary (one Qwen call).
            // Never throws: resolves to { data } or { error }.
            async function requestSummary(requestSession) {

                try {

                    const summaryResponse = await fetch(
                        "/conversation/" + requestSession + "/summary",
                        { method: "POST" }
                    );

                    return { data: await readJson(summaryResponse) };

                } catch (error) {

                    return { error: error };
                }
            }

            async function sayGotItAndWaitForSummary(gotItTurn) {

                const requestSession = sessionId;

                summaryPending = true;

                // Download "Okay, got it" BEFORE asking for the summary, so the
                // summary's audio can never replace it on the server.
                const gotItAudio = gotItTurn.audio_available
                    ? await fetchReplyAudio()
                    : null;

                // Qwen starts reading the answers now, while VEYA speaks.
                const summaryRequest = requestSummary(requestSession);

                if (gotItAudio) {
                    setUiState("speaking", "VEYA is speaking...");
                    await playAudioBlob(gotItAudio);
                }

                if (sessionId !== requestSession) return;

                await showSummaryWhenReady(summaryRequest, requestSession);
            }

            async function showSummaryWhenReady(summaryRequest, requestSession) {

                setUiState("processing", "VEYA is putting everything together...");

                const result = await summaryRequest;

                // Ignore the result if the user cancelled meanwhile.
                if (sessionId !== requestSession) return;

                if (result.error) {

                    if (result.error.status === 404) {
                        sessionId = null;
                        summaryPending = false;
                    }

                    showError(result.error.message);
                    return;
                }

                summaryPending = false;

                // The summary is a normal VEYA turn: it is spoken, then the
                // Confirm Project button appears.
                await handleTurn(result.data);
            }

            async function retrySummary() {

                const requestSession = sessionId;

                await showSummaryWhenReady(requestSummary(requestSession), requestSession);
            }


            // =================================================
            // START CONVERSATION
            // =================================================

            async function startConversation() {

                sessionId = null;
                firstUserAnswer = null;
                lastConversationStatus = null;
                summaryPending = false;

                resetOutputs();

                setUiState("starting", "Starting your conversation with VEYA...");

                try {

                    const startResponse = await fetch("/conversation/start", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            preferred_language: outputLanguage.value
                        })
                    });

                    const data = await readJson(startResponse);

                    sessionId = data.session_id;

                    await handleTurn(data);

                } catch (error) {

                    sessionId = null;
                    showError(error.message);
                }
            }


            // =================================================
            // RECORD AN ANSWER
            // =================================================

            async function startRecording() {

                const stateBeforeRecording = uiState;

                try {

                    stream = await navigator.mediaDevices.getUserMedia({
                        audio: {
                            // Keeps leftover speaker sound and room noise
                            // from being mistaken for the user's voice.
                            echoCancellation: true,
                            noiseSuppression: true,
                            autoGainControl: true
                        }
                    });

                } catch (error) {

                    setUiState(
                        stateBeforeRecording,
                        "Microphone unavailable (" + error.message + "). You can type your answer below."
                    );
                    return;
                }

                try {

                    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
                        ? "audio/webm;codecs=opus"
                        : "audio/webm";

                    recorder = new MediaRecorder(stream, { mimeType: mimeType });

                    chunks = [];

                    recorder.ondataavailable = event => {
                        if (event.data.size > 0) {
                            chunks.push(event.data);
                        }
                    };

                    recorder.onerror = event => {
                        discardRecording();
                        showError("Recording failed. Please try again or type your answer.");
                    };

                    recorder.start();

                    if (handsFree.checked) {

                        setUiState("recording", "Listening... just stop talking when you're done.");

                        startSilenceDetection(
                            stream,
                            () => {
                                if (uiState === "recording") stopRecordingAndSend();
                            },
                            () => {
                                discardRecording();
                                setUiState(
                                    stateBeforeRecording,
                                    "I didn't hear anything. Tap to answer, or type below."
                                );
                            }
                        );

                    } else {

                        setUiState("recording", "Listening... tap the button again when you're done.");
                    }

                } catch (error) {

                    stopMicrophone();
                    setUiState(
                        stateBeforeRecording,
                        "Recording could not start (" + error.message + "). You can type your answer below."
                    );
                }
            }

            function stopRecordingAndSend() {

                stopSilenceDetection();

                setUiState("processing", "Converting your speech to text...");

                recorder.onstop = async () => {

                    stopMicrophone();

                    const blob = new Blob(chunks, { type: recorder.mimeType });

                    if (blob.size === 0) {
                        showError("Nothing was recorded. Please try again.");
                        return;
                    }

                    const formData = new FormData();
                    formData.append("audio_file", blob, "recording.webm");

                    await sendAnswer(formData);
                };

                recorder.stop();
            }


            // =================================================
            // SEND AN ANSWER (audio or text)
            // =================================================

            async function sendAnswer(formData, typedAnswer = null) {

                const requestSession = sessionId;

                status.innerText = "VEYA is thinking...";

                try {

                    const answerResponse = await fetch(
                        "/conversation/" + requestSession + "/respond",
                        { method: "POST", body: formData }
                    );

                    const data = await readJson(answerResponse);

                    // Ignore late answers for a conversation that was cancelled.
                    if (sessionId !== requestSession) return;

                    // A typed answer is already shown in the chat.
                    if (typedAnswer) {
                        if (!firstUserAnswer) {
                            firstUserAnswer = typedAnswer;
                            transcript.innerText = typedAnswer;
                        }
                        data.transcript = null;
                    }

                    await handleTurn(data);

                } catch (error) {

                    if (sessionId !== requestSession) return;

                    if (error.status === 404) {
                        sessionId = null;
                    }

                    showError(error.message);
                }
            }

            textAnswerForm.onsubmit = async function(event) {

                event.preventDefault();

                const answer = textAnswer.value.trim();

                if (!answer || !sessionId) return;

                // A typed answer replaces any recording that is running.
                if (uiState === "recording") {
                    discardRecording();
                }

                textAnswer.value = "";

                setUiState("processing", "VEYA is thinking...");

                addChatMessage("user", answer);

                const formData = new FormData();
                formData.append("text", answer);

                await sendAnswer(formData, answer);
            };

            // Turning hands-free off while listening: keep recording, but the
            // user now stops it with the button.
            handsFree.addEventListener("change", function() {

                if (!handsFree.checked && uiState === "recording") {
                    stopSilenceDetection();
                    status.innerText = "Listening... tap the button again when you're done.";
                }
            });

            // Starting to type means the user chose to type, so stop listening.
            textAnswer.addEventListener("input", function() {

                if (uiState !== "recording" || textAnswer.value.trim() === "") return;

                discardRecording();

                setUiState(
                    lastConversationStatus === "awaiting_confirmation"
                        ? "awaiting_confirmation"
                        : "ready",
                    "Type your answer and press Send."
                );
            });


            // =================================================
            // CONFIRM AND GENERATE THE PROJECT
            // =================================================

            async function confirmProject() {

                if (!sessionId) return;

                // Hands-free mode may be listening while the summary is shown.
                discardRecording();

                const requestSession = sessionId;

                setUiState(
                    "generating",
                    "VEYA is building your project plan. This can take a few minutes..."
                );

                try {

                    const confirmResponse = await fetch(
                        "/conversation/" + requestSession + "/confirm",
                        { method: "POST" }
                    );

                    const data = await readJson(confirmResponse);

                    if (sessionId !== requestSession) return;

                    lastConversationStatus = data.status;

                    await renderProjectResult(data.result);

                    setUiState(
                        "completed",
                        "Your project is ready! Scroll down to see the plan, README and diagram."
                    );

                } catch (error) {

                    if (sessionId !== requestSession) return;

                    lastConversationStatus = "awaiting_confirmation";

                    showError(error.message);
                }
            }

            async function renderProjectResult(result) {

                normalizedInput.innerText = result.perception_input || "";

                perception.innerText = JSON.stringify(result.perception, null, 4);

                response.innerText = result.response || "";

                readme.innerText = result.readme_markdown || "";

                if (result.readme_markdown) {

                    readmeObjectUrl = URL.createObjectURL(
                        new Blob([result.readme_markdown], { type: "text/markdown" })
                    );

                    download.href = readmeObjectUrl;
                    download.download = result.readme_filename || "Project_README.md";
                    download.style.display = "inline-block";
                }

                await renderDiagram(result.workflow_diagram);

                conceptImage.style.display = "none";

                generateImageBtn.disabled = !result.image_generation_available;

                imageStatus.innerText = result.image_generation_available
                    ? "Your project is ready. Press Generate Image to create the concept image."
                    : "Image generation is unavailable for this project.";
            }


            // =================================================
            // BUTTONS
            // =================================================

            button.onclick = async function() {

                if (uiState === "speaking") {
                    if (stopSpeaking) stopSpeaking();
                    return;
                }

                if (uiState === "recording") {
                    stopRecordingAndSend();
                    return;
                }

                if (uiState === "idle" || uiState === "completed" || !sessionId) {
                    await startConversation();
                    return;
                }

                // The summary failed (for example Ollama was busy): try again.
                if (uiState === "error" && summaryPending) {
                    await retrySummary();
                    return;
                }

                if (["ready", "awaiting_confirmation", "error"].includes(uiState)) {
                    await startRecording();
                }
            };

            confirmBtn.onclick = confirmProject;

            cancelBtn.onclick = async function() {

                const sessionToCancel = sessionId;

                if (stopSpeaking) stopSpeaking();

                discardRecording();

                sessionId = null;
                lastConversationStatus = null;
                summaryPending = false;

                setUiState("idle", "Conversation cancelled. Press Start Conversation to begin again.");

                if (sessionToCancel) {
                    try {
                        await fetch(
                            "/conversation/" + sessionToCancel + "/cancel",
                            { method: "POST" }
                        );
                    } catch (error) {
                        console.warn("Cancel request failed:", error);
                    }
                }
            };

            setUiState("idle");


            // =================================================
            // GENERATE IMAGE BUTTON
            // =================================================

            generateImageBtn.onclick = async function() {

                generateImageBtn.disabled = true;

                conceptImage.style.display = "none";

                imageStatus.innerText =
                    "Stable Diffusion is generating your image. This may take a while...";

                status.innerText =
                    "Generating project concept image...";

                try {

                    if (!sessionId) {
                        throw new Error(
                            "Start and complete a conversation first."
                        );
                    }

                    const imageResponse = await fetch(
                        "/conversation/" + sessionId + "/generate-image",
                        {
                            method: "POST"
                        }
                    );

                    const imageResult =
                        await imageResponse.json();

                    if (!imageResponse.ok) {

                        throw new Error(
                            imageResult.detail ||
                            "Image generation failed."
                        );
                    }

                    renderConceptImage(imageResult.image_url);

                    status.innerText =
                        "Concept image generation completed.";

                } catch (error) {

                    imageStatus.innerText =
                        "Image generation error: " + error.message;

                    status.innerText =
                        "Image generation failed.";

                    console.error(error);

                } finally {

                    generateImageBtn.disabled = false;
                }
            };

        </script>

    </body>
    </html>
    """


# =========================================================
# GREETING
# =========================================================

# The greeting never changes, so it is synthesised once and reused
# (each Gnani TTS call costs credits and anyone can call this endpoint).
_greeting_audio: bytes | None = None


@app.get("/greeting")
async def greeting():

    global _greeting_audio

    if _greeting_audio is None:

        audio_path = await tts.speak(
            text=GREETING,
            language="en-IN",
            voice="Nalini"
        )

        with open(audio_path, "rb") as audio:
            _greeting_audio = audio.read()

    return Response(
        content=_greeting_audio,
        media_type="audio/wav"
    )


# =========================================================
# SPEECH TO TEXT
# =========================================================

@app.post("/transcribe")
async def transcribe(audio_file: UploadFile = File(...)):

    with tempfile.TemporaryDirectory() as temp_dir:

        webm_path = Path(temp_dir) / "recording.webm"
        wav_path = Path(temp_dir) / "recording.wav"

        webm_path.write_bytes(await audio_file.read())

        try:

            convert_to_wav(webm_path, wav_path)

        except AudioConversionError as error:

            # ffmpeg's output stays in the server log, never in the response.
            logging.getLogger(__name__).warning("Audio conversion failed: %s", error)
            raise HTTPException(
                status_code=400,
                detail="The recording could not be read. Please record again."
            )

        result = await stt.transcribe(
            audio_path=str(wav_path),
            language_code="indic-auto"
        )

        if not result["success"]:

            logging.getLogger(__name__).error("Gnani STT failed: %s", str(result["error"])[:300])
            raise HTTPException(
                status_code=502,
                detail="The speech recognition service is not available right now."
            )

        return {
            "transcription": result["transcription"],
            "language": result["language"]
        }


# =========================================================
# ANALYSE: LANGUAGE + PERCEPTION + REASONING + DIAGRAM
# =========================================================

@app.post("/analyse")
async def analyse(data: dict):

    global latest_visual_project

    user_input = data.get("user_input", "").strip()

    preferred_language = data.get(
        "preferred_output_language",
        "English"
    ).strip()

    if not user_input:
        raise HTTPException(
            status_code=400,
            detail="No user input provided"
        )

    if not preferred_language:
        preferred_language = "English"

    try:

        # STEP 1: NORMALIZE INPUT

        print("\n========== LANGUAGE NORMALIZATION ==========")

        print("Original input:", user_input)

        english_input = language.normalize_input(user_input)

        print("English input:", english_input)


        # STEP 2: PERCEPTION

        print("\n========== PERCEPTION LAYER ==========")

        project = perception.understand(english_input)

        perception_output = project.model_dump()

        print("Perception completed.")


        # STEP 3: REASONING

        print("\n========== REASONING LAYER ==========")

        result = reasoning.reason(
            project,
            user_message=english_input
        )

        if not isinstance(result, dict):
            raise ValueError(
                "Reasoning Layer did not return a valid dictionary."
            )


        # STEP 4: PREPARE VISUAL DATA
        # No Stable Diffusion call happens here.

        print("\n========== VISUAL DATA PREPARATION ==========")

        visual_generation = result.get("visual_generation")

        workflow_diagram = None

        latest_visual_project = None

        image_generation_available = False

        if isinstance(visual_generation, dict):

            project_name = result.get("project_name")

            if project_name:

                generator_input = {
                    "project_name": project_name,
                    **visual_generation
                }

                # Save data for the separate image endpoint.
                latest_visual_project = generator_input

                image_generation_available = True

                # Generate ONLY the Mermaid diagram here.
                diagram_result = (
                    visual_pipeline.diagram_generator.generate_diagram(
                        generator_input
                    )
                )

                if isinstance(diagram_result, dict):
                    workflow_diagram = diagram_result.get(
                        "mermaid_code"
                    )

                print("Workflow diagram generated.")

        else:

            print("No visual generation data available.")


        # STEP 5: README

        readme_path = result.get("readme_path")

        readme_content = ""

        if readme_path:

            readme_file = Path(readme_path)

            if readme_file.exists():

                readme_content = readme_file.read_text(
                    encoding="utf-8"
                )


        # STEP 6: TRANSLATE RESPONSE

        print("\n========== OUTPUT LANGUAGE CONVERSION ==========")

        print("Preferred language:", preferred_language)

        if preferred_language.lower() not in (
            "english",
            "en",
            "en-in",
            "en-us"
        ):

            result = language.translate_response(
                reasoning_result=result,
                target_language=preferred_language
            )

        print("Output translation completed.")


        # STEP 7: RETURN RESPONSE

        return {

            "original_input": user_input,

            "english_input": english_input,

            "preferred_output_language": preferred_language,

            "perception": perception_output,

            "response": result.get("response", ""),

            "readme": readme_content,

            "readme_download": None,

            "workflow_diagram": workflow_diagram,

            "image_generation_available": image_generation_available

        }

    except Exception as e:

        logging.getLogger(__name__).exception("Analysis failed")

        raise HTTPException(
            status_code=500,
            detail="Analysis failed. Please try again."
        )


# =========================================================
# GENERATE IMAGE: STABLE DIFFUSION ONLY
# =========================================================

@app.post("/generate-image")
async def generate_image():

    if not latest_visual_project:

        raise HTTPException(
            status_code=400,
            detail="Please analyse a project before generating an image."
        )

    try:

        print("\n========== STABLE DIFFUSION IMAGE GENERATION ==========")

        # This is the ONLY place Stable Diffusion is called.
        image_result = visual_pipeline.image_generator.generate_image(
            latest_visual_project
        )

        filename = image_result.get("filename")

        if not filename:

            raise ValueError(
                "Image generator did not return a filename."
            )

        image_path = GENERATED_IMAGES_DIR / filename

        if not image_path.exists():

            raise ValueError(
                "Generated image file could not be found."
            )

        image_url = f"/generated_images/{filename}"

        print("Image generated:", image_path)

        return {
            "success": True,
            "image_url": image_url,
            "filename": filename
        }

    except Exception as e:

        logging.getLogger(__name__).exception("Image generation failed")

        raise HTTPException(
            status_code=500,
            detail="The concept image could not be generated."
        )


# =========================================================
# README DOWNLOAD
# =========================================================

@app.get("/readme")
async def download_readme():

    raise HTTPException(
        status_code=404,
        detail="README download endpoint is not configured yet."
    )