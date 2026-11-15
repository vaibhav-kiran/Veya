import type {
  BackendLanguage,
  CancelConversationResponse,
  ChatTurnResponse,
  ConfirmConversationResponse,
  ConversationStateResponse,
  IdeaChoice,
} from "@/types/api";

import type { AiModel } from "@/constants/aiModels";

import { apiRequest } from "./client";

/**
 * VEYA's text chat (/chat). Separate from the voice conversation: the model
 * chooses every question itself, and nothing is spoken.
 */

/** A chat turn is one model call (plus translation) on a local model. */
const TURN_TIMEOUT_MS = 90_000;
/** Perception + Reasoning + README + diagram: several model calls. */
const GENERATION_TIMEOUT_MS = 10 * 60_000;

const chatPath = (sessionId: string, suffix = "") => `/chat/${encodeURIComponent(sessionId)}${suffix}`;

export function startChat(preferredLanguage: BackendLanguage, model: AiModel = "qwen"): Promise<ChatTurnResponse> {
  return apiRequest("/chat/start", {
    method: "POST",
    json: { preferred_language: preferredLanguage, model },
    timeoutMs: TURN_TIMEOUT_MS,
  });
}

export function sendChatMessage(sessionId: string, text: string, signal?: AbortSignal): Promise<ChatTurnResponse> {
  return apiRequest(chatPath(sessionId, "/message"), { method: "POST", json: { text }, timeoutMs: TURN_TIMEOUT_MS, signal });
}

export function getChat(sessionId: string): Promise<ConversationStateResponse> {
  return apiRequest(chatPath(sessionId));
}

/** `choice` comes from Idea Check (build as it is, with an angle, or the smaller version). */
export function confirmChat(sessionId: string, choice?: IdeaChoice): Promise<ConfirmConversationResponse> {
  return apiRequest(chatPath(sessionId, "/confirm"), {
    method: "POST",
    json: choice ? { choice } : undefined,
    timeoutMs: GENERATION_TIMEOUT_MS,
  });
}

export function cancelChat(sessionId: string): Promise<CancelConversationResponse> {
  return apiRequest(chatPath(sessionId, "/cancel"), { method: "POST" });
}
