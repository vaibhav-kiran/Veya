import { create } from "zustand";

import { describeApiError, isBackendConfigured, projectsApi } from "@/lib/veyaApi";
import type { ProjectSummary, StoredProject, UpdateProjectRequest } from "@/types/api";

/**
 * In-memory cache of the signed-in user's projects. The backend is the
 * source of truth; nothing here is persisted on the device.
 */
type LoadState = "idle" | "loading" | "loaded" | "error";

type ProjectsState = {
  summaries: ProjectSummary[];
  listState: LoadState;
  listError: string | null;
  details: Record<string, StoredProject>;

  refresh: () => Promise<void>;
  load: (projectId: string) => Promise<StoredProject>;
  create: (title: string, sections: UpdateProjectRequest["sections"]) => Promise<StoredProject>;
  update: (projectId: string, body: UpdateProjectRequest) => Promise<StoredProject>;
  remove: (projectId: string) => Promise<void>;
  generateImage: (projectId: string) => Promise<StoredProject>;
  /** Called when the signed-in account changes. */
  reset: () => void;
};

const summaryOf = (project: StoredProject): ProjectSummary => ({
  project_id: project.project_id,
  title: project.title,
  source: project.source,
  created_at: project.created_at,
  updated_at: project.updated_at,
  has_readme: project.readme_markdown.trim().length > 0,
  has_diagram: Boolean(project.workflow_diagram),
  image_url: project.image_url,
  deadline_date: project.deadline_date,
});

/* Bumped on reset so results for a previous account are dropped. */
let generation = 0;

export const useProjectsStore = create<ProjectsState>()((set, get) => {
  const store = (project: StoredProject) =>
    set((state) => {
      const others = state.summaries.filter((summary) => summary.project_id !== project.project_id);
      return {
        details: { ...state.details, [project.project_id]: project },
        summaries: [summaryOf(project), ...others].sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
      };
    });

  return {
    summaries: [],
    listState: "idle",
    listError: null,
    details: {},

    refresh: async () => {
      if (!isBackendConfigured()) {
        set({ listState: "error", listError: describeApiError(new Error("not configured")) });
        return;
      }
      const mine = generation;
      set({ listState: "loading", listError: null });
      try {
        const { projects } = await projectsApi.listProjects();
        if (mine === generation) set({ summaries: projects, listState: "loaded" });
      } catch (error) {
        if (mine === generation) set({ listState: "error", listError: describeApiError(error) });
      }
    },

    load: async (projectId) => {
      const mine = generation;
      const project = await projectsApi.getProject(projectId);
      if (mine === generation) store(project);
      return project;
    },

    create: async (title, sections) => {
      const project = await projectsApi.createProject({ title, sections });
      store(project);
      return project;
    },

    update: async (projectId, body) => {
      const project = await projectsApi.updateProject(projectId, body);
      store(project);
      return project;
    },

    remove: async (projectId) => {
      await projectsApi.deleteProject(projectId);
      set((state) => {
        const { [projectId]: _removed, ...details } = state.details;
        return { details, summaries: state.summaries.filter((summary) => summary.project_id !== projectId) };
      });
    },

    generateImage: async (projectId) => {
      await projectsApi.generateProjectImage(projectId);
      return get().load(projectId);
    },

    reset: () => {
      generation += 1;
      set({ summaries: [], listState: "idle", listError: null, details: {} });
    },
  };
});
