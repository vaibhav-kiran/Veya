import AsyncStorage from "@react-native-async-storage/async-storage";
import { createJSONStorage } from "zustand/middleware";

/**
 * Shared AsyncStorage adapter for persisted Zustand stores.
 * Only non-sensitive app data belongs here — auth tokens live in
 * expo-secure-store via Clerk's token cache.
 */
export const persistStorage = createJSONStorage(() => AsyncStorage);

/*
 * Zustand never marks a store as hydrated if loading it throws, which would
 * hold the app on its startup screen forever. Stores report failures here so
 * startup can continue with default values instead.
 */
const failedStores = new Set<string>();
const failureListeners = new Set<() => void>();

export function hydrationFailed(name: string): boolean {
  return failedStores.has(name);
}

export function onHydrationFailure(listener: () => void): () => void {
  failureListeners.add(listener);
  return () => failureListeners.delete(listener);
}

/** Use as a persisted store's `onRehydrateStorage` option. */
export function reportHydrationErrors<TState>(name: string) {
  return (_initial: TState) => (_state?: TState, error?: unknown) => {
    if (!error) return;
    console.warn(`[veya] Couldn't load saved "${name}" data — starting with defaults.`, error);
    failedStores.add(name);
    failureListeners.forEach((listener) => listener());
  };
}
