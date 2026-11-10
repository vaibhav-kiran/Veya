from services.conversation_manager.conversation_state import ConversationStore
from services.conversation_manager.conversation_summary import (
    as_phrase,
    build_confirmation_summary,
    join_naturally,
)
from services.conversation_manager.schemas import ProjectDetails


def test_join_naturally():
    assert join_naturally([]) == ""
    assert join_naturally(["Python"]) == "Python"
    assert join_naturally(["Python", "Flutter"]) == "Python and Flutter"
    assert join_naturally(["A", "B", "C"]) == "A, B and C"


def test_as_phrase_keeps_acronyms():
    assert as_phrase("A medicine reminder app.") == "a medicine reminder app"
    assert as_phrase("Medicine reminder") == "medicine reminder"
    assert as_phrase("AI healthcare app") == "AI healthcare app"
    assert as_phrase("ESP32 band") == "ESP32 band"


def test_summary_mentions_only_known_details():
    store = ConversationStore()
    state = store.create_conversation()
    store.apply_extracted_information(
        state.session_id,
        ProjectDetails(
            initial_idea="A wearable health monitor",
            project_type="hackathon",
            available_time="10 days",
            technical_skills=["Python", "ESP32"],
            recommendations_requested=["technologies", "ai_models"],
            veya_recommendations=["A pulse sensor"],
        ),
    )

    summary = build_confirmation_summary(state)

    assert "a wearable health monitor" in summary
    assert "for a hackathon" in summary
    assert "Time available: 10 days" in summary
    assert "You already know Python and ESP32" in summary
    assert "recommend technologies and AI models" in summary
    # Suggestions are clearly not presented as the user's decisions.
    assert "I suggested A pulse sensor, but those are only suggestions" in summary
    # Nothing is said about information the user never gave.
    assert "budget" not in summary.lower()
    assert "deadline" not in summary.lower()
    assert summary.endswith("?")
