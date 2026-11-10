import { create } from "zustand";
import { persist } from "zustand/middleware";

import { persistStorage, reportHydrationErrors } from "@/lib/storage";

/**
 * Device-side session preference. Clerk owns the session itself (stored in
 * expo-secure-store via its token cache); this only remembers whether the
 * user ticked "Remember for 30 days" when they last signed in.
 */
type SessionState = {
  /** When false, the root layout signs the user out on the next cold start. */
  rememberSession: boolean;
  setRememberSession: (remember: boolean) => void;
};

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      rememberSession: true,
      setRememberSession: (rememberSession) => set({ rememberSession }),
    }),
    {
      name: "veya.session",
      version: 2,
      storage: persistStorage,
      onRehydrateStorage: reportHydrationErrors("veya.session"),
      partialize: ({ rememberSession }) => ({ rememberSession }),
      // v1 held the local preview user; keep only its "remember" choice.
      migrate: (persisted) => {
        const old = (persisted ?? {}) as { remember?: unknown; rememberSession?: unknown };
        const value = old.rememberSession ?? old.remember;
        return { rememberSession: typeof value === "boolean" ? value : true };
      },
    },
  ),
);
