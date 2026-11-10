import { useSyncExternalStore } from "react";

import { hydrationFailed, onHydrationFailure } from "@/lib/storage";
import { useChatStore } from "@/stores/chatStore";
import { useConversationStore } from "@/stores/conversationStore";
import { usePreferencesStore } from "@/stores/preferencesStore";
import { useSessionStore } from "@/stores/sessionStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";

const persistedStores = [usePreferencesStore, useWorkspaceStore, useConversationStore, useChatStore, useSessionStore] as const;

/** A store is settled once it has loaded, or failed to load and fallen back to defaults. */
const allSettled = () =>
  persistedStores.every((store) => store.persist.hasHydrated() || hydrationFailed(store.persist.getOptions().name ?? ""));

function subscribe(onChange: () => void) {
  const unsubscribers = [
    ...persistedStores.map((store) => store.persist.onFinishHydration(onChange)),
    onHydrationFailure(onChange),
  ];
  return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
}

/** True once every persisted store has finished reading from AsyncStorage. */
export function useStoresHydrated(): boolean {
  return useSyncExternalStore(subscribe, allSettled, allSettled);
}
