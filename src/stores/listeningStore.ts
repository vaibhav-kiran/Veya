import { create } from "zustand";

import { haptics } from "@/lib/haptics";

/**
 * App-wide "Veya is listening" state. It drives the listening animation on
 * the voice page and the edge glow everywhere else.
 *
 * "tap" is a real recording owned by VoiceConversationController, which
 * sends the answer when listening stops. Wake-word ("Hey Veya") detection
 * isn't part of this build yet; "wake-word" is a visual preview only.
 */
export type ListeningSource = "tap" | "wake-word";

/** The wake-word preview has no audio and no end-of-speech signal, so stop on our own. */
const PREVIEW_AUTO_STOP_MS = 15000;

type ListeningState = {
  listening: boolean;
  source: ListeningSource | null;
  startedAt: number | null;
  /** True while the voice page is on screen; it shows its own animation instead of the edge glow. */
  voicePageVisible: boolean;
  startListening: (source: ListeningSource) => void;
  stopListening: () => void;
  setVoicePageVisible: (visible: boolean) => void;
};

let autoStopTimer: ReturnType<typeof setTimeout> | undefined;

export const useListeningStore = create<ListeningState>()((set, get) => ({
  listening: false,
  source: null,
  startedAt: null,
  voicePageVisible: false,

  startListening: (source) => {
    if (get().listening) return;
    haptics.medium();
    set({ listening: true, source, startedAt: Date.now() });
    clearTimeout(autoStopTimer);
    if (source === "wake-word") autoStopTimer = setTimeout(() => get().stopListening(), PREVIEW_AUTO_STOP_MS);
  },

  stopListening: () => {
    clearTimeout(autoStopTimer);
    if (!get().listening) return;
    haptics.light();
    set({ listening: false, source: null, startedAt: null });
  },

  setVoicePageVisible: (voicePageVisible) => set({ voicePageVisible }),
}));
