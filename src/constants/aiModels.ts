/** The language model Veya thinks with. Sent to the backend when a conversation or chat starts. */
export type AiModel = "qwen" | "gemini" | "groq";

export const DEFAULT_AI_MODEL: AiModel = "qwen";

export const AI_MODELS: readonly { value: AiModel; label: string }[] = [
  { value: "gemini", label: "Gemini" },
  { value: "groq", label: "Groq" },
  { value: "qwen", label: "Qwen" },
];

export const AI_MODEL_LABEL: Record<AiModel, string> = { qwen: "Qwen", gemini: "Gemini", groq: "Groq" };
