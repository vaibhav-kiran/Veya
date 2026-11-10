"""Checks for the changes that make each VEYA turn faster."""

import asyncio

import openai

from services.conversation_manager import conversation_service as service_module
from services.conversation_manager.conversation_prompts import (
    CONVERSATION_SYSTEM_PROMPT,
    EXAMPLE_TURNS,
    EXTRACTION_SYSTEM_PROMPT,
    build_extraction_messages,
)
from services.conversation_manager.conversation_service import TTS_SAMPLE_RATE, TTS_UNAVAILABLE_MESSAGE
from tests.conftest import FAKE_WAV


def test_greeting_audio_is_made_once_per_language(service, fakes):
    first = asyncio.run(service.start_conversation("English"))
    second = asyncio.run(service.start_conversation("English"))

    # Gnani TTS is called once; the second start reuses the audio.
    assert len(fakes.tts.calls) == 1
    assert second.audio_available is True
    assert service.get_latest_audio(second.session_id) == FAKE_WAV
    assert first.message == second.message
    # Sessions still get their own state.
    assert first.session_id != second.session_id


def test_greeting_cache_is_per_language(service, fakes):
    asyncio.run(service.start_conversation("English"))
    hindi = asyncio.run(service.start_conversation("Hindi"))

    assert len(fakes.tts.calls) == 2
    assert fakes.tts.calls[1]["language"] == "hi-IN"
    assert hindi.message.startswith("[Hindi]")


def test_failed_greeting_audio_is_not_cached(service, fakes):
    fakes.tts.error = ValueError("Gnani returned no audio")
    failed = asyncio.run(service.start_conversation("English"))
    assert failed.audio_available is False

    fakes.tts.error = None
    retried = asyncio.run(service.start_conversation("English"))

    assert retried.audio_available is True
    assert len(fakes.tts.calls) == 2


def test_tts_uses_faster_sample_rate(service, fakes):
    asyncio.run(service.start_conversation("English"))

    assert fakes.tts.calls[0]["sample_rate"] == TTS_SAMPLE_RATE == 24000


def test_slow_tts_falls_back_to_text(service, fakes, monkeypatch):
    monkeypatch.setattr(service_module, "TTS_TIMEOUT_SECONDS", 0.05)

    async def never_finishes(**kwargs):
        await asyncio.sleep(10)

    fakes.tts.synthesize = never_finishes

    response = asyncio.run(service.start_conversation("English"))

    assert response.audio_available is False
    assert response.audio_error == TTS_UNAVAILABLE_MESSAGE
    assert response.message  # the text is still shown


def test_warm_up_sends_the_same_prompt_start_as_the_summary_call(fakes, pipeline):
    fakes.llm.queue("x")

    pipeline.warm_up()

    call = fakes.llm.calls[0]
    assert call["max_tokens"] == 1
    # Same instructions and example as the first real Qwen call (the
    # summary), so Ollama can reuse them.
    real_messages = build_extraction_messages([("q", "a")])
    assert call["messages"][:3] == real_messages[:3]
    assert call["messages"][0]["content"] == EXTRACTION_SYSTEM_PROMPT


def test_warm_up_failure_does_not_crash(fakes, pipeline):
    fakes.llm.queue(openai.APIConnectionError(request=None))

    pipeline.warm_up()  # only logs a warning


def test_prompt_no_longer_asks_for_unused_long_fields():
    # missing_information and next_question were long and unused.
    assert '"missing_information"' not in CONVERSATION_SYSTEM_PROMPT
    assert '"next_question"' not in CONVERSATION_SYSTEM_PROMPT
    for _, example in EXAMPLE_TURNS:
        assert "missing_information" not in example
        assert "next_question" not in example
