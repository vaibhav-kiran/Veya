import { create } from "zustand";
import { persist } from "zustand/middleware";

import { createId } from "@/lib/id";
import { persistStorage, reportHydrationErrors } from "@/lib/storage";
import type {
  Idea,
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
  items: Record<string, TimelineItem>;
  /**
   * Projects created on this device before projects moved to the backend.
   * They are uploaded once by `migrateLegacyProjects`, then removed here.
   */
  legacyProjects: Record<string, Project>;

  claimForUser: (userId: string) => void;

  addIdea: (draft: IdeaDraft) => string;
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
      items: {},
      legacyProjects: {},

      claimForUser: (userId) => {
        const { ownerId } = get();
        if (ownerId === userId) return;
        // A different account signed in on this device: start from a clean workspace.
        set({ ownerId: userId, ideas: {}, items: {}, legacyProjects: {} });
      },

      addIdea: (draft) => {
        const id = createId();
        const timestamp = now();
        const idea: Idea = { id, ...draft, status: "new", projectId: null, createdAt: timestamp, updatedAt: timestamp };
        set((state) => ({ ideas: { ...state.ideas, [id]: idea } }));
        return id;
      },

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
          return { ideas, items };
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
      partialize: ({ ownerId, ideas, items, legacyProjects }) => ({ ownerId, ideas, items, legacyProjects }),
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
