"""
Shared test fakes.

No test calls Gnani, Ollama/Qwen or Stable Diffusion. Every external
service is replaced by a small fake that records what it received.
"""

import io
import json
import math
import shutil
import struct
import wave
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from services.conversation_manager.conversation_pipeline import ConversationPipeline
from services.conversation_manager.conversation_service import ConversationService
from services.conversation_manager.conversation_state import ConversationStore
from services.conversation_manager.project_generation import ProjectGenerator
from services.perception_layer.schemas import ProjectUnderstanding
from services.project_store import ProjectRepository
from webapp.conversation_routes import router as conversation_router
from services.chat_manager import ChatPipeline, ChatService
from webapp.chat_routes import router as chat_router
from webapp.plan_routes import router as plan_router
from webapp.project_routes import router as project_router

FAKE_WAV = b"RIFF\x24\x00\x00\x00WAVEfmt fake-audio"

# Enough details for VEYA to be allowed to summarise: the idea plus
# every core topic (users, project type, time, technologies).
READY_TO_SUMMARISE_DETAILS = {
    "initial_idea": "Health band",
    "target_users": ["Elderly people"],
    "project_type": "hackathon",
    "deadline": "ten days",
    "preferred_technologies": ["Python"],
}


# Typical answers to VEYA's three fixed questions (idea, timeline, technologies).
FIXED_ANSWERS = [
    "A wearable health monitor for elderly people.",
    "It's for a hackathon, in ten days.",
    "Python, and please recommend the rest.",
]


# =========================================================
# HELPERS
# =========================================================


def extraction_json(project_details: dict | None = None, skipped_fields: list[str] | None = None) -> str:
    """A valid Qwen reply for the one-time extraction of the fixed answers."""

    return json.dumps({
        "project_details": READY_TO_SUMMARISE_DETAILS if project_details is None else project_details,
        "skipped_fields": skipped_fields or [],
    })


def decision_json(**overrides: Any) -> str:
    """A valid Qwen decision as JSON text, with optional overrides."""

    decision = {
        "extracted_information": {},
        "corrected_information": {},
        "skipped_fields": [],
        "next_action": "ask_question",
        "next_question": "Who is this project for?",
        "question_topic": "target_users",
        "ready_for_confirmation": False,
        "missing_information": [],
        "response": "Nice! Who is this project for?",
    }
    decision.update(overrides)
    return json.dumps(decision)


def make_wav_bytes(seconds: float = 0.5) -> bytes:
    """A real, short WAV file (a quiet tone) that ffmpeg can convert."""

    sample_rate = 16000
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        frames = b"".join(
            struct.pack("<h", int(3000 * math.sin(2 * math.pi * 440 * i / sample_rate)))
            for i in range(int(sample_rate * seconds))
        )
        wav_file.writeframes(frames)
    return buffer.getvalue()


requires_ffmpeg = pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="ffmpeg is not installed")


# =========================================================
# FAKES
# =========================================================


class FakeLLMClient:
    """Mimics openai.OpenAI().chat.completions.create for Qwen."""

    def __init__(self, replies: list[str] | None = None):
        self.replies = list(replies or [])
        self.calls: list[dict[str, Any]] = []
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self._create))

    def queue(self, *replies: str) -> None:
        self.replies.extend(replies)

    def _create(self, **kwargs: Any) -> Any:
        self.calls.append(kwargs)
        if not self.replies:
            raise AssertionError("FakeLLMClient received an unexpected call.")
        reply = self.replies.pop(0)
        if isinstance(reply, Exception):
            raise reply
        message = SimpleNamespace(content=reply, tool_calls=None)
        return SimpleNamespace(choices=[SimpleNamespace(message=message)])

    def last_user_prompt(self) -> str:
        return self.calls[-1]["messages"][-1]["content"]


class FakeSTT:
    def __init__(self, transcript: str = "I want to build a wearable health monitor.", language: str = "en-IN"):
        self.result = {"success": True, "transcription": transcript, "language": language, "model": "fake", "error": None}
        self.calls: list[dict[str, Any]] = []

    async def transcribe(self, audio_path: str, language_code: str = "indic-auto") -> dict:
        path = Path(audio_path)
        self.calls.append({
            "audio_path": audio_path,
            "language_code": language_code,
            "file_existed": path.is_file(),
            "header": path.read_bytes()[:4] if path.is_file() else b"",
        })
        return dict(self.result)


class FakeTTS:
    def __init__(self):
        self.calls: list[dict[str, str]] = []
        self.error: Exception | None = None
        self.audio = FAKE_WAV

    async def synthesize(self, text: str, language: str = "en-IN", voice: str = "Nalini", sample_rate: int = 48000) -> bytes:
        self.calls.append({"text": text, "language": language, "voice": voice, "sample_rate": sample_rate})
        if self.error:
            raise self.error
        return self.audio


class FakeLanguage:
    def __init__(self):
        self.normalized: list[str] = []
        self.translated: list[tuple[dict, str]] = []

    def normalize_input(self, user_input: str) -> str:
        self.normalized.append(user_input)
        return user_input

    def translate_response(self, reasoning_result: dict, target_language: str) -> dict:
        self.translated.append((reasoning_result, target_language))
        return {key: f"[{target_language}] {value}" for key, value in reasoning_result.items()}


class FakePerception:
    def __init__(self):
        self.inputs: list[str] = []

    def understand(self, user_input: str) -> ProjectUnderstanding:
        self.inputs.append(user_input)
        return ProjectUnderstanding(
            raw_input=user_input,
            intent="request_project_guidance",
            domain="Healthcare",
            problem_statement="Elderly people need health monitoring.",
            proposed_solution="A wearable health monitor.",
            confidence=0.9,
        )


class FakeReasoning:
    def __init__(self, readme_directory: Path):
        self.readme_directory = readme_directory
        self.calls: list[dict[str, Any]] = []
        self.error: Exception | None = None

    def reason(self, project: ProjectUnderstanding, user_message: str | None = None, conversation_history: list | None = None) -> dict:
        self.calls.append({"project": project, "user_message": user_message})
        if self.error:
            raise self.error
        readme_path = self.readme_directory / "HealthBand_README.md"
        readme_path.write_text("# HealthBand\n\nA wearable monitor.", encoding="utf-8")
        return {
            "response": "Here is your plan.",
            "project_name": "HealthBand",
            "project_prompt": "# HealthBand",
            "readme_path": str(readme_path),
            "visual_generation": {
                "problem_statement": "p",
                "proposed_solution": "s",
                "technologies": ["ESP32"],
                "implementation_steps": ["build"],
                "image_generation": {"visual_elements": ["band"], "environment": "home", "style": "flat"},
                "diagram_generation": {"components": ["Sensor", "App"], "connections": [{"from": "Sensor", "to": "App", "label": "BLE"}]},
            },
        }


class FakeDiagramGenerator:
    def __init__(self):
        self.inputs: list[dict] = []

    def generate_diagram(self, project_data: dict) -> dict:
        self.inputs.append(project_data)
        return {"mermaid_code": "flowchart TD\n  Sensor --> App"}


class FakeImageGenerator:
    def __init__(self):
        self.calls: list[dict] = []

    def generate_image(self, project_data: dict) -> dict:
        self.calls.append(project_data)
        return {"filename": "HealthBand.png"}


# =========================================================
# FIXTURES
# =========================================================


@pytest.fixture
def fakes(tmp_path: Path) -> SimpleNamespace:
    return SimpleNamespace(
        llm=FakeLLMClient(),
        stt=FakeSTT(),
        tts=FakeTTS(),
        language=FakeLanguage(),
        perception=FakePerception(),
        reasoning=FakeReasoning(tmp_path),
        diagram=FakeDiagramGenerator(),
        image=FakeImageGenerator(),
    )


@pytest.fixture
def store() -> ConversationStore:
    return ConversationStore()


@pytest.fixture
def pipeline(fakes: SimpleNamespace) -> ConversationPipeline:
    return ConversationPipeline(llm_client=fakes.llm, model_name="qwen-test")


@pytest.fixture
def project_repository() -> ProjectRepository:
    return ProjectRepository(":memory:")


@pytest.fixture
def service(
    fakes: SimpleNamespace,
    store: ConversationStore,
    pipeline: ConversationPipeline,
    project_repository: ProjectRepository,
) -> ConversationService:
    return ConversationService(
        store=store,
        stt_pipeline=fakes.stt,
        tts_pipeline=fakes.tts,
        language_pipeline=fakes.language,
        conversation_pipeline=pipeline,
        project_generator=ProjectGenerator(
            perception_pipeline=fakes.perception,
            reasoning_pipeline=fakes.reasoning,
            diagram_generator=fakes.diagram,
        ),
        image_generator=fakes.image,
        project_repository=project_repository,
    )


@pytest.fixture
def chat_service(fakes: SimpleNamespace, project_repository: ProjectRepository) -> ChatService:
    return ChatService(
        store=ConversationStore(),
        language_pipeline=fakes.language,
        chat_pipeline=ChatPipeline(llm_client=fakes.llm, model_name="qwen-test"),
        project_generator=ProjectGenerator(
            perception_pipeline=fakes.perception,
            reasoning_pipeline=fakes.reasoning,
            diagram_generator=fakes.diagram,
        ),
        image_generator=fakes.image,
        project_repository=project_repository,
    )


@pytest.fixture
def client(service: ConversationService, chat_service: ChatService, project_repository: ProjectRepository) -> TestClient:
    app = FastAPI()
    app.state.conversation_service = service
    app.state.chat_service = chat_service
    app.state.project_repository = project_repository
    app.state.plan_resolver = service.plan_resolver
    app.include_router(conversation_router)
    app.include_router(chat_router)
    app.include_router(project_router)
    app.include_router(plan_router)
    return TestClient(app)
