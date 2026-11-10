"""
End-to-end checks with all external services mocked:
STT -> Language -> Qwen -> state -> TTS, then Perception -> Reasoning.
"""

import asyncio
import json
import threading
from pathlib import Path
from types import SimpleNamespace

import pytest

from services.conversation_manager.conversation_prompts import (
    GOT_IT_MESSAGE,
    OPENING_MESSAGE,
    TECHNOLOGY_QUESTION,
    TIMELINE_QUESTION,
)
from services.conversation_manager.conversation_service import ConversationService
from services.conversation_manager.errors import (
    ConversationBusyError,
    InvalidConversationStateError,
)
from services.conversation_manager.project_generation import (
    ProjectGenerator,
    add_confirmed_facts,
    build_project_brief,
)
from services.conversation_manager.schemas import ConversationStatus, ProjectDetails
from services.perception_layer.schemas import ProjectUnderstanding
from tests.conftest import (
    FIXED_ANSWERS,
    FakeLLMClient,
    decision_json,
    extraction_json,
    make_wav_bytes,
    requires_ffmpeg,
)


@requires_ffmpeg
def test_full_voice_conversation_flow(client, fakes):
    def speak(transcript: str, language: str) -> dict:
        fakes.stt.result["transcription"] = transcript
        fakes.stt.result["language"] = language
        response = client.post(
            f"/conversation/{session_id}/respond",
            files={"audio_file": ("recording.wav", make_wav_bytes(), "audio/wav")},
        )
        assert response.status_code == 200, response.text
        return response.json()

    # ---- 1. VEYA opens with the first fixed question (the idea) ----
    opening = client.post("/conversation/start").json()
    session_id = opening["session_id"]
    assert opening["message"] == OPENING_MESSAGE

    # ---- 2. three spoken answers, with NO Qwen call in between ----
    replies = [
        speak("Mujhe elderly logon ke liye ek health band banana hai", "hi-IN"),
        speak("Hackathon hai, ten days mein", "hi-IN"),
        speak("Python and React. Actually Flutter instead of React.", "en-IN"),
    ]

    assert fakes.llm.calls == []
    assert [reply["message"] for reply in replies] == [TIMELINE_QUESTION, TECHNOLOGY_QUESTION, GOT_IT_MESSAGE]
    assert [reply["summary_pending"] for reply in replies] == [False, False, True]
    assert replies[0]["transcript"].startswith("Mujhe")
    assert replies[0]["detected_language"] == "hi-IN"
    # TTS spoke exactly the text that was shown.
    assert [call["text"] for call in fakes.tts.calls] == [
        OPENING_MESSAGE, TIMELINE_QUESTION, TECHNOLOGY_QUESTION, GOT_IT_MESSAGE,
    ]

    # ---- 3. the summary: ONE Qwen call that reads all three answers ----
    # Hindi answers go through the Language Layer; the English one does not.
    translations = {
        "Mujhe elderly logon ke liye ek health band banana hai": "I want to build a health band for elderly people",
        "Hackathon hai, ten days mein": "It is a hackathon, in ten days",
    }
    fakes.language.normalize_input = lambda text: translations[text]
    fakes.llm.queue(extraction_json({
        "initial_idea": "A health band for elderly people",
        "target_users": ["Elderly people"],
        "project_type": "hackathon",
        "deadline": "ten days",
        "preferred_technologies": ["Python", "Flutter"],
    }))

    summary = client.post(f"/conversation/{session_id}/summary").json()

    assert len(fakes.llm.calls) == 1
    prompt = fakes.llm.last_user_prompt()
    assert "ANSWER 1: I want to build a health band for elderly people" in prompt
    assert "ANSWER 2: It is a hackathon, in ten days" in prompt
    assert "ANSWER 3: Python and React. Actually Flutter instead of React." in prompt
    assert summary["status"] == "awaiting_confirmation"
    assert summary["next_action"] == "request_confirmation"
    assert summary["message"].startswith("Here's what I've understood so far.")
    assert "Python and Flutter" in summary["message"]
    assert "React" not in summary["message"]
    assert fakes.tts.calls[-1]["text"] == summary["message"]

    # ---- 4. a spoken correction after the summary gives a new summary ----
    fakes.language.normalize_input = lambda text: text
    fakes.llm.queue(decision_json(
        next_action="request_confirmation",
        corrected_information={"deadline": "two weeks"},
        response="",
    ))
    corrected = speak("Actually the deadline is two weeks.", "en-IN")
    assert corrected["status"] == "awaiting_confirmation"
    assert "deadline of two weeks" in corrected["message"]

    # ---- 5. spoken "yes" ----
    fakes.llm.queue(decision_json(next_action="generate_project", response=""))
    yes = speak("Yes, that's right", "en-IN")
    assert yes["status"] == "ready_to_generate"

    # ---- 6. generation through Perception and Reasoning ----
    result = client.post(f"/conversation/{session_id}/confirm").json()["result"]

    perception_input = fakes.perception.inputs[0]
    for fact in ["A health band for elderly people", "Hackathon", "two weeks", "Python, Flutter", "Elderly people"]:
        assert fact in perception_input, fact

    reasoning_call = fakes.reasoning.calls[0]
    # Perception output reached Reasoning, with confirmed facts added.
    assert reasoning_call["project"].domain == "Healthcare"
    assert reasoning_call["project"].intent == "develop_new_project_idea"
    assert "Flutter" in reasoning_call["project"].technologies
    assert "Deadline: two weeks" in reasoning_call["project"].constraints

    assert result["readme_markdown"].startswith("# HealthBand")
    assert fakes.diagram.inputs[0]["project_name"] == "HealthBand"
    # Stable Diffusion is never triggered automatically.
    assert fakes.image.calls == []


def test_brief_marks_recommendations_as_unconfirmed(store):
    state = store.create_conversation()
    state.project_details = ProjectDetails(
        initial_idea="Plant doctor",
        preferred_technologies=["Python"],
        veya_recommendations=["Use a MobileNet model"],
    )

    brief = build_project_brief(state)

    assert "Technologies the user wants to use: Python" in brief
    assert "Suggestions made by VEYA during the conversation (not confirmed preferences): Use a MobileNet model" in brief


def test_confirmed_facts_are_not_lost_if_perception_omits_them():
    understanding = ProjectUnderstanding(raw_input="x", intent="general_question", confidence=0.5)
    details = ProjectDetails(
        initial_idea="Plant doctor",
        preferred_technologies=["Python"],
        deadline="Friday",
        budget="zero",
        target_users=["Farmers"],
    )

    enriched = add_confirmed_facts(understanding, details)

    assert enriched.intent == "develop_new_project_idea"
    assert enriched.technologies == ["Python"]
    assert enriched.target_users == ["Farmers"]
    assert "Deadline: Friday" in enriched.constraints
    assert "Budget: zero" in enriched.constraints
    assert enriched.proposed_solution == "Plant doctor"


# =========================================================
# EXISTING COMPONENTS STILL WORK
# =========================================================


def test_existing_reasoning_pipeline_still_writes_readme(tmp_path, monkeypatch, store):
    """Runs the REAL ReasoningPipeline with a mocked model."""

    monkeypatch.setenv("OLLAMA_MODEL", "qwen-test")
    from services.reasoning_layer.reasoning_pipeline import ReasoningPipeline

    reasoning = ReasoningPipeline()
    reasoning.readme_directory = tmp_path
    reasoning.client = FakeLLMClient([
        "Tool step finished.",
        json.dumps({
            "response": "Plan ready.",
            "action": "develop_new_project_idea",
            "reasoning_summary": "summary",
            "follow_up_questions": [],
            "project_updates": {},
            "project_name": "Plant Doctor",
            "project_prompt": "# Plant Doctor\n\nDetect plant diseases.",
            "visual_generation": {
                "problem_statement": "p",
                "proposed_solution": "s",
                "technologies": ["Python"],
                "implementation_steps": ["Collect data"],
                "image_generation": {"visual_elements": ["leaf"], "environment": "farm", "style": "flat"},
                "diagram_generation": {"components": ["Camera", "Model"], "connections": [{"from": "Camera", "to": "Model", "label": "image"}]},
            },
        }),
    ])

    from services.visual_generation.diagram_generator import DiagramGenerator

    monkeypatch.chdir(tmp_path)
    perception = SimpleNamespace(
        understand=lambda text: ProjectUnderstanding(raw_input=text, intent="develop_new_project_idea", confidence=0.9)
    )
    generator = ProjectGenerator(perception, reasoning, DiagramGenerator())

    state = store.create_conversation()
    state.project_details = ProjectDetails(initial_idea="Plant disease detector")

    result, visual_input = generator.generate(state)

    assert (tmp_path / "PlantDoctor_README.md").read_text(encoding="utf-8").startswith("# Plant Doctor")
    assert result.readme_filename == "PlantDoctor_README.md"
    assert result.project_name == "PlantDoctor"
    assert "Camera" in result.workflow_diagram
    assert visual_input["project_name"] == "PlantDoctor"


# =========================================================
# CONCURRENCY
# =========================================================


def test_duplicate_request_while_busy_is_rejected(service: ConversationService, fakes):
    async def scenario():
        session_id = (await service.start_conversation()).session_id
        for answer in FIXED_ANSWERS:
            await service.respond_with_text(session_id, answer)

        release_model = threading.Event()
        original = fakes.llm._create

        def slow_create(**kwargs):
            release_model.wait(timeout=5)
            return original(**kwargs)

        fakes.llm.chat.completions.create = slow_create
        fakes.llm.queue(extraction_json())

        summary = asyncio.create_task(service.create_summary(session_id))
        await asyncio.sleep(0.05)

        with pytest.raises(ConversationBusyError):
            await service.create_summary(session_id)
        with pytest.raises(ConversationBusyError):
            await service.respond_with_text(session_id, "Another answer")
        with pytest.raises(ConversationBusyError):
            await service.confirm_and_generate(session_id)

        release_model.set()
        await summary
        # Only one Qwen call happened.
        assert len(fakes.llm.calls) == 1

    asyncio.run(scenario())


def test_cancel_while_summary_is_being_made(service: ConversationService, fakes, store):
    async def scenario():
        session_id = (await service.start_conversation()).session_id
        for answer in FIXED_ANSWERS:
            await service.respond_with_text(session_id, answer)

        release_model = threading.Event()
        original = fakes.llm._create

        def slow_create(**kwargs):
            release_model.wait(timeout=5)
            return original(**kwargs)

        fakes.llm.chat.completions.create = slow_create
        fakes.llm.queue(extraction_json())

        summary = asyncio.create_task(service.create_summary(session_id))
        await asyncio.sleep(0.05)

        service.cancel(session_id)
        release_model.set()

        with pytest.raises(InvalidConversationStateError):
            await summary

        state = store.get_conversation(session_id)
        assert state.status == ConversationStatus.CANCELLED
        assert state.project_details.initial_idea is None
        assert state.initial_summary_done is False

    asyncio.run(scenario())


def test_correction_after_summary_cancelled_mid_turn_is_discarded(service: ConversationService, fakes, store):
    async def scenario():
        session_id = (await service.start_conversation()).session_id
        for answer in FIXED_ANSWERS:
            await service.respond_with_text(session_id, answer)
        fakes.llm.queue(extraction_json())
        await service.create_summary(session_id)

        release_model = threading.Event()
        original = fakes.llm._create

        def slow_create(**kwargs):
            release_model.wait(timeout=5)
            return original(**kwargs)

        fakes.llm.chat.completions.create = slow_create
        fakes.llm.queue(decision_json(corrected_information={"deadline": "one month"}))

        turn = asyncio.create_task(service.respond_with_text(session_id, "Deadline is one month"))
        await asyncio.sleep(0.05)

        service.cancel(session_id)
        release_model.set()

        with pytest.raises(InvalidConversationStateError):
            await turn

        assert store.get_conversation(session_id).project_details.deadline == "ten days"

    asyncio.run(scenario())


def test_empty_readme_from_reasoning_falls_back_to_readme_tool(tmp_path, monkeypatch, store, fakes):
    # Seen with the real qwen2.5:7b: project_prompt was "" and the
    # Reasoning Layer saved an empty README file.
    import tools.readme_generator as readme_tool

    monkeypatch.setattr(readme_tool, "README_DIR", tmp_path / "fallback")

    original_reason = fakes.reasoning.reason

    def reason_with_empty_readme(project, user_message=None, conversation_history=None):
        result = original_reason(project, user_message, conversation_history)
        Path(result["readme_path"]).write_text("", encoding="utf-8")
        return result

    fakes.reasoning.reason = reason_with_empty_readme

    state = store.create_conversation()
    store.apply_extracted_information(
        state.session_id,
        ProjectDetails(initial_idea="Health band", preferred_technologies=["ESP32"], expected_outcome="A demo"),
    )
    generator = ProjectGenerator(fakes.perception, fakes.reasoning, fakes.diagram)

    result, _ = generator.generate(state)

    assert result.readme_markdown.startswith("# HealthBand")
    assert "ESP32" in result.readme_markdown
    assert "1. build" in result.readme_markdown
    assert result.readme_filename == "HealthBand.md"
    # README generation was explicitly requested from the Reasoning Layer.
    assert "README generation IS explicitly requested" in fakes.reasoning.calls[0]["user_message"]
