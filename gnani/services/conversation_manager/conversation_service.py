"""
ConversationService coordinates a VEYA conversation:

  1. Three fixed questions (idea, timeline, technologies):
         audio -> Gnani STT -> transcript is stored -> next fixed question
     No Qwen call, so VEYA answers as soon as the transcript is ready.

  2. After the third answer VEYA says "Okay, got it..." and create_summary()
     sends all three answers to Qwen ONCE, then reads back the summary.

  3. After the summary, each answer (a correction, "yes" or a question):
         audio -> Gnani STT -> Language Layer (to English)
               -> Qwen decision -> state update
               -> Language Layer (to preferred language) -> Gnani TTS -> audio

and, after confirmation, the existing Perception + Reasoning workflow.

It reuses the existing STT, TTS, Language, Perception and Reasoning
objects that are passed in. It does not talk to any API directly.
"""

import asyncio
import logging
import tempfile
from pathlib import Path
from typing import TYPE_CHECKING, Any, Optional

import httpx

from services.conversation_manager.conversation_pipeline import ConversationPipeline
from services.conversation_manager.conversation_prompts import (
    FIXED_QUESTIONS,
    GOT_IT_MESSAGE,
    fixed_questions_for,
)
from services.conversation_manager.conversation_state import ConversationStore
from services.conversation_manager.conversation_summary import build_confirmation_summary
from services.conversation_manager.errors import (
    ConversationBusyError,
    PlanLimitError,
    EmptyTranscriptError,
    ImageGenerationError,
    InvalidAudioError,
    InvalidConversationStateError,
    LanguageModelError,
    ProjectGenerationError,
    SpeechRecognitionError,
)
from services.conversation_manager.project_generation import ProjectGenerator
from services.conversation_manager.schemas import (
    SUPPORTED_OUTPUT_LANGUAGES,
    CancelConversationResponse,
    ConfirmConversationResponse,
    ConversationAction,
    ConversationMessage,
    ConversationState,
    ConversationStateResponse,
    ConversationStatus,
    ConversationTurnResponse,
    FixedAnswer,
    GenerateImageResponse,
    ProjectDetails,
    PublicMessage,
)
from services.plans import PlanResolver, plan_config
from services.speech_to_text.audio_conversion import AUDIO_DEMUXERS, AudioConversionError, convert_to_wav

if TYPE_CHECKING:
    from services.project_store import ProjectRepository

logger = logging.getLogger(__name__)

MAX_AUDIO_BYTES = 15 * 1024 * 1024  # 15 MB is several minutes of speech.
MAX_TEXT_ANSWER_LENGTH = 4000

# Browsers label MediaRecorder output differently; these are all fine.
ACCEPTED_AUDIO_CONTENT_TYPES = ("audio/", "video/webm", "application/octet-stream")

TTS_UNAVAILABLE_MESSAGE = "Voice playback is unavailable right now, so the reply is shown as text."

# Gnani generates 24 kHz speech noticeably faster than 48 kHz (measured
# about 3.4 s vs 4.1 s per reply) and it is still clear for a voice.
TTS_SAMPLE_RATE = 24000

# Gnani TTS sometimes stalls for a minute. After this many seconds the
# reply is shown as text instead of making the user wait.
TTS_TIMEOUT_SECONDS = 20

ENGLISH_NAMES = ("english", "en", "en-in", "en-us")


class ConversationService:

    def __init__(
        self,
        store: ConversationStore,
        stt_pipeline: Any,
        tts_pipeline: Any,
        language_pipeline: Any,
        conversation_pipeline: ConversationPipeline,
        project_generator: ProjectGenerator,
        image_generator: Any = None,
        tts_voice: str = "Nalini",
        project_repository: Optional["ProjectRepository"] = None,
        plan_resolver: Optional[PlanResolver] = None,
    ):
        self.store = store
        self.stt_pipeline = stt_pipeline
        self.tts_pipeline = tts_pipeline
        self.language_pipeline = language_pipeline
        self.conversation_pipeline = conversation_pipeline
        self.project_generator = project_generator
        self.image_generator = image_generator
        self.tts_voice = tts_voice
        self.project_repository = project_repository
        self.plan_resolver = plan_resolver or PlanResolver()

        # The fixed lines (the three questions and "Okay, got it") are the
        # same for everyone, so their translated text and audio are made
        # once per language and reused.
        # (language name, English text) -> (text for the user, WAV audio)
        self._fixed_line_cache: dict[tuple[str, str], tuple[str, bytes]] = {}

    # =====================================================
    # START
    # =====================================================

    async def start_conversation(
        self,
        preferred_language: str = "English",
        owner_id: Optional[str] = None,
        returning_user: bool = False,
    ) -> ConversationTurnResponse:
        state = self.store.create_conversation(preferred_language)
        state.owner_id = owner_id
        state.plan = self.plan_resolver.plan_for(owner_id).value
        self.store.set_status(state.session_id, ConversationStatus.COLLECTING_INFORMATION)

        # The opening message is also the first fixed question (the idea).
        # Returning users get a short greeting and differently worded questions,
        # so a second conversation doesn't sound like a replay. Same topics, same order.
        state.fixed_questions = fixed_questions_for(returning_user)
        opening_text, audio_error = await self._say_fixed_line(state, state.fixed_questions[0], message_type="greeting")

        return self._turn_response(
            state,
            message=opening_text,
            next_action=ConversationAction.ASK_QUESTION,
            audio_error=audio_error,
        )

    # =====================================================
    # USER TURNS
    # =====================================================

    async def respond_with_audio(
        self,
        session_id: str,
        audio_bytes: bytes,
        filename: Optional[str],
        content_type: Optional[str],
    ) -> ConversationTurnResponse:
        self._validate_audio(audio_bytes, content_type)

        async with self._exclusive_access(session_id):
            self.store.ensure_can_answer(session_id)
            transcript, detected_language = await self._transcribe(audio_bytes, filename)
            return await self._process_user_message(session_id, transcript, detected_language)

    async def respond_with_text(self, session_id: str, text: str) -> ConversationTurnResponse:
        text = (text or "").strip()
        if not text:
            raise EmptyTranscriptError("Please type an answer before sending.")
        if len(text) > MAX_TEXT_ANSWER_LENGTH:
            raise InvalidConversationStateError(
                f"Please keep your answer under {MAX_TEXT_ANSWER_LENGTH} characters."
            )

        async with self._exclusive_access(session_id):
            self.store.ensure_can_answer(session_id)
            return await self._process_user_message(session_id, text, detected_language=None)

    async def _process_user_message(
        self,
        session_id: str,
        user_text: str,
        detected_language: Optional[str],
    ) -> ConversationTurnResponse:
        state = self.store.get_conversation(session_id)

        # ---- phase 1: the three fixed questions (no Qwen call) ----
        if len(state.fixed_answers) < len(self._questions(state)):
            return await self._record_fixed_answer(state, user_text, detected_language)

        # ---- phase 2: waiting for the first summary ----
        if not state.initial_summary_done:
            raise InvalidConversationStateError(
                "VEYA is still putting your answers together. Please wait a moment."
            )

        # ---- phase 3: after the summary (corrections, "yes", questions) ----
        english_text = await self._to_english(user_text, detected_language)

        decision = await asyncio.to_thread(
            self.conversation_pipeline.decide_next_step, state, english_text
        )

        # The user may have pressed Cancel while Qwen was thinking.
        if state.status == ConversationStatus.CANCELLED:
            raise InvalidConversationStateError("This conversation was cancelled.")

        self.store.add_message(
            session_id,
            ConversationMessage(
                role="user",
                text=user_text,
                english_text=english_text,
                language=detected_language,
                message_type="answer",
            ),
        )

        action, english_reply = self.conversation_pipeline.apply_decision(self.store, session_id, decision)

        reply_text = await self._translate_for_user(english_reply, state.preferred_language)
        self.store.add_message(
            session_id,
            ConversationMessage(
                role="assistant",
                text=reply_text,
                english_text=english_reply,
                language=state.preferred_language,
                message_type=action.value,
            ),
        )

        audio_error = await self._speak(state, reply_text)

        return self._turn_response(
            state,
            message=reply_text,
            next_action=action,
            transcript=user_text,
            detected_language=detected_language,
            audio_error=audio_error,
        )

    async def _record_fixed_answer(
        self,
        state: ConversationState,
        user_text: str,
        detected_language: Optional[str],
    ) -> ConversationTurnResponse:
        """
        Save the answer to the current fixed question and ask the next one.

        Nothing is sent to Qwen here, so VEYA replies as soon as the
        transcript is ready. Translation to English also waits until the
        summary step.
        """

        question_number = len(state.fixed_answers)
        session_id = state.session_id

        self.store.add_message(
            session_id,
            ConversationMessage(role="user", text=user_text, language=detected_language, message_type="answer"),
        )
        self.store.add_fixed_answer(
            session_id,
            FixedAnswer(question=self._questions(state)[question_number], answer=user_text, language=detected_language),
        )

        all_questions_answered = len(state.fixed_answers) == len(self._questions(state))

        if all_questions_answered:
            reply_text, audio_error = await self._say_fixed_line(state, GOT_IT_MESSAGE, message_type="summarise")
            next_action = ConversationAction.SUMMARISE
        else:
            next_question = self._questions(state)[len(state.fixed_answers)]
            reply_text, audio_error = await self._say_fixed_line(state, next_question, message_type="ask_question")
            next_action = ConversationAction.ASK_QUESTION

        response = self._turn_response(
            state,
            message=reply_text,
            next_action=next_action,
            transcript=user_text,
            detected_language=detected_language,
            audio_error=audio_error,
        )
        response.summary_pending = all_questions_answered
        return response

    # =====================================================
    # SUMMARY AFTER THE THREE FIXED QUESTIONS
    # =====================================================

    async def create_summary(self, session_id: str) -> ConversationTurnResponse:
        """
        Send all three fixed answers to Qwen in ONE call, save the project
        details, and read the summary back to the user.

        The frontend calls this right after VEYA says "Okay, got it", so
        Qwen works while that line is playing. If Qwen fails, nothing is
        lost and this can simply be called again.
        """

        async with self._exclusive_access(session_id):
            state = self.store.get_conversation(session_id)

            fixed_questions_done = len(state.fixed_answers) == len(self._questions(state))
            if not fixed_questions_done or state.initial_summary_done:
                raise InvalidConversationStateError(
                    "The summary is made once, right after VEYA's three questions."
                )
            if state.status != ConversationStatus.COLLECTING_INFORMATION:
                raise InvalidConversationStateError(
                    f"This conversation is '{state.status.value}' and cannot be summarised."
                )

            # The Language Layer turns each answer into English first, as
            # for every other answer. English voice answers are skipped.
            questions_and_answers = []
            for fixed_answer in state.fixed_answers:
                english_answer = await self._to_english(fixed_answer.answer, fixed_answer.language)
                questions_and_answers.append((fixed_answer.question, english_answer))

            extraction = await asyncio.to_thread(
                self.conversation_pipeline.extract_project_details, questions_and_answers
            )

            # The user may have pressed Cancel while Qwen was thinking.
            if state.status == ConversationStatus.CANCELLED:
                raise InvalidConversationStateError("This conversation was cancelled.")

            self.store.apply_turn_updates(
                session_id,
                extracted=extraction.project_details,
                corrected=ProjectDetails(),
                removed={},
                skipped=extraction.skipped_fields,
            )

            # Never lose the idea: if the model left it out, use the
            # user's own (English) answer to the first question.
            if not state.project_details.initial_idea:
                idea_answer = questions_and_answers[0][1]
                self.store.apply_extracted_information(session_id, ProjectDetails(initial_idea=idea_answer))

            self.store.mark_initial_summary_done(session_id)
            self.store.set_status(session_id, ConversationStatus.AWAITING_CONFIRMATION)

            english_summary = build_confirmation_summary(state)
            summary_text = await self._translate_for_user(english_summary, state.preferred_language)
            self.store.add_message(
                session_id,
                ConversationMessage(
                    role="assistant",
                    text=summary_text,
                    english_text=english_summary,
                    language=state.preferred_language,
                    message_type=ConversationAction.REQUEST_CONFIRMATION.value,
                ),
            )

            audio_error = await self._speak(state, summary_text)

            return self._turn_response(
                state,
                message=summary_text,
                next_action=ConversationAction.REQUEST_CONFIRMATION,
                audio_error=audio_error,
            )

    # =====================================================
    # READ STATE
    # =====================================================

    def get_conversation_view(self, session_id: str) -> ConversationStateResponse:
        state = self.store.get_conversation(session_id)
        return ConversationStateResponse(
            session_id=state.session_id,
            status=state.status,
            preferred_language=state.preferred_language,
            project_details=state.project_details,
            skipped_fields=state.skipped_fields,
            messages=[
                PublicMessage(
                    role=message.role,
                    text=message.text,
                    timestamp=message.timestamp,
                    message_type=message.message_type,
                )
                for message in state.messages
            ],
            generation_result=state.generation_result,
            project_id=state.project_id,
            last_error=state.last_error,
        )

    def get_latest_audio(self, session_id: str) -> Optional[bytes]:
        return self.store.get_conversation(session_id).latest_audio

    # =====================================================
    # CONFIRM AND GENERATE
    # =====================================================

    async def confirm_and_generate(self, session_id: str) -> ConfirmConversationResponse:
        async with self._exclusive_access(session_id):
            state = self.store.get_conversation(session_id)

            # A second Confirm after success returns the same result
            # instead of generating the project again.
            if state.status == ConversationStatus.COMPLETED and state.generation_result:
                return ConfirmConversationResponse(
                    session_id=session_id,
                    status=state.status,
                    result=state.generation_result,
                    project_id=state.project_id,
                )

            self._check_project_limit(state.owner_id, state.plan)

            if state.status == ConversationStatus.AWAITING_CONFIRMATION:
                self.store.set_status(session_id, ConversationStatus.READY_TO_GENERATE)
            elif state.status == ConversationStatus.ERROR and state.confirmed_at is None:
                raise InvalidConversationStateError(
                    "Please review VEYA's summary before generating the project."
                )
            elif state.status not in (ConversationStatus.READY_TO_GENERATE, ConversationStatus.ERROR):
                raise InvalidConversationStateError(
                    "VEYA needs to summarise your project and get your confirmation first."
                )

            self.store.mark_confirmed(session_id)
            self.store.set_status(session_id, ConversationStatus.GENERATING_PROJECT)
            state.last_error = None

            try:
                result, visual_input = await asyncio.to_thread(self.project_generator.generate, state)
            except Exception as error:
                logger.exception("Project generation failed for conversation %s...", session_id[:8])
                state.last_error = ProjectGenerationError.user_message
                if state.status == ConversationStatus.GENERATING_PROJECT:
                    self.store.set_status(session_id, ConversationStatus.ERROR)
                raise ProjectGenerationError() from error

            if state.status == ConversationStatus.CANCELLED:
                raise InvalidConversationStateError("This conversation was cancelled during generation.")

            result.response = await self._translate_for_user(result.response, state.preferred_language)

            state.generation_result = result
            state.visual_generation_input = visual_input
            state.project_id = self._save_project(state, result, visual_input)
            self.store.set_status(session_id, ConversationStatus.COMPLETED)

            return ConfirmConversationResponse(
                session_id=session_id, status=state.status, result=result, project_id=state.project_id
            )

    def _save_project(
        self,
        state: ConversationState,
        result: Any,
        visual_input: Optional[dict[str, Any]],
    ) -> Optional[str]:
        """
        Store the generated project so it survives a server restart.
        A storage problem never hides the result the user just waited for.
        """

        if self.project_repository is None:
            return None
        try:
            project = self.project_repository.save_generated(
                owner_id=state.owner_id,
                session_id=state.session_id,
                details=state.project_details,
                result=result,
                visual_input=visual_input,
            )
        except Exception:
            logger.exception("Saving the project failed for conversation %s...", state.session_id[:8])
            return None
        return project.project_id

    # =====================================================
    # CANCEL
    # =====================================================

    def cancel(self, session_id: str) -> CancelConversationResponse:
        # No lock here: the user must be able to cancel while a turn
        # is still being processed. The turn checks for this afterwards.
        state = self.store.cancel_conversation(session_id)
        state.latest_audio = None
        return CancelConversationResponse(session_id=session_id, status=state.status)

    # =====================================================
    # ON-DEMAND IMAGE (existing Stable Diffusion generator)
    # =====================================================

    async def generate_concept_image(self, session_id: str) -> GenerateImageResponse:
        async with self._exclusive_access(session_id):
            state = self.store.get_conversation(session_id)

            if state.status != ConversationStatus.COMPLETED or not state.visual_generation_input:
                raise InvalidConversationStateError("Generate the project before requesting an image.")

            self._check_image_entitlement(state.plan)

            if self.image_generator is None:
                raise ImageGenerationError("Image generation is not configured.")

            try:
                image_result = await asyncio.to_thread(
                    self.image_generator.generate_image, state.visual_generation_input
                )
            except Exception as error:
                logger.exception("Image generation failed for conversation %s...", session_id[:8])
                raise ImageGenerationError() from error

            filename = image_result.get("filename") if isinstance(image_result, dict) else None
            if not filename:
                raise ImageGenerationError("The image generator did not return a file.")

            image_url = f"/generated_images/{filename}"
            if self.project_repository is not None and state.project_id:
                try:
                    self.project_repository.update(state.owner_id, state.project_id, image_url=image_url)
                except Exception:
                    logger.exception("Could not attach the image to project %s", state.project_id)

            return GenerateImageResponse(
                session_id=session_id,
                image_url=image_url,
                filename=filename,
            )

    async def generate_project_image(self, owner_id: Optional[str], project_id: str) -> tuple[str, str]:
        """
        Stable Diffusion for a SAVED project (works after a server restart).
        Returns (image_url, filename). Raises ProjectNotFoundError from the store.
        """

        if self.project_repository is None:
            raise ImageGenerationError("Project storage is not configured.")
        if self.image_generator is None:
            raise ImageGenerationError("Image generation is not configured.")
        self._check_image_entitlement(self.plan_resolver.plan_for(owner_id).value)

        project = self.project_repository.get(owner_id, project_id)
        if not project.visual_generation_input:
            raise InvalidConversationStateError("This project has no visual description to draw from.")

        try:
            image_result = await asyncio.to_thread(
                self.image_generator.generate_image, project.visual_generation_input
            )
        except Exception as error:
            logger.exception("Image generation failed for project %s", project_id)
            raise ImageGenerationError() from error

        filename = image_result.get("filename") if isinstance(image_result, dict) else None
        if not filename:
            raise ImageGenerationError("The image generator did not return a file.")

        image_url = f"/generated_images/{filename}"
        self.project_repository.update(owner_id, project_id, image_url=image_url)
        return image_url, filename

    # =====================================================
    # HELPERS
    # =====================================================

    @staticmethod
    def _questions(state: ConversationState) -> list[str]:
        """This conversation's wording of the three fixed questions."""
        return state.fixed_questions or FIXED_QUESTIONS

    # ---- plans ----

    @staticmethod
    def _check_image_entitlement(plan: str) -> None:
        if not plan_config(plan).entitlements.image_generation:
            raise PlanLimitError("Concept images are part of the paid plan.")

    def _check_project_limit(self, owner_id: Optional[str], plan: str) -> None:
        limit = plan_config(plan).entitlements.max_projects
        if limit is None or self.project_repository is None:
            return
        if self.project_repository.count(owner_id) >= limit:
            raise PlanLimitError(
                f"Your plan includes {limit} saved project{'s' if limit != 1 else ''}. "
                "Delete one or upgrade to create more."
            )

    def _exclusive_access(self, session_id: str) -> asyncio.Lock:
        """
        Only one request may change a conversation at a time.
        A second request (double click, two tabs) is rejected right away
        instead of waiting, so nothing runs twice.
        """

        lock = self.store.get_lock(session_id)
        if lock.locked():
            raise ConversationBusyError()
        return lock

    @staticmethod
    def _validate_audio(audio_bytes: bytes, content_type: Optional[str]) -> None:
        if not audio_bytes:
            raise InvalidAudioError("The recording is empty. Please record your answer again.")

        if len(audio_bytes) > MAX_AUDIO_BYTES:
            raise InvalidAudioError("The recording is too long. Please keep answers under a few minutes.")

        if content_type and not content_type.lower().startswith(ACCEPTED_AUDIO_CONTENT_TYPES):
            raise InvalidAudioError("Unsupported file type. Please upload an audio recording.")

    async def _transcribe(self, audio_bytes: bytes, filename: Optional[str]) -> tuple[str, Optional[str]]:
        """Convert the recording with ffmpeg and send it to the existing Gnani STT pipeline."""

        # Only known audio types; anything else is read as WebM (Expo web / browsers).
        suffix = Path(filename or "recording.webm").suffix.lower()
        if suffix not in AUDIO_DEMUXERS:
            suffix = ".webm"

        with tempfile.TemporaryDirectory() as temp_dir:
            # Different names, so a .wav upload never overwrites itself.
            input_path = Path(temp_dir) / f"upload{suffix}"
            wav_path = Path(temp_dir) / "converted.wav"
            input_path.write_bytes(audio_bytes)

            try:
                await asyncio.to_thread(convert_to_wav, input_path, wav_path)
            except AudioConversionError as error:
                logger.warning("Audio conversion failed: %s", error)
                raise InvalidAudioError() from error

            result = await self.stt_pipeline.transcribe(audio_path=str(wav_path), language_code="indic-auto")

        if not result.get("success"):
            # The error text comes from httpx and never contains the API key.
            logger.error("Gnani STT failed: %s", str(result.get("error"))[:300])
            raise SpeechRecognitionError()

        transcript = (result.get("transcription") or "").strip()
        if not transcript:
            raise EmptyTranscriptError()

        return transcript, result.get("language")

    async def _to_english(self, text: str, detected_language: Optional[str]) -> str:
        """Use the existing Language Layer to normalise the answer to English."""

        if detected_language and detected_language.lower().startswith("en"):
            return text

        try:
            return await asyncio.to_thread(self.language_pipeline.normalize_input, text)
        except Exception as error:
            logger.error("Input normalisation failed: %s", type(error).__name__)
            raise LanguageModelError() from error

    async def _translate_for_user(self, english_text: str, preferred_language: str) -> str:
        """
        Translate VEYA's reply with the existing Language Layer.
        If translation fails, the English text is used instead.
        """

        if not english_text or preferred_language.strip().lower() in ENGLISH_NAMES:
            return english_text

        try:
            translated = await asyncio.to_thread(
                self.language_pipeline.translate_response,
                {"response": english_text},
                preferred_language,
            )
            translated_text = translated.get("response")
            if isinstance(translated_text, str) and translated_text.strip():
                return translated_text.strip()
        except Exception as error:
            logger.warning("Output translation failed, using English: %s", type(error).__name__)

        return english_text

    async def _say_fixed_line(
        self,
        state: ConversationState,
        english_text: str,
        message_type: str,
    ) -> tuple[str, Optional[str]]:
        """
        Say one of VEYA's fixed lines (a fixed question or "Okay, got it").

        Its translation and audio are cached per language. Returns the text
        shown to the user and an audio error message (or None).
        """

        cache_key = (state.preferred_language, english_text)
        cached_line = self._fixed_line_cache.get(cache_key)

        if cached_line:
            line_text, line_audio = cached_line
            state.latest_audio = line_audio
            audio_error = None
        else:
            line_text = await self._translate_for_user(english_text, state.preferred_language)
            audio_error = await self._speak(state, line_text)
            # Cache only a complete success, so a failure is retried next time.
            if state.latest_audio is not None:
                self._fixed_line_cache[cache_key] = (line_text, state.latest_audio)

        self.store.add_message(
            state.session_id,
            ConversationMessage(
                role="assistant",
                text=line_text,
                english_text=english_text,
                language=state.preferred_language,
                message_type=message_type,
            ),
        )

        return line_text, audio_error

    async def _speak(self, state: ConversationState, text: str) -> Optional[str]:
        """
        Generate speech with the existing Gnani TTS pipeline.

        TTS problems never break the conversation: the reply is still
        returned as text. Returns an error message for the user or None.
        """

        state.latest_audio = None
        language_code = SUPPORTED_OUTPUT_LANGUAGES.get(state.preferred_language, "en-IN")

        try:
            audio_bytes = await asyncio.wait_for(
                self.tts_pipeline.synthesize(
                    text=text,
                    language=language_code,
                    voice=self.tts_voice,
                    sample_rate=TTS_SAMPLE_RATE,
                ),
                timeout=TTS_TIMEOUT_SECONDS,
            )
        except asyncio.TimeoutError:
            logger.error("Gnani TTS took longer than %s seconds.", TTS_TIMEOUT_SECONDS)
            return TTS_UNAVAILABLE_MESSAGE
        except httpx.HTTPStatusError as error:
            logger.error("Gnani TTS returned HTTP %s", error.response.status_code)
            return TTS_UNAVAILABLE_MESSAGE
        except (httpx.HTTPError, ValueError) as error:
            logger.error("Gnani TTS request failed: %s", type(error).__name__)
            return TTS_UNAVAILABLE_MESSAGE

        # Gnani is asked for a WAV container, which always starts with "RIFF".
        if not audio_bytes or not audio_bytes.startswith(b"RIFF"):
            logger.error("Gnani TTS returned an invalid audio response.")
            return TTS_UNAVAILABLE_MESSAGE

        state.latest_audio = audio_bytes
        return None

    @staticmethod
    def _turn_response(
        state: ConversationState,
        message: str,
        next_action: Optional[ConversationAction],
        transcript: Optional[str] = None,
        detected_language: Optional[str] = None,
        audio_error: Optional[str] = None,
    ) -> ConversationTurnResponse:
        return ConversationTurnResponse(
            session_id=state.session_id,
            status=state.status,
            message=message,
            next_action=next_action,
            transcript=transcript,
            detected_language=detected_language,
            audio_available=state.latest_audio is not None,
            audio_error=audio_error,
            project_details=state.project_details,
            skipped_fields=state.skipped_fields,
        )
