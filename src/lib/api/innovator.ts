import type { AiModel } from "@/constants/aiModels";
import type { DiscoveryResults, DiscoveryStart, DiscoveryStatus, EvaluatedIdea, InnovatorProfile } from "@/types/innovator";

import { apiRequest } from "./client";

/** Starts research right away, on `model`; it runs in the background on the server for a few minutes. */
export function start(profile: InnovatorProfile, model: AiModel): Promise<DiscoveryStart> {
  return apiRequest("/innovator/start", { method: "POST", json: { profile, model } });
}

export function status(sessionId: string): Promise<DiscoveryStatus> {
  return apiRequest(`/innovator/${encodeURIComponent(sessionId)}/status`);
}

export function results(sessionId: string): Promise<DiscoveryResults> {
  return apiRequest(`/innovator/${encodeURIComponent(sessionId)}/results`);
}

/** Rewrites the idea with the student's feedback and re-checks it. Slow on a local model. */
export function refine(ideaId: string, feedback: string, model: AiModel): Promise<EvaluatedIdea> {
  return apiRequest(`/innovator/ideas/${encodeURIComponent(ideaId)}/refine`, {
    method: "POST",
    json: { feedback, model },
    timeoutMs: 10 * 60_000,
  });
}
