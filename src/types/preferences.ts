import type { DocumentationLanguageCode, InputLanguageCode, ResponseLanguageCode } from "@/constants/languages";

export type LanguagePreferences = {
  input: InputLanguageCode;
  response: ResponseLanguageCode;
  documentation: DocumentationLanguageCode;
};

export type LanguagePreferenceKey = keyof LanguagePreferences;
