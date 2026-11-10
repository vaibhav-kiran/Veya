import { create } from "zustand";
import { persist } from "zustand/middleware";

import { BACKEND_RESPONSE_LANGUAGE, type ResponseLanguageCode } from "@/constants/languages";
import type { RecordedAudio } from "@/lib/api/conversation";
import { createId } from "@/lib/id";
import { persistStorage, reportHydrationErrors } from "@/lib/storage";
import { ApiError, conversationApi, describeApiError, isAbortError, isConversationGone } from "@/lib/veyaApi";
import { useProjectsStore } from "@/stores/projectsStore";
import type { ConversationStatus, ConversationTurnResponse } from "@/types/api";
import type { ChatMessage } from "@/types/models";

/**
 * The single Veya conversation shared by voice and text chat. The backend
 * owns the conversation (session id, collected details, generation); this
 * store mirrors it for the UI and drives the voice state machine.
 */
export type VoicePhase =
  | "idle"
  | "starting"
  | "listening"
  | "processing"
  | "speaking"
  | "waitingForUser"
  | "awaitingConfirmation"
  | "generatingProject"
  | "completed"
  | "error";

/** What to do once Veya finishes speaking the current reply. */
type AfterSpeech = "summary" | "generate" | null;

type ConversationState = {
  /** Clerk user id this conversation belongs to — guards against account switches. */
  ownerId: string | null;
  sessionId: string | null;
  serverStatus: ConversationStatus | null;
  phase: VoicePhase;
  messages: ChatMessage[];
  /** User-facing error for the current step, shown by the voice and chat panels. */
  error: string | null;
  /** Non-blocking note, e.g. "voice playback unavailable, reply shown as text". */
  notice: string | null;
  /** Increments for each reply whose audio should be played; read by the audio controller. */
  speechId: number | null;
  afterSpeech: AfterSpeech;
  projectId: string | null;
  /**
   * Hands-free: start listening by itself whenever it's the user's turn.
   * On when the user starts talking to Veya; off after a silent attempt,
   * cancel or an error, so the mic never keeps reopening in an empty room.
   */
  handsFree: boolean;
  /** This user has heard Veya's full spoken introduction; later conversations open with a short greeting. */
  introHeard: boolean;

  startVoiceConversation: (language: ResponseLanguageCode) => Promise<void>;
  sendRecording: (audio: RecordedAudio) => Promise<void>;
  confirm: () => Promise<void>;
  cancel: () => Promise<void>;
  startNewConversation: () => void;
  claimForUser: (userId: string) => void;
  /** After an app restart: re-sync with the server and pick up where the conversation stopped. */
  resume: () => Promise<void>;
  setListening: (listening: boolean) => void;
  speechFinished: () => void;
  reportVoiceError: (message: string) => void;
  setHandsFree: (handsFree: boolean) => void;
  /** Nothing was said in a hands-free attempt: stop listening until the user taps. */
  noSpeechHeard: () => void;
  dismissError: () => void;
};

const ACTIVE_STATUSES: readonly ConversationStatus[] = [
  "created",
  "collecting_information",
  "awaiting_confirmation",
  "ready_to_generate",
  "generating_project",
  "error",
];

export const isSessionActive = (state: Pick<ConversationState, "sessionId" | "serverStatus">) =>
  state.sessionId !== null && state.serverStatus !== null && ACTIVE_STATUSES.includes(state.serverStatus);

/** Phases in which nothing new may be sent (prevents overlapping requests). */
export const isConversationBusy = (state: Pick<ConversationState, "phase" | "afterSpeech">) =>
  state.phase === "starting" ||
  state.phase === "processing" ||
  state.phase === "generatingProject" ||
  state.phase === "listening" ||
  (state.phase === "speaking" && state.afterSpeech !== null);

function phaseForStatus(status: ConversationStatus | null): VoicePhase {
  switch (status) {
    case "awaiting_confirmation":
      return "awaitingConfirmation";
    case "created":
    case "collecting_information":
    case "ready_to_generate":
    case "error":
      return "waitingForUser";
    case "generating_project":
      return "generatingProject";
    case "completed":
      return "completed";
    default:
      return "idle";
  }
}

const now = () => new Date().toISOString();

const veyaMessage = (text: string, projectId: string | null = null): ChatMessage => ({
  id: createId(),
  role: "veya",
  text,
  status: "sent",
  error: null,
  createdAt: now(),
  savedIdeaId: null,
  projectId,
});

const userMessage = (text: string, status: ChatMessage["status"]): ChatMessage => ({
  id: createId(),
  role: "user",
  text,
  status,
  error: null,
  createdAt: now(),
  savedIdeaId: null,
});

const SESSION_GONE_MESSAGE = "This conversation expired or the Veya server restarted. Start a new conversation to continue.";

/*
 * Bumped whenever the conversation is cancelled or replaced, so replies to
 * requests from an older conversation are ignored instead of leaking in.
 */
let epoch = 0;
let speechCounter = 0;
let inFlight: AbortController | null = null;

export const useConversationStore = create<ConversationState>()(
  persist(
    (set, get) => {
      /** Show Veya's reply, then speak it (or continue right away if there's no audio). */
      const applyTurn = (turn: ConversationTurnResponse, options: { speak: boolean }) => {
        const afterSpeech: AfterSpeech = turn.summary_pending
          ? "summary"
          : turn.status === "ready_to_generate"
            ? "generate"
            : null;

        set((state) => ({
          sessionId: turn.session_id,
          serverStatus: turn.status,
          messages: [...state.messages, veyaMessage(turn.message)],
          notice: turn.audio_error,
          error: null,
          afterSpeech,
        }));

        if (turn.status === "cancelled") {
          set({ phase: "idle", afterSpeech: null, speechId: null });
          return;
        }

        if (options.speak && turn.audio_available) {
          speechCounter += 1;
          set({ phase: "speaking", speechId: speechCounter });
        } else {
          get().speechFinished();
        }
      };

      const handleFailure = (error: unknown, fallbackPhase: VoicePhase) => {
        if (isAbortError(error)) return;
        if (isConversationGone(error)) {
          set({ sessionId: null, serverStatus: null, phase: "error", error: SESSION_GONE_MESSAGE, afterSpeech: null });
          return;
        }
        // 409 = busy or wrong step: the conversation itself is fine.
        const phase = error instanceof ApiError && error.status === 409 ? fallbackPhase : "error";
        set({ phase, error: describeApiError(error) });
      };

      const ensureSession = async (language: ResponseLanguageCode, speak: boolean): Promise<boolean> => {
        if (isSessionActive(get())) return true;
        const myEpoch = ++epoch;
        set({ phase: "starting", error: null, notice: null, projectId: null, speechId: null, afterSpeech: null });
        try {
          const turn = await conversationApi.startConversation(BACKEND_RESPONSE_LANGUAGE[language], get().introHeard);
          if (myEpoch !== epoch) return false;
          set({ introHeard: true });
          applyTurn(turn, { speak });
          return true;
        } catch (error) {
          if (myEpoch === epoch) handleFailure(error, "idle");
          return false;
        }
      };

      const runSummary = async () => {
        const { sessionId } = get();
        if (!sessionId) return;
        const myEpoch = epoch;
        set({ phase: "processing", afterSpeech: null, error: null });
        try {
          const turn = await conversationApi.requestSummary(sessionId);
          if (myEpoch === epoch) applyTurn(turn, { speak: true });
        } catch (error) {
          if (myEpoch !== epoch) return;
          // Nothing is lost: the summary can simply be requested again.
          set({ afterSpeech: "summary" });
          handleFailure(error, "waitingForUser");
        }
      };

      return {
        ownerId: null,
        sessionId: null,
        serverStatus: null,
        phase: "idle",
        messages: [],
        error: null,
        notice: null,
        speechId: null,
        afterSpeech: null,
        projectId: null,
        handsFree: false,
        introHeard: false,

        startVoiceConversation: async (language) => {
          if (isConversationBusy(get())) return;
          if (get().serverStatus === "completed") get().startNewConversation();
          set({ handsFree: true });
          await ensureSession(language, true);
        },

        sendRecording: async (audio) => {
          const { sessionId } = get();
          if (!sessionId) return;
          const myEpoch = epoch;
          inFlight = new AbortController();
          set({ phase: "processing", error: null, speechId: null });
          try {
            const turn = await conversationApi.respondWithAudio(sessionId, audio, inFlight.signal);
            if (myEpoch !== epoch) return;
            if (turn.transcript) set((state) => ({ messages: [...state.messages, userMessage(turn.transcript ?? "", "sent")] }));
            applyTurn(turn, { speak: true });
          } catch (error) {
            if (myEpoch === epoch) handleFailure(error, phaseForStatus(get().serverStatus));
          } finally {
            inFlight = null;
          }
        },

        confirm: async () => {
          const { sessionId } = get();
          if (!sessionId || get().phase === "generatingProject") return;
          const myEpoch = epoch;
          set({ phase: "generatingProject", afterSpeech: null, speechId: null, error: null });
          try {
            const confirmed = await conversationApi.confirmConversation(sessionId);
            if (myEpoch !== epoch) return;
            const name = confirmed.result.project_name || "Your project";
            // The full plan is laid out on the project screen; the chat keeps a short note.
            const text = confirmed.project_id
              ? `${name} is ready! Open the project to see your plan, README and workflow.`
              : `${name} is ready, but it couldn't be saved on the server. Please try again.`;
            set((state) => ({
              serverStatus: confirmed.status,
              phase: "completed",
              handsFree: false,
              projectId: confirmed.project_id,
              messages: [...state.messages, veyaMessage(text, confirmed.project_id)],
            }));
            void useProjectsStore.getState().refresh();
          } catch (error) {
            if (myEpoch !== epoch) return;
            // A failed generation keeps the answers; confirming again retries.
            set({ serverStatus: "error" });
            handleFailure(error, "awaitingConfirmation");
            if (get().phase === "error" && get().sessionId) set({ phase: "awaitingConfirmation" });
          }
        },

        cancel: async () => {
          const { sessionId } = get();
          epoch += 1;
          inFlight?.abort();
          inFlight = null;
          set({ phase: "idle", serverStatus: sessionId ? "cancelled" : null, speechId: null, afterSpeech: null, error: null, handsFree: false });
          if (!sessionId) return;
          try {
            await conversationApi.cancelConversation(sessionId);
          } catch {
            // Already gone on the server — nothing left to cancel.
          }
        },

        startNewConversation: () => {
          const { sessionId, serverStatus } = get();
          epoch += 1;
          inFlight?.abort();
          inFlight = null;
          if (sessionId && serverStatus && ACTIVE_STATUSES.includes(serverStatus)) {
            void conversationApi.cancelConversation(sessionId).catch(() => undefined);
          }
          set({
            sessionId: null,
            serverStatus: null,
            phase: "idle",
            messages: [],
            error: null,
            notice: null,
            speechId: null,
            afterSpeech: null,
            projectId: null,
            handsFree: false,
          });
        },

        claimForUser: (userId) => {
          if (get().ownerId === userId) return;
          // A different account signed in on this device: never show the previous conversation.
          get().startNewConversation();
          set({ ownerId: userId, introHeard: false });
        },

        resume: async () => {
          const { sessionId } = get();
          if (!sessionId || isConversationBusy(get())) return;
          const myEpoch = epoch;
          try {
            const view = await conversationApi.getConversation(sessionId);
            if (myEpoch !== epoch) return;
            set({ serverStatus: view.status, projectId: view.project_id ?? get().projectId });
            const last = view.messages[view.messages.length - 1];
            // Closed between "Okay, got it" and the summary: request the summary now.
            if (view.status === "collecting_information" && last?.role === "assistant" && last.message_type === "summarise") {
              set({ afterSpeech: "summary" });
              await runSummary();
              return;
            }
            set({ phase: phaseForStatus(view.status) });
          } catch (error) {
            if (myEpoch !== epoch) return;
            // Expired or the server restarted: keep the messages, drop the dead session.
            if (isConversationGone(error)) set({ sessionId: null, serverStatus: null, phase: "idle", afterSpeech: null });
          }
        },

        setListening: (listening) => {
          if (listening) set({ phase: "listening", error: null, speechId: null });
          else if (get().phase === "listening") set({ phase: phaseForStatus(get().serverStatus) });
        },

        speechFinished: () => {
          const { afterSpeech } = get();
          set({ speechId: null });
          if (afterSpeech === "summary") void runSummary();
          else if (afterSpeech === "generate") void get().confirm();
          else set({ phase: phaseForStatus(get().serverStatus) });
        },

        reportVoiceError: (message) => set({ phase: "error", error: message, handsFree: false }),

        setHandsFree: (handsFree) => set({ handsFree }),

        noSpeechHeard: () =>
          set({
            handsFree: false,
            phase: phaseForStatus(get().serverStatus),
            notice: "I didn't hear anything, so I stopped listening. Tap the orb when you're ready.",
          }),

        dismissError: () => {
          const { afterSpeech } = get();
          set({ error: null, phase: phaseForStatus(get().serverStatus) });
          // A failed summary request is retried when the user moves on.
          if (afterSpeech === "summary") void runSummary();
        },

      };
    },
    {
      name: "veya.conversation",
      version: 2,
      storage: persistStorage,
      onRehydrateStorage: reportHydrationErrors("veya.conversation"),
      partialize: ({ ownerId, sessionId, serverStatus, messages, projectId, introHeard }) => ({
        ownerId,
        sessionId,
        serverStatus,
        messages,
        projectId,
        introHeard,
      }),
      // v1 kept a local-only conversation id; the backend session replaces it.
      migrate: (persisted, version) => {
        const saved = (persisted ?? {}) as Partial<ConversationState>;
        if (version < 2) return { messages: saved.messages ?? [], sessionId: null, serverStatus: null, projectId: null };
        return saved;
      },
      merge: (persisted, current) => {
        // `persisted` is undefined on first launch (nothing saved yet).
        const saved = (persisted ?? {}) as Partial<ConversationState>;
        const serverStatus = saved.serverStatus ?? null;
        return {
          ...current,
          ...saved,
          // Requests and audio can't survive an app restart.
          phase: saved.sessionId ? phaseForStatus(serverStatus === "generating_project" ? "awaiting_confirmation" : serverStatus) : "idle",
          messages: (saved.messages ?? []).map((message) =>
            message.status === "sending"
              ? { ...message, status: "failed", error: "This message wasn't delivered. Try again." }
              : message,
          ),
        };
      },
    },
  ),
);
