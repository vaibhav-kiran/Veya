"""
Text chat: the model leads from the first message (no fixed questions),
nothing is spoken, and confirmation generates and saves the project.
"""

from services.chat_manager.chat_prompts import CHAT_OPENING_MESSAGE, CHAT_SYSTEM_PROMPT
from services.conversation_manager.conversation_prompts import TIMELINE_QUESTION
from tests.conftest import decision_json

USER = {"X-Veya-User": "user_chat"}


def start(client) -> str:
    response = client.post("/chat/start", json={"preferred_language": "English"}, headers=USER)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["message"] == CHAT_OPENING_MESSAGE
    assert body["status"] == "collecting_information"
    return body["session_id"]


def send(client, session_id: str, text: str) -> dict:
    response = client.post(f"/chat/{session_id}/message", json={"text": text})
    assert response.status_code == 200, response.text
    return response.json()


def test_first_message_goes_to_the_model_not_a_fixed_question(client, fakes):
    session_id = start(client)
    fakes.llm.queue(decision_json(
        extracted_information={"initial_idea": "A study planner app"},
        question_topic="target_users",
        response="A study planner sounds useful! Who is it for?",
    ))

    reply = send(client, session_id, "I want to build a study planner app")

    assert reply["message"] == "A study planner sounds useful! Who is it for?"
    assert reply["message"] != TIMELINE_QUESTION
    assert reply["project_details"]["initial_idea"] == "A study planner app"
    # The chat prompt is used, and nothing is spoken.
    assert fakes.llm.calls[0]["messages"][0]["content"] == CHAT_SYSTEM_PROMPT
    assert fakes.tts.calls == []
    assert fakes.stt.calls == []


def test_chat_summary_confirmation_and_saved_project(client, fakes):
    session_id = start(client)
    fakes.llm.queue(
        decision_json(
            extracted_information={"initial_idea": "Health band", "target_users": ["Elderly people"]},
            next_action="request_confirmation",
            question_topic=None,
            ready_for_confirmation=True,
            response="Here's what I have so far.",
        ),
        decision_json(next_action="generate_project", question_topic=None, response=""),
    )

    summary = send(client, session_id, "A health band for elderly people")
    assert summary["status"] == "awaiting_confirmation"

    agreed = send(client, session_id, "Yes, build it")
    assert agreed["status"] == "ready_to_generate"

    confirmed = client.post(f"/chat/{session_id}/confirm")
    assert confirmed.status_code == 200, confirmed.text
    project_id = confirmed.json()["project_id"]
    assert project_id
    assert client.get(f"/projects/{project_id}", headers=USER).json()["title"] == "HealthBand"


def test_chat_and_voice_sessions_are_separate(client):
    session_id = start(client)
    assert client.get(f"/conversation/{session_id}").status_code == 404
    assert client.get(f"/chat/{session_id}").status_code == 200


def test_cancel_chat(client):
    session_id = start(client)
    assert client.post(f"/chat/{session_id}/cancel").json()["status"] == "cancelled"
    assert client.post(f"/chat/{session_id}/message", json={"text": "hello"}).status_code == 409


def test_empty_message_is_rejected(client):
    session_id = start(client)
    assert client.post(f"/chat/{session_id}/message", json={"text": ""}).status_code == 422
