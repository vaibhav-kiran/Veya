import { create } from "zustand";
import { persist } from "zustand/middleware";

import { createId } from "@/lib/id";
import { persistStorage, reportHydrationErrors } from "@/lib/storage";
import { nextFolderColor } from "@/constants/folderColors";
import type { BoardContext, BoardPurpose, BoardRating, IdeaCheck, ImprovePlan } from "@/types/api";
import type {
  Idea,
  BoardItemKey,
  IdeaBoard,
  IdeaDraft,
  IdeaStatus,
  Project,
  TimelineItem,
  TimelineItemDraft,
} from "@/types/models";

/**
 * Ideas and timeline items, stored normalised by id on this device.
 * Projects live on the Veya backend (see projectsStore); ideas and items
 * reference them by the backend project id.
 */
type WorkspaceState = {
  /** Clerk user id the local data belongs to — guards against account switches. */
  ownerId: string | null;
  ideas: Record<string, Idea>;
  /** Idea pages: one per hackathon or purpose. */
  boards: Record<string, IdeaBoard>;
  items: Record<string, TimelineItem>;
  /**
   * Projects created on this device before projects moved to the backend.
   * They are uploaded once by `migrateLegacyProjects`, then removed here.
   */
  legacyProjects: Record<string, Project>;

  claimForUser: (userId: string) => void;

  addIdea: (draft: IdeaDraft, boardId?: string | null) => string;
  /** Put an idea on a page (null = general ideas). */
  moveIdea: (id: string, boardId: string | null) => void;

  createBoard: (board: { name: string; purpose: BoardPurpose; query: string; notes: string; context: BoardContext | null }) => string;
  updateBoard: (id: string, patch: Partial<Pick<IdeaBoard, "name" | "query" | "notes" | "context">>) => void;
  /** `versions`: item key -> last edit of each rated item. */
  setBoardRating: (id: string, rating: BoardRating, versions: Record<string, string>) => void;
  /** "Make it better" result for one item (null clears it). */
  setBoardImprovement: (id: string, improvement: { key: BoardItemKey; plan: ImprovePlan } | null) => void;
  /** A project's plan was changed from this folder. */
  markImplemented: (id: string, key: BoardItemKey, result: { summary: string; changedSections: string[] }) => void;
  /** Put a saved project on a page (a project is on one page at a time). */
  addProjectToBoard: (boardId: string, projectId: string) => void;
  removeProjectFromBoard: (boardId: string, projectId: string) => void;
  setItemCheck: (boardId: string, key: BoardItemKey, check: IdeaCheck) => void;
  /** Delete a page; its ideas go back to general ideas. */
  deleteBoard: (id: string) => void;
  updateIdea: (id: string, draft: IdeaDraft) => void;
  setIdeaStatus: (id: string, status: Exclude<IdeaStatus, "converted">) => void;
  discardIdea: (id: string) => void;
  /** Marks the idea as converted into the backend project `projectId`. */
  linkIdeaToProject: (id: string, projectId: string) => void;
  /** The backend project was deleted: free its idea and drop its items. */
  projectDeleted: (projectId: string) => void;
  /** Replace a local project id with the id the backend assigned to it. */
  replaceProjectId: (localId: string, backendId: string) => void;

  addItem: (draft: TimelineItemDraft) => string;
  updateItem: (id: string, draft: TimelineItemDraft) => void;
  toggleItemCompleted: (id: string) => void;
  deleteItem: (id: string) => void;
};

const now = () => new Date().toISOString();

function omit<T>(record: Record<string, T>, id: string): Record<string, T> {
  const { [id]: _removed, ...rest } = record;
  return rest;
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      ownerId: null,
      ideas: {},
      boards: {},
      items: {},
      legacyProjects: {},

      claimForUser: (userId) => {
        const { ownerId } = get();
        if (ownerId === userId) return;
        // A different account signed in on this device: start from a clean workspace.
        set({ ownerId: userId, ideas: {}, boards: {}, items: {}, legacyProjects: {} });
      },

      addIdea: (draft, boardId = null) => {
        const id = createId();
        const timestamp = now();
        const idea: Idea = { id, ...draft, status: "new", projectId: null, boardId, createdAt: timestamp, updatedAt: timestamp };
        set((state) => ({ ideas: { ...state.ideas, [id]: idea } }));
        return id;
      },

      moveIdea: (id, boardId) =>
        set((state) => {
          const idea = state.ideas[id];
          if (!idea || (idea.boardId ?? null) === boardId) return state;
          return { ideas: { ...state.ideas, [id]: { ...idea, boardId, updatedAt: now() } } };
        }),

      createBoard: ({ name, purpose, query, notes, context }) => {
        const id = createId();
        const timestamp = now();
        const board: IdeaBoard = {
          id,
          name,
          purpose,
          query,
          notes,
          context,
          rating: null,
          ratedIdeas: {},
          ratedAt: null,
          color: nextFolderColor(Object.values(get().boards)),
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        set((state) => ({ boards: { ...state.boards, [id]: board } }));
        return id;
      },

      updateBoard: (id, patch) =>
        set((state) => {
          const board = state.boards[id];
          if (!board) return state;
          // New research means the old rating no longer applies.
          const reset = patch.context !== undefined ? { rating: null, ratedIdeas: {}, ratedAt: null } : {};
          return { boards: { ...state.boards, [id]: { ...board, ...patch, ...reset, updatedAt: now() } } };
        }),

      setBoardRating: (id, rating, versions) =>
        set((state) => {
          const board = state.boards[id];
          if (!board) return state;
          const ratedIdeas = Object.fromEntries(rating.ratings.map((item) => [item.idea_id, versions[item.idea_id] ?? ""]));
          const timestamp = now();
          return { boards: { ...state.boards, [id]: { ...board, rating, ratedIdeas, ratedAt: timestamp, updatedAt: timestamp } } };
        }),

      setBoardImprovement: (id, improvement) =>
        set((state) => {
          const board = state.boards[id];
          if (!board) return state;
          const value = improvement ? { ...improvement, at: now() } : null;
          return { boards: { ...state.boards, [id]: { ...board, improvement: value, updatedAt: now() } } };
        }),

      markImplemented: (id, key, result) =>
        set((state) => {
          const board = state.boards[id];
          if (!board) return state;
          const implemented = { ...(board.implemented ?? {}), [key]: { ...result, at: now() } };
          return { boards: { ...state.boards, [id]: { ...board, implemented, updatedAt: now() } } };
        }),

      addProjectToBoard: (boardId, projectId) =>
        set((state) => {
          if (!state.boards[boardId]) return state;
          const timestamp = now();
          const boards = Object.fromEntries(
            Object.entries(state.boards).map(([id, board]) => {
              const current = board.projectIds ?? [];
              if (id === boardId) {
                return [id, current.includes(projectId) ? board : { ...board, projectIds: [projectId, ...current], updatedAt: timestamp }];
              }
              return [id, current.includes(projectId) ? { ...board, projectIds: current.filter((p) => p !== projectId) } : board];
            }),
          );
          return { boards };
        }),

      removeProjectFromBoard: (boardId, projectId) =>
        set((state) => {
          const board = state.boards[boardId];
          if (!board) return state;
          return { boards: { ...state.boards, [boardId]: { ...board, projectIds: (board.projectIds ?? []).filter((p) => p !== projectId) } } };
        }),

      setItemCheck: (boardId, key, check) =>
        set((state) => {
          const board = state.boards[boardId];
          if (!board) return state;
          return { boards: { ...state.boards, [boardId]: { ...board, checks: { ...(board.checks ?? {}), [key]: check } } } };
        }),

      deleteBoard: (id) =>
        set((state) => ({
          boards: omit(state.boards, id),
          ideas: Object.fromEntries(
            Object.entries(state.ideas).map(([ideaId, idea]) => [ideaId, idea.boardId === id ? { ...idea, boardId: null } : idea]),
          ),
        })),

      updateIdea: (id, draft) =>
        set((state) => {
          const idea = state.ideas[id];
          if (!idea) return state;
          return { ideas: { ...state.ideas, [id]: { ...idea, ...draft, updatedAt: now() } } };
        }),

      setIdeaStatus: (id, status) =>
        set((state) => {
          const idea = state.ideas[id];
          if (!idea || idea.status === "converted") return state;
          return { ideas: { ...state.ideas, [id]: { ...idea, status, updatedAt: now() } } };
        }),

      discardIdea: (id) => set((state) => ({ ideas: omit(state.ideas, id) })),

      linkIdeaToProject: (id, projectId) =>
        set((state) => {
          const idea = state.ideas[id];
          if (!idea) return state;
          return { ideas: { ...state.ideas, [id]: { ...idea, status: "converted", projectId, updatedAt: now() } } };
        }),

      projectDeleted: (projectId) =>
        set((state) => {
          const ideas = { ...state.ideas };
          for (const idea of Object.values(ideas)) {
            // Return the source idea to "selected" so the user can convert it again.
            if (idea.projectId === projectId) ideas[idea.id] = { ...idea, status: "selected", projectId: null, updatedAt: now() };
          }
          const items = Object.fromEntries(Object.entries(state.items).filter(([, item]) => item.projectId !== projectId));
          const boards = Object.fromEntries(
            Object.entries(state.boards).map(([id, board]) => [
              id,
              board.projectIds?.includes(projectId) ? { ...board, projectIds: board.projectIds.filter((p) => p !== projectId) } : board,
            ]),
          );
          return { ideas, items, boards };
        }),

      replaceProjectId: (localId, backendId) =>
        set((state) => ({
          legacyProjects: omit(state.legacyProjects, localId),
          ideas: Object.fromEntries(
            Object.entries(state.ideas).map(([id, idea]) => [id, idea.projectId === localId ? { ...idea, projectId: backendId } : idea]),
          ),
          items: Object.fromEntries(
            Object.entries(state.items).map(([id, item]) => [id, item.projectId === localId ? { ...item, projectId: backendId } : item]),
          ),
        })),

      addItem: (draft) => {
        const id = createId();
        const timestamp = now();
        const item: TimelineItem = { id, ...draft, completed: false, createdAt: timestamp, updatedAt: timestamp };
        set((state) => ({ items: { ...state.items, [id]: item } }));
        return id;
      },

      updateItem: (id, draft) =>
        set((state) => {
          const item = state.items[id];
          if (!item) return state;
          return { items: { ...state.items, [id]: { ...item, ...draft, updatedAt: now() } } };
        }),

      toggleItemCompleted: (id) =>
        set((state) => {
          const item = state.items[id];
          if (!item) return state;
          return { items: { ...state.items, [id]: { ...item, completed: !item.completed, updatedAt: now() } } };
        }),

      deleteItem: (id) => set((state) => ({ items: omit(state.items, id) })),
    }),
    {
      name: "veya.workspace",
      version: 2,
      storage: persistStorage,
      onRehydrateStorage: reportHydrationErrors("veya.workspace"),
      partialize: ({ ownerId, ideas, boards, items, legacyProjects }) => ({ ownerId, ideas, boards, items, legacyProjects }),
      // v1 stored projects on the device; keep them for a one-time upload to the backend.
      migrate: (persisted, version) => {
        const saved = (persisted ?? {}) as Partial<WorkspaceState> & { projects?: Record<string, Project> };
        if (version < 2) {
          const { projects, ...rest } = saved;
          return { ...rest, legacyProjects: projects ?? {} };
        }
        return saved;
      },
    },
  ),
);
