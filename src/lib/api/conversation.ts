import { Platform } from "react-native";

import type {
  BackendLanguage,
  CancelConversationResponse,
  ConfirmConversationResponse,
  ConversationStateResponse,
  ConversationTurnResponse,
} from "@/types/api";

import { apiHeaders, apiRequest, apiUrl } from "./client";

/** Qwen + Gnani turns can take a while on a local machine. */
const TURN_TIMEOUT_MS = 90_000;
/** Perception + Reasoning + README + diagram: several model calls. */
const GENERATION_TIMEOUT_MS = 10 * 60_000;

const sessionPath = (sessionId: string, suffix = "") => `/conversation/${encodeURIComponent(sessionId)}${suffix}`;

/** `returningUser`: they've heard Veya's full introduction before, so she keeps the greeting short. */
export function startConversation(preferredLanguage: BackendLanguage, returningUser = false): Promise<ConversationTurnResponse> {
  return apiRequest("/conversation/start", {
    method: "POST",
    json: { preferred_language: preferredLanguage, returning_user: returningUser },
    timeoutMs: TURN_TIMEOUT_MS,
  });
}

/** A recorded answer on disk (native) or at a blob: URL (web). */
export type RecordedAudio = { uri: string };

function audioFileName(uri: string): { name: string; type: string } {
  const extension = /\.([a-z0-9]+)(?:\?|$)/i.exec(uri)?.[1]?.toLowerCase();
  if (extension === "3gp") return { name: "answer.3gp", type: "audio/3gpp" };
  if (extension === "wav") return { name: "answer.wav", type: "audio/wav" };
  if (extension === "webm") return { name: "answer.webm", type: "audio/webm" };
  return { name: "answer.m4a", type: "audio/m4a" };
}

export async function respondWithAudio(
  sessionId: string,
  audio: RecordedAudio,
  signal?: AbortSignal,
): Promise<ConversationTurnResponse> {
  const form = new FormData();
  if (Platform.OS === "web") {
    // Web recordings are blob: URLs (WebM/Opus); the backend converts with ffmpeg.
    const blob = await (await fetch(audio.uri)).blob();
    form.append("audio_file", blob, "answer.webm");
  } else {
    const { name, type } = audioFileName(audio.uri);
    // React Native's FormData uploads a local file from this {uri, name, type} shape.
    form.append("audio_file", { uri: audio.uri, name, type } as unknown as Blob);
  }
  return apiRequest(sessionPath(sessionId, "/respond"), { method: "POST", form, timeoutMs: TURN_TIMEOUT_MS, signal });
}

export function getConversation(sessionId: string): Promise<ConversationStateResponse> {
  return apiRequest(sessionPath(sessionId));
}

export function requestSummary(sessionId: string): Promise<ConversationTurnResponse> {
  return apiRequest(sessionPath(sessionId, "/summary"), { method: "POST", timeoutMs: TURN_TIMEOUT_MS });
}

export function confirmConversation(sessionId: string): Promise<ConfirmConversationResponse> {
  return apiRequest(sessionPath(sessionId, "/confirm"), { method: "POST", timeoutMs: GENERATION_TIMEOUT_MS });
}

export function cancelConversation(sessionId: string): Promise<CancelConversationResponse> {
  return apiRequest(sessionPath(sessionId, "/cancel"), { method: "POST" });
}

/**
 * Source for the WAV of VEYA's latest reply. The server keeps only the
 * latest reply's audio, so play it before sending the next request.
 */
export function latestReplyAudioSource(sessionId: string): { uri: string; headers: Record<string, string> } {
  // The timestamp stops players from reusing a cached earlier reply.
  return { uri: `${apiUrl(sessionPath(sessionId, "/audio"))}?t=${Date.now()}`, headers: apiHeaders() };
}
