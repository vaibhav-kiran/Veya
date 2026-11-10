import httpx

from services.conversation_manager.conversation_prompts import (
    GOT_IT_MESSAGE,
    OPENING_MESSAGE,
    TECHNOLOGY_QUESTION,
    TIMELINE_QUESTION,
)
from services.conversation_manager.schemas import ConversationStatus
from tests.conftest import (
    FAKE_WAV,
    FIXED_ANSWERS,
    decision_json,
    extraction_json,
    make_wav_bytes,
    requires_ffmpeg,
)

MISSING_SESSION = "x" * 43


def start(client, language: str = "English") -> dict:
    response = client.post("/conversation/start", json={"preferred_language": language})
    assert response.status_code == 200, response.text
    return response.json()


def answer_fixed_questions(client, session_id: str, answers: list[str] = FIXED_ANSWERS) -> list[dict]:
    """Answer VEYA's three fixed questions with typed text."""

    replies = []
    for answer in answers:
        response = client.post(f"/conversation/{session_id}/respond", data={"text": answer})
        assert response.status_code == 200, response.text
        replies.append(response.json())
    return replies


def move_to_confirmation(client, fakes, session_id: str) -> None:
    answer_fixed_questions(client, session_id)
    fakes.llm.queue(extraction_json())
    response = client.post(f"/conversation/{session_id}/summary")
    assert response.json()["status"] == "awaiting_confirmation"


# =========================================================
# START / GET
# =========================================================


def test_start_conversation(client, fakes):
    data = start(client)

    assert data["status"] == "collecting_information"
    assert data["message"] == OPENING_MESSAGE
    assert data["audio_available"] is True
    assert fakes.tts.calls[0]["text"] == OPENING_MESSAGE
    assert fakes.tts.calls[0]["language"] == "en-IN"


def test_start_without_body_defaults_to_english(client):
    response = client.post("/conversation/start")
    assert response.status_code == 200
    assert response.json()["status"] == "collecting_information"


def test_start_rejects_unsupported_language(client):
    response = client.post("/conversation/start", json={"preferred_language": "Klingon"})
    assert response.status_code == 422


def test_start_in_hindi_translates_and_speaks_hindi(client, fakes):
    data = start(client, "hindi")

    assert data["message"].startswith("[Hindi]")
    assert fakes.tts.calls[0]["language"] == "hi-IN"


def test_audio_endpoint_returns_latest_reply(client):
    session_id = start(client)["session_id"]

    response = client.get(f"/conversation/{session_id}/audio")

    assert response.status_code == 200
    assert response.headers["content-type"] == "audio/wav"
    assert response.content == FAKE_WAV


def test_get_conversation_state(client, fakes):
    session_id = start(client)["session_id"]
    client.post(f"/conversation/{session_id}/respond", data={"text": "A plant disease app"})

    data = client.get(f"/conversation/{session_id}").json()

    assert data["status"] == "collecting_information"
    assert [message["role"] for message in data["messages"]] == ["assistant", "user", "assistant"]
    assert data["messages"][1]["text"] == "A plant disease app"
    # Internal data is never exposed.
    assert "latest_audio" not in data
    assert "english_text" not in data["messages"][0]


def test_missing_session_returns_404(client):
    assert client.get(f"/conversation/{MISSING_SESSION}").status_code == 404
    response = client.post(f"/conversation/{MISSING_SESSION}/respond", data={"text": "hi"})
    assert response.status_code == 404
    assert "start a new one" in response.json()["detail"]


def test_malformed_session_id_is_rejected(client):
    assert client.get("/conversation/short").status_code == 422
    assert client.get("/conversation/" + "a" * 30 + "!").status_code in (404, 422)


# =========================================================
# RESPOND
# =========================================================


@requires_ffmpeg
def test_respond_with_audio_uses_stt(client, fakes):
    session_id = start(client)["session_id"]

    response = client.post(
        f"/conversation/{session_id}/respond",
        files={"audio_file": ("recording.wav", make_wav_bytes(), "audio/wav")},
    )

    assert response.status_code == 200, response.text
    data = response.json()
    assert data["transcript"] == "I want to build a wearable health monitor."
    assert data["detected_language"] == "en-IN"
    # The next fixed question comes straight away, without Qwen.
    assert data["message"] == TIMELINE_QUESTION
    assert fakes.llm.calls == []
    # STT received a converted WAV file with the existing language setting.
    assert fakes.stt.calls[0]["file_existed"] is True
    assert fakes.stt.calls[0]["header"] == b"RIFF"
    assert fakes.stt.calls[0]["language_code"] == "indic-auto"
    # English speech is not sent through translation.
    assert fakes.language.normalized == []


def test_respond_requires_exactly_one_input(client):
    session_id = start(client)["session_id"]

    assert client.post(f"/conversation/{session_id}/respond").status_code == 422
    both = client.post(
        f"/conversation/{session_id}/respond",
        data={"text": "hi"},
        files={"audio_file": ("a.wav", make_wav_bytes(), "audio/wav")},
    )
    assert both.status_code == 422


def test_empty_recording_is_rejected(client):
    session_id = start(client)["session_id"]

    response = client.post(
        f"/conversation/{session_id}/respond",
        files={"audio_file": ("recording.webm", b"", "audio/webm")},
    )

    assert response.status_code == 400


def test_non_audio_upload_is_rejected(client):
    session_id = start(client)["session_id"]

    response = client.post(
        f"/conversation/{session_id}/respond",
        files={"audio_file": ("notes.txt", b"hello", "text/plain")},
    )

    assert response.status_code == 400
    assert "audio" in response.json()["detail"].lower()


@requires_ffmpeg
def test_corrupt_audio_is_rejected(client):
    session_id = start(client)["session_id"]

    response = client.post(
        f"/conversation/{session_id}/respond",
        files={"audio_file": ("recording.webm", b"this is not audio", "audio/webm")},
    )

    assert response.status_code == 400


@requires_ffmpeg
def test_empty_transcript_returns_422(client, fakes):
    session_id = start(client)["session_id"]
    fakes.stt.result["transcription"] = "   "

    response = client.post(
        f"/conversation/{session_id}/respond",
        files={"audio_file": ("recording.wav", make_wav_bytes(), "audio/wav")},
    )

    assert response.status_code == 422
    assert "couldn't hear" in response.json()["detail"]
    # No model call and no change to the conversation.
    assert fakes.llm.calls == []


@requires_ffmpeg
def test_stt_failure_returns_502_and_keeps_state(client, fakes):
    session_id = start(client)["session_id"]
    fakes.stt.result = {"success": False, "transcription": None, "language": None, "error": "401 Unauthorized"}

    response = client.post(
        f"/conversation/{session_id}/respond",
        files={"audio_file": ("recording.wav", make_wav_bytes(), "audio/wav")},
    )

    assert response.status_code == 502
    assert "401" not in response.json()["detail"]
    state = client.get(f"/conversation/{session_id}").json()
    assert state["status"] == "collecting_information"
    assert len(state["messages"]) == 1


def test_qwen_failure_returns_503_keeps_answers_and_can_retry(client, fakes):
    session_id = start(client)["session_id"]
    answer_fixed_questions(client, session_id)
    fakes.llm.queue("broken", "broken", "broken")

    failed = client.post(f"/conversation/{session_id}/summary")

    assert failed.status_code == 503
    state = client.get(f"/conversation/{session_id}").json()
    assert state["status"] == "collecting_information"
    assert state["project_details"]["initial_idea"] is None
    # 1 opening + 3 answers + 3 VEYA lines; nothing was lost.
    assert len(state["messages"]) == 7

    fakes.llm.queue(extraction_json())
    retried = client.post(f"/conversation/{session_id}/summary")

    assert retried.status_code == 200
    assert retried.json()["status"] == "awaiting_confirmation"


def test_tts_failure_still_returns_text(client, fakes):
    session_id = start(client)["session_id"]
    fakes.tts.error = httpx.ConnectError("Gnani is down")
    fakes.llm.queue(decision_json())

    response = client.post(f"/conversation/{session_id}/respond", data={"text": "A plant app"})

    assert response.status_code == 200
    data = response.json()
    assert data["audio_available"] is False
    assert "shown as text" in data["audio_error"]
    assert client.get(f"/conversation/{session_id}/audio").status_code == 404


def test_invalid_tts_audio_is_not_played(client, fakes):
    fakes.tts.audio = b"<html>error</html>"

    data = start(client)

    assert data["audio_available"] is False


# =========================================================
# CONFIRM / CANCEL
# =========================================================


def test_confirm_before_summary_is_rejected(client, fakes):
    session_id = start(client)["session_id"]

    response = client.post(f"/conversation/{session_id}/confirm")

    assert response.status_code == 409
    assert fakes.perception.inputs == []


def test_confirm_conversation_generates_project(client, fakes):
    session_id = start(client)["session_id"]
    move_to_confirmation(client, fakes, session_id)

    response = client.post(f"/conversation/{session_id}/confirm")

    assert response.status_code == 200, response.text
    data = response.json()
    assert data["status"] == "completed"
    assert data["result"]["project_name"] == "HealthBand"
    assert data["result"]["readme_markdown"].startswith("# HealthBand")
    assert data["result"]["workflow_diagram"].startswith("flowchart")
    assert data["result"]["image_generation_available"] is True
    # Stable Diffusion is never triggered automatically.
    assert fakes.image.calls == []


def test_double_confirm_does_not_generate_twice(client, fakes):
    session_id = start(client)["session_id"]
    move_to_confirmation(client, fakes, session_id)

    first = client.post(f"/conversation/{session_id}/confirm")
    second = client.post(f"/conversation/{session_id}/confirm")

    assert first.status_code == 200
    assert second.status_code == 200
    assert second.json()["result"] == first.json()["result"]
    assert len(fakes.reasoning.calls) == 1


def test_generation_failure_keeps_answers_and_allows_retry(client, fakes):
    session_id = start(client)["session_id"]
    move_to_confirmation(client, fakes, session_id)
    fakes.reasoning.error = RuntimeError("Ollama crashed")

    failed = client.post(f"/conversation/{session_id}/confirm")

    assert failed.status_code == 502
    assert "Ollama crashed" not in failed.json()["detail"]
    state = client.get(f"/conversation/{session_id}").json()
    assert state["status"] == "error"
    assert state["project_details"]["initial_idea"] == "Health band"

    fakes.reasoning.error = None
    retried = client.post(f"/conversation/{session_id}/confirm")
    assert retried.status_code == 200
    assert retried.json()["status"] == "completed"


def test_cancel_conversation(client, fakes):
    session_id = start(client)["session_id"]

    response = client.post(f"/conversation/{session_id}/cancel")

    assert response.status_code == 200
    assert response.json()["status"] == ConversationStatus.CANCELLED.value
    assert client.get(f"/conversation/{session_id}/audio").status_code == 404


def test_answer_after_cancel_is_rejected(client, fakes):
    session_id = start(client)["session_id"]
    client.post(f"/conversation/{session_id}/cancel")

    response = client.post(f"/conversation/{session_id}/respond", data={"text": "hello?"})

    assert response.status_code == 409
    assert fakes.llm.calls == []


def test_image_generation_only_on_request(client, fakes):
    session_id = start(client)["session_id"]
    assert client.post(f"/conversation/{session_id}/generate-image").status_code == 409

    move_to_confirmation(client, fakes, session_id)
    client.post(f"/conversation/{session_id}/confirm")
    assert fakes.image.calls == []

    response = client.post(f"/conversation/{session_id}/generate-image")

    assert response.status_code == 200
    assert response.json()["image_url"] == "/generated_images/HealthBand.png"
    assert fakes.image.calls[0]["project_name"] == "HealthBand"


# =========================================================
# THREE FIXED QUESTIONS AND THE SUMMARY
# =========================================================


def test_three_fixed_questions_then_got_it_without_qwen(client, fakes):
    session_id = start(client)["session_id"]

    replies = answer_fixed_questions(client, session_id)

    assert [reply["message"] for reply in replies] == [TIMELINE_QUESTION, TECHNOLOGY_QUESTION, GOT_IT_MESSAGE]
    assert [reply["next_action"] for reply in replies] == ["ask_question", "ask_question", "summarise"]
    assert [reply["summary_pending"] for reply in replies] == [False, False, True]
    assert all(reply["status"] == "collecting_information" for reply in replies)
    # No Qwen call and no translation until the summary.
    assert fakes.llm.calls == []
    assert fakes.language.normalized == []


def test_fixed_lines_are_voiced_once_and_reused(client, fakes):
    first_session = start(client)["session_id"]
    answer_fixed_questions(client, first_session)
    calls_for_first_conversation = len(fakes.tts.calls)

    second_session = start(client)["session_id"]
    replies = answer_fixed_questions(client, second_session)

    # Opening, 2 questions and "got it" were all reused from the cache.
    assert calls_for_first_conversation == 4
    assert len(fakes.tts.calls) == 4
    assert all(reply["audio_available"] for reply in replies)


def test_summary_reads_all_answers_in_one_qwen_call(client, fakes):
    session_id = start(client)["session_id"]
    answer_fixed_questions(client, session_id)
    fakes.llm.queue(extraction_json(
        {"initial_idea": "A wearable health monitor", "project_type": "hackathon", "deadline": "ten days",
         "preferred_technologies": ["Python"], "recommendations_requested": ["technologies"]},
    ))

    response = client.post(f"/conversation/{session_id}/summary")

    assert response.status_code == 200, response.text
    data = response.json()
    assert len(fakes.llm.calls) == 1
    prompt = fakes.llm.last_user_prompt()
    for answer in FIXED_ANSWERS:
        assert answer in prompt
    assert data["status"] == "awaiting_confirmation"
    assert data["summary_pending"] is False
    assert "a wearable health monitor" in data["message"]
    assert "You'd like me to recommend technologies" in data["message"]
    assert data["message"].endswith("?")
    # The spoken summary is exactly the displayed summary.
    assert fakes.tts.calls[-1]["text"] == data["message"]


def test_summary_keeps_the_users_idea_if_qwen_leaves_it_out(client, fakes):
    session_id = start(client)["session_id"]
    answer_fixed_questions(client, session_id)
    fakes.llm.queue(extraction_json({"deadline": "ten days"}))

    data = client.post(f"/conversation/{session_id}/summary").json()

    assert data["project_details"]["initial_idea"] == FIXED_ANSWERS[0]


def test_unsure_answers_are_recorded_as_skipped(client, fakes):
    session_id = start(client)["session_id"]
    answer_fixed_questions(client, session_id, ["A plant app", "I don't know yet", "Python"])
    fakes.llm.queue(extraction_json({"initial_idea": "A plant app"}, skipped_fields=["deadline"]))

    data = client.post(f"/conversation/{session_id}/summary").json()

    assert data["skipped_fields"] == ["deadline"]
    assert "not sure yet about the deadline" in data["message"]


def test_summary_before_three_answers_is_rejected(client, fakes):
    session_id = start(client)["session_id"]
    answer_fixed_questions(client, session_id, FIXED_ANSWERS[:2])

    response = client.post(f"/conversation/{session_id}/summary")

    assert response.status_code == 409
    assert fakes.llm.calls == []


def test_summary_is_made_only_once(client, fakes):
    session_id = start(client)["session_id"]
    move_to_confirmation(client, fakes, session_id)

    response = client.post(f"/conversation/{session_id}/summary")

    assert response.status_code == 409
    assert len(fakes.llm.calls) == 1


def test_answer_while_summary_is_pending_is_rejected(client, fakes):
    session_id = start(client)["session_id"]
    answer_fixed_questions(client, session_id)

    response = client.post(f"/conversation/{session_id}/respond", data={"text": "One more thing"})

    assert response.status_code == 409
    assert "putting your answers together" in response.json()["detail"]


def test_correction_after_summary_uses_qwen_and_resummarises(client, fakes):
    session_id = start(client)["session_id"]
    move_to_confirmation(client, fakes, session_id)
    fakes.llm.queue(decision_json(
        next_action="request_confirmation",
        corrected_information={"deadline": "one month"},
        response="",
    ))

    data = client.post(f"/conversation/{session_id}/respond", data={"text": "The deadline is one month"}).json()

    assert data["status"] == "awaiting_confirmation"
    assert data["project_details"]["deadline"] == "one month"
    assert "deadline of one month" in data["message"]


def test_summary_for_missing_session_returns_404(client):
    assert client.post(f"/conversation/{MISSING_SESSION}/summary").status_code == 404


def test_returning_user_gets_a_short_greeting(client, fakes):
    from services.conversation_manager.conversation_prompts import RETURNING_OPENING_MESSAGE

    response = client.post("/conversation/start", json={"preferred_language": "English", "returning_user": True})
    assert response.status_code == 200, response.text
    assert response.json()["message"] == RETURNING_OPENING_MESSAGE
    assert fakes.tts.calls[-1]["text"] == RETURNING_OPENING_MESSAGE
    # Then a differently worded timeline question, and a different technology question.
    from services.conversation_manager.conversation_prompts import (
        RETURNING_TECHNOLOGY_QUESTIONS,
        RETURNING_TIMELINE_QUESTIONS,
    )

    session_id = response.json()["session_id"]
    timeline = client.post(f"/conversation/{session_id}/respond", data={"text": "A plant watering robot"}).json()
    assert timeline["message"] in RETURNING_TIMELINE_QUESTIONS
    technology = client.post(f"/conversation/{session_id}/respond", data={"text": "Two weeks"}).json()
    assert technology["message"] in RETURNING_TECHNOLOGY_QUESTIONS
    client.post(f"/conversation/{session_id}/respond", data={"text": "Python please"})

    # The answers are stored against the question actually asked, for the summary step.
    state = client.app.state.conversation_service.store.get_conversation(session_id)
    assert [answer.question for answer in state.fixed_answers] == state.fixed_questions
    assert state.fixed_questions[1] == timeline["message"]


def test_first_time_user_hears_the_original_questions(client):
    session_id = client.post("/conversation/start", json={}).json()["session_id"]
    reply = client.post(f"/conversation/{session_id}/respond", data={"text": "A plant watering robot"}).json()
    assert reply["message"] == TIMELINE_QUESTION


def test_playlist_upload_is_not_given_to_ffmpeg_as_a_playlist(client, fakes):
    """An HLS playlist disguised as an upload must never be read as a playlist (SSRF / local file read)."""

    session_id = client.post("/conversation/start", json={}).json()["session_id"]
    playlist = b"#EXTM3U\n#EXT-X-MEDIA-SEQUENCE:0\n#EXTINF:10.0,\nfile:///etc/passwd\n#EXT-X-ENDLIST\n"
    response = client.post(
        f"/conversation/{session_id}/respond",
        files={"audio_file": ("evil.m3u8", playlist, "audio/x-mpegurl")},
    )
    assert response.status_code == 400
    assert fakes.stt.calls == []


def test_supported_audio_types():
    from pathlib import Path

    from services.speech_to_text.audio_conversion import is_supported_audio

    assert is_supported_audio(Path("a.m4a")) and is_supported_audio(Path("a.WEBM"))
    assert not is_supported_audio(Path("a.m3u8")) and not is_supported_audio(Path("a.txt"))
