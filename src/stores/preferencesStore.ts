import { create } from "zustand";
import { persist } from "zustand/middleware";

import { DEFAULT_LANGUAGE, isLanguageCode, type LanguageCode } from "@/constants/languages";
import { SHOW_ONBOARDING_ON_EVERY_LAUNCH } from "@/lib/config";
import { persistStorage, reportHydrationErrors } from "@/lib/storage";

type PreferencesState = {
  onboardingComplete: boolean;
  /**
   * Show onboarding before anything else on this launch. Not persisted, so it
   * resets on every app start (see SHOW_ONBOARDING_ON_EVERY_LAUNCH).
   */
  introPending: boolean;
  /** Which auth screen to open after onboarding. Not persisted. */
  authEntry: AuthEntry;
  /** True once the user has confirmed the language step after first sign-in. */
  languagesConfirmed: boolean;
  /** The one language Veya listens, replies and speaks in. */
  language: LanguageCode;
  completeOnboarding: (authEntry?: AuthEntry) => void;
  /** Called once the chosen auth screen has opened. */
  clearAuthEntry: () => void;
  /** Development helper: show onboarding again right now. */
  replayOnboarding: () => void;
  setLanguage: (language: LanguageCode) => void;
};

export type AuthEntry = "sign-in" | "sign-up";

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      onboardingComplete: false,
      introPending: SHOW_ONBOARDING_ON_EVERY_LAUNCH,
      authEntry: "sign-in",
      languagesConfirmed: false,
      language: DEFAULT_LANGUAGE,
      completeOnboarding: (authEntry = "sign-in") => set({ onboardingComplete: true, introPending: false, authEntry }),
      clearAuthEntry: () => set({ authEntry: "sign-in" }),
      replayOnboarding: () => set({ introPending: true }),
      setLanguage: (language) => set({ language, languagesConfirmed: true }),
    }),
    {
      name: "veya.preferences",
      version: 2,
      storage: persistStorage,
      onRehydrateStorage: reportHydrationErrors("veya.preferences"),
      partialize: ({ onboardingComplete, languagesConfirmed, language }) => ({ onboardingComplete, languagesConfirmed, language }),
      // v1 kept separate input / response / documentation languages. The
      // response language is the one Veya actually used, so it becomes the
      // single language. Mixed Hinglish / Tanglish become Hindi / Tamil.
      migrate: (persisted, version) => {
        const saved = (persisted ?? {}) as Record<string, unknown>;
        if (version < 2) {
          const previous = (saved.languages as { response?: string } | undefined)?.response;
          const mapped = previous === "hinglish" ? "hi" : previous === "tanglish" ? "ta" : previous;
          const { languages: _old, ...rest } = saved;
          return { ...rest, language: isLanguageCode(mapped) ? mapped : DEFAULT_LANGUAGE };
        }
        return saved;
      },
    },
  ),
);
