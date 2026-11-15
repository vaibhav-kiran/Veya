"""The user picks Qwen or Gemini for each voice conversation and chat."""

import asyncio
from types import SimpleNamespace

import pytest

from services.chat_manager import ChatPipeline, ChatService
from services.conversation_manager.conversation_service import ModelPipelines
from services.conversation_manager.conversation_state import ConversationStore
from services.conversation_manager.errors import ModelUnavailableError
from services.conversation_manager.project_generation import ProjectGenerator
from services.llm_providers import GEMINI, GeminiClient, use_model
from tests.conftest import FakeLanguage, FakeLLMClient, decision_json


@pytest.fixture
def gemini(fakes):
    return SimpleNamespace(llm=FakeLLMClient(), language=FakeLanguage())


@pytest.fixture
def two_model_chat(fakes, gemini, project_repository) -> ChatService:
    generator = ProjectGenerator(perception_pipeline=fakes.perception, reasoning_pipeline=fakes.reasoning, diagram_generator=fakes.diagram)
    return ChatService(
        store=ConversationStore(),
        language_pipeline=fakes.language,
        chat_pipeline=ChatPipeline(llm_client=fakes.llm, model_name="qwen-test"),
        project_generator=generator,
        project_repository=project_repository,
        other_models={
            GEMINI: ModelPipelines(
                language=gemini.language,
                conversation=ChatPipeline(llm_client=gemini.llm, model_name="gemini-test"),
                project_generator=generator,
            )
        },
    )


def reply(service, model):
    async def run():
        turn = await service.start_chat("Hindi", owner_id="u1", model=model)
        return await service.send_message(turn.session_id, "मुझे एक स्टडी प्लानर बनाना है")

    return asyncio.run(run())


def test_gemini_chat_uses_only_gemini(two_model_chat, fakes, gemini):
    gemini.llm.queue(decision_json(question_topic="target_users", response="Who is it for?"))

    turn = reply(two_model_chat, "gemini")

    assert gemini.llm.calls[0]["model"] == "gemini-test"
    assert fakes.llm.calls == []
    # Translation in both directions also went to Gemini.
    assert gemini.language.normalized and gemini.language.translated
    assert fakes.language.normalized == [] and fakes.language.translated == []
    assert turn.message == "[Hindi] Who is it for?"
    assert two_model_chat.store.get_conversation(turn.session_id).model_provider == "gemini"


def test_qwen_is_the_default(two_model_chat, fakes, gemini):
    fakes.llm.queue(decision_json(question_topic="target_users", response="Who is it for?"))

    reply(two_model_chat, "qwen")

    assert fakes.llm.calls and gemini.llm.calls == []


def test_gemini_without_a_key_is_refused(service):
    with pytest.raises(ModelUnavailableError):
        asyncio.run(service.start_conversation("English", model="gemini"))


def test_start_route_accepts_the_model_and_rejects_unknown_ones(client):
    headers = {"X-Veya-User": "u1"}

    assert client.post("/conversation/start", json={"model": "gemini"}, headers=headers).status_code == 503
    assert client.post("/chat/start", json={"model": "gemini"}, headers=headers).status_code == 503
    assert client.post("/conversation/start", json={"model": "gpt"}, headers=headers).status_code == 422
    assert client.post("/conversation/start", json={"model": "qwen"}, headers=headers).status_code == 200


# =========================================================
# GEMINI CLIENT
# =========================================================


def test_gemini_client_drops_ollama_settings_and_keeps_thinking_minimal():
    sent = FakeLLMClient(["ok"])
    client = GeminiClient("key", client=sent)

    client.chat.completions.create(model="gemini-flash-lite-latest", messages=[], max_tokens=600, extra_body={"options": {"num_ctx": 8192}})

    assert sent.calls == [{"model": "gemini-flash-lite-latest", "messages": [], "max_tokens": 600, "reasoning_effort": "minimal"}]


def test_thinking_gets_extra_room_in_max_tokens():
    sent = FakeLLMClient(["ok"])
    GeminiClient("key", reasoning_effort="low", client=sent).chat.completions.create(model="m", messages=[], max_tokens=600)

    assert sent.calls[0]["max_tokens"] > 600


def test_use_model_points_a_pipeline_at_gemini():
    pipeline = SimpleNamespace(client="ollama", model="qwen2.5:7b")

    use_model(pipeline, "gemini-client", "gemini-2.5-flash")

    assert (pipeline.client, pipeline.model) == ("gemini-client", "gemini-2.5-flash")


def test_translation_accepts_json_in_a_code_fence():
    from services.language_layer.language_pipeline import LanguagePipeline

    pipeline = use_model(LanguagePipeline(), FakeLLMClient(['```json\n{"content": {"response": "നമസ്കാരം"}}\n```']), "gemini-test")

    assert pipeline.translate_response({"response": "Hello"}, "Malayalam") == {"response": "നമസ്കാരം"}


def test_qwen_keeps_the_original_plan_structure_and_gemini_gets_the_detailed_one():
    from services.conversation_manager.project_generation import build_reasoning_request

    qwen = build_reasoning_request("BRIEF")
    gemini = build_reasoning_request("BRIEF", detailed=True)

    assert "## 7. Step-by-Step Implementation" in qwen
    assert "Implementation Plan" not in qwen and "### 7.2 Frontend" not in qwen
    for heading in ("## 7. Implementation Plan", "### 7.1 Project Structure", "### 7.2 Frontend", "### 7.3 Backend",
                    "### 7.4 Database and Data", "### 7.5 Hardware and Firmware", "### 7.7 Running and Deploying",
                    "## 8. Step-by-Step Build Order"):
        assert heading in gemini
    assert qwen.endswith("BRIEF") and gemini.endswith("BRIEF")


def test_only_the_gemini_generator_asks_for_the_detailed_plan():
    from services.conversation_manager.project_generation import ProjectGenerator
    from services.reasoning_layer.reasoning_pipeline import ReasoningPipeline

    assert ProjectGenerator(None, None, None).detailed_plan is False
    assert ReasoningPipeline.readme_max_tokens == 12000


# =========================================================
# GROQ CLIENT
# =========================================================


def test_groq_client_drops_ollama_settings_and_sets_reasoning_for_gpt_oss():
    from services.llm_providers import GroqClient

    sent = FakeLLMClient(["ok"])
    GroqClient("key", client=sent).chat.completions.create(
        model="openai/gpt-oss-120b", messages=[], max_tokens=600, extra_body={"options": {"num_ctx": 8192}}
    )

    call = sent.calls[0]
    assert "extra_body" not in call
    assert call["reasoning_effort"] == "low"
    assert call["max_tokens"] > 600  # room for its thinking


def test_groq_client_sends_no_reasoning_effort_to_other_models():
    from services.llm_providers import GroqClient

    sent = FakeLLMClient(["ok"])
    GroqClient("key", client=sent).chat.completions.create(model="qwen/qwen3.8-27b", messages=[], max_tokens=600)

    assert sent.calls == [{"model": "qwen/qwen3.8-27b", "messages": [], "max_tokens": 600}]


def test_groq_from_env(monkeypatch):
    from services.llm_providers import DEFAULT_GROQ_MODEL, groq_from_env

    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    assert groq_from_env() is None
    monkeypatch.setenv("GROQ_API_KEY", "gsk_test")
    monkeypatch.delenv("GROQ_MODEL", raising=False)
    assert groq_from_env()[1] == DEFAULT_GROQ_MODEL == "openai/gpt-oss-120b"


def test_groq_without_a_key_is_refused_with_its_own_message(service, client):
    with pytest.raises(ModelUnavailableError) as raised:
        asyncio.run(service.start_conversation("English", model="groq"))
    assert "GROQ_API_KEY" in raised.value.user_message

    response = client.post("/chat/start", json={"model": "groq"}, headers={"X-Veya-User": "u1"})
    assert response.status_code == 503 and "Groq" in response.json()["detail"]
