"""
VEYA Conversation Manager.

Turns a single recorded idea into a guided, multi-turn conversation
before handing the confirmed details to the Perception and Reasoning
layers.
"""

from services.conversation_manager.conversation_pipeline import ConversationPipeline
from services.conversation_manager.conversation_service import ConversationService
from services.conversation_manager.conversation_state import ConversationStore
from services.conversation_manager.project_generation import ProjectGenerator

__all__ = [
    "ConversationPipeline",
    "ConversationService",
    "ConversationStore",
    "ProjectGenerator",
]
