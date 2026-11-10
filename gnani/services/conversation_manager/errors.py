"""
Errors raised by the Conversation Manager.

Each error carries a short message that is safe to show to the user.
The API layer turns these into HTTP responses.
"""


class ConversationError(Exception):
    """Base class for all conversation errors."""

    user_message = "Something went wrong with the conversation."

    def __init__(self, user_message: str | None = None):
        if user_message:
            self.user_message = user_message
        super().__init__(self.user_message)


class ConversationNotFoundError(ConversationError):
    user_message = "This conversation does not exist or has expired. Please start a new one."


class InvalidConversationStateError(ConversationError):
    user_message = "That action is not possible at this stage of the conversation."


class ConversationBusyError(ConversationError):
    user_message = "VEYA is still working on your previous request. Please wait a moment."


class InvalidAudioError(ConversationError):
    user_message = "The recording could not be read. Please record your answer again."


class EmptyTranscriptError(ConversationError):
    user_message = "I couldn't hear anything in that recording. Please try again or type your answer."


class SpeechRecognitionError(ConversationError):
    user_message = "The speech recognition service is not available right now. Please try again or type your answer."


class LanguageModelError(ConversationError):
    user_message = "VEYA couldn't process that answer right now. Please make sure Ollama is running and try again."


class ProjectGenerationError(ConversationError):
    user_message = "Project generation failed. Your answers are saved, so you can try confirming again."


class ImageGenerationError(ConversationError):
    user_message = "The concept image could not be generated."


class PlanLimitError(ConversationError):
    """The user's plan does not include this (see services/plans)."""

    user_message = "This isn't included in your current plan."
