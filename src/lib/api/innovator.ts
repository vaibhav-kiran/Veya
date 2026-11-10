import type { DiscoveryResults, DiscoveryStart, DiscoveryStatus, EvaluatedIdea, InnovatorProfile } from "@/types/innovator";

import { apiRequest } from "./client";

/** Starts research right away; it runs in the background on the server for a few minutes. */
export function start(profile: InnovatorProfile): Promise<DiscoveryStart> {
  return apiRequest("/innovator/start", { method: "POST", json: { profile } });
}

export function status(sessionId: string): Promise<DiscoveryStatus> {
  return apiRequest(`/innovator/${encodeURIComponent(sessionId)}/status`);
}

export function results(sessionId: string): Promise<DiscoveryResults> {
  return apiRequest(`/innovator/${encodeURIComponent(sessionId)}/results`);
}

/** Rewrites the idea with the student's feedback and re-checks it. Slow on a local model. */
export function refine(ideaId: string, feedback: string): Promise<EvaluatedIdea> {
  return apiRequest(`/innovator/ideas/${encodeURIComponent(ideaId)}/refine`, {
    method: "POST",
    json: { feedback },
    timeoutMs: 10 * 60_000,
  });
}
