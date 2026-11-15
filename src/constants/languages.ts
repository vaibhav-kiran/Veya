import type { BackendLanguage } from "@/types/api";

/**
 * The languages Veya works in. One choice covers everything: Gnani listens
 * for it, Veya replies and speaks in it (text chat too). These are exactly
 * the languages Gnani Prisma STT and Timbre TTS support, and the backend's
 * SUPPORTED_OUTPUT_LANGUAGES.
 */
export const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "hi", label: "Hindi", nativeLabel: "हिन्दी" },
  { code: "ta", label: "Tamil", nativeLabel: "தமிழ்" },
  { code: "te", label: "Telugu", nativeLabel: "తెలుగు" },
  { code: "kn", label: "Kannada", nativeLabel: "ಕನ್ನಡ" },
  { code: "ml", label: "Malayalam", nativeLabel: "മലയാളം" },
  { code: "bn", label: "Bengali", nativeLabel: "বাংলা" },
  { code: "mr", label: "Marathi", nativeLabel: "मराठी" },
  { code: "gu", label: "Gujarati", nativeLabel: "ગુજરાતી" },
  { code: "pa", label: "Punjabi", nativeLabel: "ਪੰਜਾਬੀ" },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]["code"];

export const DEFAULT_LANGUAGE: LanguageCode = "en";

export function isLanguageCode(value: unknown): value is LanguageCode {
  return LANGUAGES.some((language) => language.code === value);
}

export function languageLabel(code: string): string {
  return LANGUAGES.find((language) => language.code === code)?.label ?? code;
}

/** A representative letter from each language's script, shown on its tile. */
export const LANGUAGE_GLYPHS: Record<LanguageCode, string> = {
  en: "Aa",
  hi: "अ",
  ta: "த",
  te: "తె",
  kn: "ಕ",
  ml: "മ",
  bn: "অ",
  mr: "म",
  gu: "ગ",
  pa: "ਪ",
};

/** The name the backend expects (its SUPPORTED_OUTPUT_LANGUAGES keys). */
export const BACKEND_LANGUAGE: Record<LanguageCode, BackendLanguage> = {
  en: "English",
  hi: "Hindi",
  ta: "Tamil",
  te: "Telugu",
  kn: "Kannada",
  ml: "Malayalam",
  bn: "Bengali",
  mr: "Marathi",
  gu: "Gujarati",
  pa: "Punjabi",
};
