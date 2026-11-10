"""
The model-driven pipeline behind VEYA's text chat.

Every user message goes to the model with the chat prompt; the model
chooses the next question itself. The decision is validated and applied
with the same rules as the voice flow (inherited from ConversationPipeline),
so the model can still never generate a project before the user has
confirmed a summary.
"""

from services.chat_manager.chat_prompts import build_chat_messages
from services.conversation_manager.conversation_pipeline import ConversationPipeline
from services.conversation_manager.schemas import ConversationDecision, ConversationState


class ChatPipeline(ConversationPipeline):

    def decide_next_step(self, state: ConversationState, user_message_english: str) -> ConversationDecision:
        """Blocking call. Run it in a thread from async code."""

        return self._ask_model_for(build_chat_messages(state, user_message_english), ConversationDecision)
