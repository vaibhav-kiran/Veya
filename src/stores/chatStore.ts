import { create } from "zustand";
import { persist } from "zustand/middleware";

import { BACKEND_RESPONSE_LANGUAGE, type ResponseLanguageCode } from "@/constants/languages";
import { createId } from "@/lib/id";
import { persistStorage, reportHydrationErrors } from "@/lib/storage";
import { ApiError, chatApi, describeApiError, isAbortError, isConversationGone } from "@/lib/veyaApi";
import { useProjectsStore } from "@/stores/projectsStore";
import type { ConversationStatus } from "@/types/api";
import type { ChatMessage } from "@/types/models";

/**
 * VEYA's text chat — its own backend session (/chat), separate from voice.
 * The model asks whatever it needs to, one question at a time; once the user
 * agrees to the summary the project is generated and saved.
 */
/** A finished or left-behind chat, kept on this device for the history panel. */
export type ArchivedChat = {
  id: string;
  /** The user's first message, shortened. */
  title: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
  /** Set when this chat produced a saved project. */
  projectId: string | null;
};

/** Oldest chats are dropped beyond this. */
const MAX_HISTORY = 30;
const TITLE_LIMIT = 60;

type ChatState = {
  /** Clerk user id this chat belongs to — guards against account switches. */
  ownerId: string | null;
  sessionId: string | null;
  serverStatus: ConversationStatus | null;
  messages: ChatMessage[];
  /** A message is being sent or the chat is starting. */
  sending: boolean;
  /** The project is being generated (several minutes on a local model). */
  generating: boolean;
  error: string | null;
  projectId: string | null;
  /** Past chats, newest first. */
  history: ArchivedChat[];
  /** A past chat being read (read-only); null = the current chat. */
  viewingId: string | null;

  send: (text: string, language: ResponseLanguageCode) => Promise<void>;
  retry: (messageId: string, language: ResponseLanguageCode) => Promise<void>;
  confirm: () => Promise<void>;
  cancel: () => Promise<void>;
  /** Move the current chat into history and start an empty one. */
  startNewChat: () => void;
  /** Start fresh when the user comes back (app opened or returned after a while). */
  startFreshOnReturn: () => void;
  viewHistory: (id: string | null) => void;
  deleteHistory: (id: string) => void;
  dismissError: () => void;
  claimForUser: (userId: string) => void;
  /** After an app restart: check the server still has this chat. */
  resume: () => Promise<void>;
  markSavedAsIdea: (messageId: string, ideaId: string) => void;
};

const ACTIVE_STATUSES: readonly ConversationStatus[] = [
  "created",
  "collecting_information",
  "awaiting_confirmation",
  "ready_to_generate",
  "generating_project",
  "error",
];

const isActive = (state: Pick<ChatState, "sessionId" | "serverStatus">) =>
  state.sessionId !== null && state.serverStatus !== null && ACTIVE_STATUSES.includes(state.serverStatus);

export const isChatBusy = (state: Pick<ChatState, "sending" | "generating">) => state.sending || state.generating;

const now = () => new Date().toISOString();

const message = (role: ChatMessage["role"], text: string, extra: Partial<ChatMessage> = {}): ChatMessage => ({
  id: createId(),
  role,
  text,
  status: "sent",
  error: null,
  createdAt: now(),
  savedIdeaId: null,
  ...extra,
});

const updateMessage = (messages: ChatMessage[], id: string, patch: Partial<ChatMessage>) =>
  messages.map((item) => (item.id === id ? { ...item, ...patch } : item));

const SESSION_GONE = "This chat expired or the Veya server restarted. Send your message again to start a new chat.";

function titleOf(messages: ChatMessage[]): string {
  const first = messages.find((item) => item.role === "user")?.text.split("\n")[0].trim() ?? "Chat";
  return first.length > TITLE_LIMIT ? `${first.slice(0, TITLE_LIMIT - 1).trimEnd()}…` : first;
}

/* Bumped when a chat is cancelled or replaced, so late replies are ignored. */
let epoch = 0;
let inFlight: AbortController | null = null;

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => {
      const ensureSession = async (language: ResponseLanguageCode): Promise<boolean> => {
        if (isActive(get())) return true;
        const myEpoch = ++epoch;
        try {
          const turn = await chatApi.startChat(BACKEND_RESPONSE_LANGUAGE[language]);
          if (myEpoch !== epoch) return false;
          set((state) => ({
            sessionId: turn.session_id,
            serverStatus: turn.status,
            projectId: null,
            messages: [...state.messages, message("veya", turn.message)],
          }));
          return true;
        } catch (error) {
          if (myEpoch === epoch) set({ error: describeApiError(error) });
          return false;
        }
      };

      const deliver = async (messageId: string, text: string) => {
        const { sessionId } = get();
        if (!sessionId) return;
        const myEpoch = epoch;
        inFlight = new AbortController();
        set((state) => ({ sending: true, error: null, messages: updateMessage(state.messages, messageId, { status: "sending", error: null }) }));
        try {
          const turn = await chatApi.sendChatMessage(sessionId, text, inFlight.signal);
          if (myEpoch !== epoch) return;
          set((state) => ({
            sending: false,
            serverStatus: turn.status,
            messages: [...updateMessage(state.messages, messageId, { status: "sent" }), message("veya", turn.message)],
          }));
          // The user agreed to the summary: build the project right away.
          if (turn.status === "ready_to_generate") await get().confirm();
        } catch (error) {
          if (myEpoch !== epoch || isAbortError(error)) return;
          const gone = isConversationGone(error);
          set((state) => ({
            sending: false,
            error: gone ? SESSION_GONE : describeApiError(error),
            ...(gone ? { sessionId: null, serverStatus: null } : {}),
            messages: updateMessage(state.messages, messageId, { status: "failed", error: describeApiError(error) }),
          }));
        } finally {
          inFlight = null;
        }
      };

      return {
        ownerId: null,
        sessionId: null,
        serverStatus: null,
        messages: [],
        sending: false,
        generating: false,
        error: null,
        projectId: null,
        history: [],
        viewingId: null,

        send: async (text, language) => {
          const trimmed = text.trim();
          if (!trimmed || isChatBusy(get())) return;
          if (get().serverStatus === "completed") get().startNewChat();
          set({ sending: true, error: null });
          if (!(await ensureSession(language))) {
            set({ sending: false });
            return;
          }
          const userMessage = message("user", trimmed, { status: "sending" });
          set((state) => ({ messages: [...state.messages, userMessage] }));
          await deliver(userMessage.id, trimmed);
        },

        retry: async (messageId, language) => {
          const failed = get().messages.find((item) => item.id === messageId);
          if (!failed || failed.status === "sending" || isChatBusy(get())) return;
          if (!isActive(get())) {
            set((state) => ({ messages: state.messages.filter((item) => item.id !== messageId) }));
            await get().send(failed.text, language);
            return;
          }
          await deliver(messageId, failed.text);
        },

        confirm: async () => {
          const { sessionId } = get();
          if (!sessionId || get().generating) return;
          const myEpoch = epoch;
          set({ generating: true, error: null });
          try {
            const confirmed = await chatApi.confirmChat(sessionId);
            if (myEpoch !== epoch) return;
            const name = confirmed.result.project_name || "Your project";
            // The full plan is laid out on the project screen; the chat keeps a short note.
            const text = confirmed.project_id
              ? `${name} is ready! Open the project to see your plan, README and workflow.`
              : `${name} is ready, but it couldn't be saved on the server. Please try again.`;
            set((state) => ({
              generating: false,
              serverStatus: confirmed.status,
              projectId: confirmed.project_id,
              messages: [...state.messages, message("veya", text, { projectId: confirmed.project_id })],
            }));
            void useProjectsStore.getState().refresh();
          } catch (error) {
            if (myEpoch !== epoch) return;
            // A failed generation keeps the answers; confirming again retries.
            const gone = isConversationGone(error);
            set({
              generating: false,
              error: gone ? SESSION_GONE : describeApiError(error),
              serverStatus: gone ? null : error instanceof ApiError && error.status === 409 ? get().serverStatus : "error",
              ...(gone ? { sessionId: null } : {}),
            });
          }
        },

        cancel: async () => {
          const { sessionId } = get();
          epoch += 1;
          inFlight?.abort();
          inFlight = null;
          set({ sending: false, generating: false, error: null, serverStatus: sessionId ? "cancelled" : null });
          if (sessionId) await chatApi.cancelChat(sessionId).catch(() => undefined);
        },

        startNewChat: () => {
          const { sessionId, serverStatus, messages, projectId, history } = get();
          epoch += 1;
          inFlight?.abort();
          inFlight = null;
          if (sessionId && serverStatus && ACTIVE_STATUSES.includes(serverStatus)) {
            void chatApi.cancelChat(sessionId).catch(() => undefined);
          }
          // Keep chats the user actually took part in; a lone greeting isn't worth saving.
          const worthKeeping = messages.some((item) => item.role === "user");
          const archived: ArchivedChat[] = worthKeeping
            ? [
                {
                  id: createId(),
                  title: titleOf(messages),
                  messages: messages.map((item) => (item.status === "sending" ? { ...item, status: "failed" as const } : item)),
                  createdAt: messages[0]?.createdAt ?? now(),
                  updatedAt: messages[messages.length - 1]?.createdAt ?? now(),
                  projectId,
                },
                ...history,
              ].slice(0, MAX_HISTORY)
            : history;
          set({
            sessionId: null,
            serverStatus: null,
            messages: [],
            sending: false,
            generating: false,
            error: null,
            projectId: null,
            history: archived,
            viewingId: null,
          });
        },

        startFreshOnReturn: () => {
          // Never interrupt a reply or a project that is still being built.
          if (isChatBusy(get())) return;
          if (get().messages.length === 0) {
            set({ viewingId: null });
            return;
          }
          get().startNewChat();
        },

        viewHistory: (id) => set({ viewingId: id }),

        deleteHistory: (id) =>
          set((state) => ({
            history: state.history.filter((chat) => chat.id !== id),
            viewingId: state.viewingId === id ? null : state.viewingId,
          })),

        dismissError: () => set({ error: null }),

        claimForUser: (userId) => {
          if (get().ownerId === userId) return;
          // A different account signed in on this device: never show the previous chat or its history.
          get().startNewChat();
          set({ ownerId: userId, history: [], viewingId: null });
        },

        resume: async () => {
          const { sessionId } = get();
          if (!sessionId) return;
          try {
            const view = await chatApi.getChat(sessionId);
            set({ serverStatus: view.status, projectId: view.project_id ?? get().projectId });
          } catch (error) {
            if (isConversationGone(error)) set({ sessionId: null, serverStatus: null });
          }
        },

        markSavedAsIdea: (messageId, ideaId) =>
          set((state) => ({
            messages: updateMessage(state.messages, messageId, { savedIdeaId: ideaId }),
            history: state.history.map((chat) => ({ ...chat, messages: updateMessage(chat.messages, messageId, { savedIdeaId: ideaId }) })),
          })),
      };
    },
    {
      name: "veya.chat",
      version: 1,
      storage: persistStorage,
      onRehydrateStorage: reportHydrationErrors("veya.chat"),
      partialize: ({ ownerId, sessionId, serverStatus, messages, projectId, history }) => ({
        ownerId,
        sessionId,
        serverStatus,
        messages,
        projectId,
        history,
      }),
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<ChatState>;
        return {
          ...current,
          ...saved,
          // Requests can't survive an app restart.
          messages: (saved.messages ?? []).map((item) =>
            item.status === "sending" ? { ...item, status: "failed", error: "This message wasn't delivered. Try again." } : item,
          ),
        };
      },
    },
  ),
);

/** Chat has a summary waiting for the user's OK. */
export const isAwaitingConfirmation = (state: Pick<ChatState, "serverStatus" | "generating">) =>
  !state.generating && (state.serverStatus === "awaiting_confirmation" || state.serverStatus === "error");
