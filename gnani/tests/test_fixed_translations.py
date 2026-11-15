"""VEYA's fixed lines use hand-written translations, not the model."""

import asyncio

from services.conversation_manager.conversation_prompts import GOT_IT_MESSAGE, OPENING_MESSAGE
from services.conversation_manager.schemas import SUPPORTED_OUTPUT_LANGUAGES
from services.language_layer.fixed_translations import FIXED_LINES, TRANSLATIONS, fixed_translation
from tests.test_conversation_api import FIXED_ANSWERS

NON_ENGLISH = [language for language in SUPPORTED_OUTPUT_LANGUAGES if language != "English"]


def test_every_fixed_line_is_translated_into_every_language():
    assert sorted(TRANSLATIONS) == sorted(NON_ENGLISH)
    for language in NON_ENGLISH:
        missing = [line for line in FIXED_LINES if not TRANSLATIONS[language].get(line, "").strip()]
        assert missing == [], f"{language} is missing: {missing}"
        # A line left in English would mean it was forgotten.
        assert all(TRANSLATIONS[language][line] != line for line in FIXED_LINES)


def test_lookup_ignores_case_and_spaces():
    assert fixed_translation(f" {OPENING_MESSAGE} ", "malayalam") == TRANSLATIONS["Malayalam"][OPENING_MESSAGE]
    assert fixed_translation("Something the model wrote.", "Malayalam") is None
    assert fixed_translation(OPENING_MESSAGE, "Klingon") is None


def test_voice_conversation_uses_the_written_lines(service, fakes):
    async def run():
        turn = await service.start_conversation("Malayalam")
        for answer in FIXED_ANSWERS:
            last = await service.respond_with_text(turn.session_id, answer)
        return turn, last

    opening, last = asyncio.run(run())

    assert opening.message == TRANSLATIONS["Malayalam"][OPENING_MESSAGE]
    assert last.message == TRANSLATIONS["Malayalam"][GOT_IT_MESSAGE]
    # None of the fixed lines went to the model.
    assert not any(result.get("response") in FIXED_LINES for result, _ in fakes.language.translated)
