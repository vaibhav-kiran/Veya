import { File } from "expo-file-system";
import { Platform } from "react-native";

import type { AiModel } from "@/constants/aiModels";

import type {
  BackendLanguage,
  CancelConversationResponse,
  ConfirmConversationResponse,
  ConversationStateResponse,
  ConversationTurnResponse,
  IdeaChoice,
} from "@/types/api";

import { apiHeaders, apiRequest, apiUrl } from "./client";

/** Qwen + Gnani turns can take a while on a local machine. */
const TURN_TIMEOUT_MS = 90_000;
/** Perception + Reasoning + README + diagram: several model calls. */
const GENERATION_TIMEOUT_MS = 10 * 60_000;

const sessionPath = (sessionId: string, suffix = "") => `/conversation/${encodeURIComponent(sessionId)}${suffix}`;

/** `returningUser`: they've heard Veya's full introduction before, so she keeps the greeting short. */
export function startConversation(
  preferredLanguage: BackendLanguage,
  returningUser = false,
  model: AiModel = "qwen",
): Promise<ConversationTurnResponse> {
  return apiRequest("/conversation/start", {
    method: "POST",
    json: { preferred_language: preferredLanguage, returning_user: returningUser, model },
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

/** Add a recording to a form as `audio_file` (web: blob URL; native: a file read with expo-file-system). */
export async function audioFormPart(form: FormData, audio: RecordedAudio): Promise<void> {
  if (Platform.OS === "web") {
    // Web recordings are blob: URLs (WebM/Opus); the backend converts with ffmpeg.
    const blob = await (await fetch(audio.uri)).blob();
    form.append("audio_file", blob, "answer.webm");
    return;
  }
  // Expo's fetch rejects React Native's old {uri, name, type} file parts
  // ("Unsupported FormDataPart implementation"). It accepts any part with
  // name, type and bytes(), so read the recording with expo-file-system.
  const uri = audio.uri.startsWith("/") ? `file://${audio.uri}` : audio.uri;
  const { name, type } = audioFileName(uri);
  const part = { name, type, bytes: async () => new Uint8Array(await new File(uri).arrayBuffer()) };
  form.append("audio_file", part as unknown as Blob);
}

export async function respondWithAudio(
  sessionId: string,
  audio: RecordedAudio,
  signal?: AbortSignal,
): Promise<ConversationTurnResponse> {
  const form = new FormData();
  await audioFormPart(form, audio);
  return apiRequest(sessionPath(sessionId, "/respond"), { method: "POST", form, timeoutMs: TURN_TIMEOUT_MS, signal });
}

export function getConversation(sessionId: string): Promise<ConversationStateResponse> {
  return apiRequest(sessionPath(sessionId));
}

export function requestSummary(sessionId: string): Promise<ConversationTurnResponse> {
  return apiRequest(sessionPath(sessionId, "/summary"), { method: "POST", timeoutMs: TURN_TIMEOUT_MS });
}

/** `choice` comes from Idea Check (build as it is, with an angle, or the smaller version). */
export function confirmConversation(sessionId: string, choice?: IdeaChoice): Promise<ConfirmConversationResponse> {
  return apiRequest(sessionPath(sessionId, "/confirm"), {
    method: "POST",
    json: choice ? { choice } : undefined,
    timeoutMs: GENERATION_TIMEOUT_MS,
  });
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
