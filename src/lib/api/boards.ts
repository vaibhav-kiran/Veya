import type { AiModel } from "@/constants/aiModels";
import type { BackendLanguage, BoardContext, BoardPurpose, BoardRating, IdeaCheck, IdeaRating, ImprovePlan } from "@/types/api";

import { apiRequest } from "./client";
import { audioFormPart, type RecordedAudio } from "./conversation";

/** Web research plus a model call; a local model can take a while. */
const RESEARCH_TIMEOUT_MS = 3 * 60_000;
const RATE_TIMEOUT_MS = 3 * 60_000;

export type BoardIdeaInput = {
  id: string;
  title: string;
  description: string;
  problem: string;
  solution: string;
  target_users: string;
};

/** What a page is for. For a hackathon (name or link), Veya researches it on the web. */
export function researchBoard(purpose: BoardPurpose, query: string, notes: string, model: AiModel): Promise<BoardContext> {
  return apiRequest("/boards/research", {
    method: "POST",
    json: { purpose, query, notes, model },
    timeoutMs: RESEARCH_TIMEOUT_MS,
  });
}

/** Rate the page's ideas against what it's for; best first. */
export function rateBoard(context: BoardContext, ideas: BoardIdeaInput[], model: AiModel): Promise<BoardRating> {
  return apiRequest("/boards/rate", { method: "POST", json: { context, ideas, model }, timeoutMs: RATE_TIMEOUT_MS });
}

/** "Make it better": concrete changes that make one item a stronger fit for the page's purpose. */
export function improveItem(
  item: BoardIdeaInput,
  context: BoardContext,
  rating: IdeaRating | undefined,
  check: IdeaCheck | undefined,
  model: AiModel,
): Promise<ImprovePlan> {
  return apiRequest("/boards/improve", {
    method: "POST",
    json: { item, context, rating: rating ?? null, check: check ?? null, model },
    timeoutMs: RATE_TIMEOUT_MS,
  });
}

/** Speech to text, for answering by voice. */
export async function transcribe(audio: RecordedAudio, language: BackendLanguage): Promise<string> {
  const form = new FormData();
  await audioFormPart(form, audio);
  form.append("preferred_language", language);
  const result = await apiRequest<{ text: string }>("/boards/transcribe", { method: "POST", form, timeoutMs: 60_000 });
  return result.text;
}

/** Idea Check for one idea or project, judged against the page's purpose (can take up to a minute). */
export function checkItem(item: BoardIdeaInput, context: BoardContext | null, model: AiModel): Promise<IdeaCheck> {
  return apiRequest("/boards/check", { method: "POST", json: { item, context, model }, timeoutMs: RESEARCH_TIMEOUT_MS });
}
