import { create } from "zustand";
import { persist } from "zustand/middleware";

import { SHOW_ONBOARDING_ON_EVERY_LAUNCH } from "@/lib/config";
import { persistStorage, reportHydrationErrors } from "@/lib/storage";
import type { LanguagePreferences } from "@/types/preferences";

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
  languages: LanguagePreferences;
  completeOnboarding: (authEntry?: AuthEntry) => void;
  /** Called once the chosen auth screen has opened. */
  clearAuthEntry: () => void;
  /** Development helper: show onboarding again right now. */
  replayOnboarding: () => void;
  setLanguages: (languages: LanguagePreferences) => void;
};

export type AuthEntry = "sign-in" | "sign-up";

export const DEFAULT_LANGUAGES: LanguagePreferences = {
  input: "en",
  response: "en",
  documentation: "en",
};

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      onboardingComplete: false,
      introPending: SHOW_ONBOARDING_ON_EVERY_LAUNCH,
      authEntry: "sign-in",
      languagesConfirmed: false,
      languages: DEFAULT_LANGUAGES,
      completeOnboarding: (authEntry = "sign-in") => set({ onboardingComplete: true, introPending: false, authEntry }),
      clearAuthEntry: () => set({ authEntry: "sign-in" }),
      replayOnboarding: () => set({ introPending: true }),
      setLanguages: (languages) => set({ languages, languagesConfirmed: true }),
    }),
    {
      name: "veya.preferences",
      version: 1,
      storage: persistStorage,
      onRehydrateStorage: reportHydrationErrors("veya.preferences"),
      partialize: ({ onboardingComplete, languagesConfirmed, languages }) => ({ onboardingComplete, languagesConfirmed, languages }),
    },
  ),
);
