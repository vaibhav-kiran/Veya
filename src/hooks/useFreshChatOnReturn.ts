import { useEffect } from "react";
import { AppState } from "react-native";

import { useChatStore } from "@/stores/chatStore";

/** Coming back after at least this long counts as a new visit. */
const AWAY_FOR_NEW_CHAT_MS = 5 * 60_000;

/**
 * Each visit starts with a fresh chat: when the app opens, and when it comes
 * back from the background after a while. The previous chat moves into the
 * history panel. Switching tabs inside the app does not reset anything.
 */
export function useFreshChatOnReturn(): void {
  useEffect(() => {
    useChatStore.getState().startFreshOnReturn();

    let leftAt: number | null = null;
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "background") {
        leftAt = Date.now();
      } else if (next === "active" && leftAt !== null) {
        if (Date.now() - leftAt >= AWAY_FOR_NEW_CHAT_MS) useChatStore.getState().startFreshOnReturn();
        leftAt = null;
      }
    });
    return () => subscription.remove();
  }, []);
}
