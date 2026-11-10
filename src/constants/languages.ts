import type { BackendLanguage } from "@/types/api";

/**
 * Language choices from the language-selection reference. The response
 * language is sent to the backend (see BACKEND_RESPONSE_LANGUAGE); input
 * language is detected by Gnani STT automatically.
 */
export type LanguageOptionData<TCode extends string> = {
  code: TCode;
  label: string;
  /** Name in its native script, omitted when identical to the label. */
  nativeLabel?: string;
};

export const INPUT_LANGUAGES = [
  { code: "en", label: "English" },
  { code: "hi", label: "Hindi", nativeLabel: "हिन्दी" },
  { code: "ta", label: "Tamil", nativeLabel: "தமிழ்" },
  { code: "te", label: "Telugu", nativeLabel: "తెలుగు" },
  { code: "ml", label: "Malayalam", nativeLabel: "മലയാളം" },
  { code: "kn", label: "Kannada", nativeLabel: "ಕನ್ನಡ" },
  { code: "bn", label: "Bengali", nativeLabel: "বাংলা" },
  { code: "mr", label: "Marathi", nativeLabel: "मराठी" },
  { code: "gu", label: "Gujarati", nativeLabel: "ગુજરાતી" },
  { code: "pa", label: "Punjabi", nativeLabel: "ਪੰਜਾਬੀ" },
] as const satisfies readonly LanguageOptionData<string>[];

export const RESPONSE_LANGUAGES = [
  { code: "en", label: "English" },
  { code: "hi", label: "Hindi" },
  { code: "ta", label: "Tamil" },
  { code: "te", label: "Telugu" },
  { code: "ml", label: "Malayalam" },
  { code: "kn", label: "Kannada" },
  { code: "hinglish", label: "Hinglish" },
  { code: "tanglish", label: "Tanglish" },
] as const satisfies readonly LanguageOptionData<string>[];

export const DOCUMENTATION_LANGUAGES = [
  { code: "en", label: "English" },
  { code: "hi", label: "Hindi" },
] as const satisfies readonly LanguageOptionData<string>[];

export type InputLanguageCode = (typeof INPUT_LANGUAGES)[number]["code"];
export type ResponseLanguageCode = (typeof RESPONSE_LANGUAGES)[number]["code"];
export type DocumentationLanguageCode = (typeof DOCUMENTATION_LANGUAGES)[number]["code"];

export const LANGUAGE_SECTIONS = {
  input: {
    step: "01",
    title: "Your language",
    summary: "You'll speak",
    prompt: "What language will you speak to Veya?",
    options: INPUT_LANGUAGES,
  },
  response: {
    step: "02",
    title: "Response language",
    summary: "Veya replies in",
    prompt: "How should Veya respond to you?",
    options: RESPONSE_LANGUAGES,
  },
  documentation: {
    step: "03",
    title: "Project language",
    summary: "Docs in",
    prompt: "What language should your generated project documentation use?",
    options: DOCUMENTATION_LANGUAGES,
  },
} as const;

export function languageLabel(code: string): string {
  const all: readonly LanguageOptionData<string>[] = [...INPUT_LANGUAGES, ...RESPONSE_LANGUAGES];
  return all.find((language) => language.code === code)?.label ?? code;
}

/** A representative letter from each language's script, shown on its tile. */
export const LANGUAGE_GLYPHS: Record<string, string> = {
  en: "Aa",
  hi: "अ",
  ta: "த",
  te: "తె",
  ml: "മ",
  kn: "ಕ",
  bn: "অ",
  mr: "म",
  gu: "ગ",
  pa: "ਪ",
  hinglish: "अA",
  tanglish: "தA",
};

/** Extra context for mixed-language options. */
export const LANGUAGE_CAPTIONS: Record<string, string> = {
  hinglish: "Hindi + English",
  tanglish: "Tamil + English",
};

/**
 * The backend translates and speaks only the languages in its
 * SUPPORTED_OUTPUT_LANGUAGES. Mixed languages (Hinglish, Tanglish) are not
 * supported there yet, so they fall back to English.
 */
export const BACKEND_RESPONSE_LANGUAGE: Record<ResponseLanguageCode, BackendLanguage> = {
  en: "English",
  hi: "Hindi",
  ta: "Tamil",
  te: "Telugu",
  ml: "Malayalam",
  kn: "Kannada",
  hinglish: "English",
  tanglish: "English",
};
