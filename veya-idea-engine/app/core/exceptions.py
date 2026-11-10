"""Errors raised inside the engine. Messages are safe to show to API callers."""


class EngineError(Exception):
    user_message = "The idea discovery engine ran into a problem."

    def __init__(self, user_message: str | None = None):
        if user_message:
            self.user_message = user_message
        super().__init__(self.user_message)


class LLMError(EngineError):
    user_message = "The reasoning model is not available. Check that Ollama is running."


class LLMOutputError(EngineError):
    user_message = "The reasoning model returned an answer that could not be understood."


class SourceUnavailableError(EngineError):
    """A research source failed (network, auth, server error). The pipeline continues without it."""

    user_message = "A research source is not available right now."


class SourceRateLimitedError(SourceUnavailableError):
    user_message = "A research source is rate limited right now."


class SessionNotFoundError(EngineError):
    user_message = "This discovery session does not exist."


class IdeaNotFoundError(EngineError):
    user_message = "This idea does not exist."


class InvalidSessionStateError(EngineError):
    user_message = "That action is not possible at this stage of the session."
