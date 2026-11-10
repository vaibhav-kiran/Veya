import { create } from "zustand";
import { persist } from "zustand/middleware";

import { persistStorage, reportHydrationErrors } from "@/lib/storage";
import { ApiError, describeApiError, innovatorApi } from "@/lib/veyaApi";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import type {
  DiscoveryResults,
  DiscoveryStatus,
  EvaluatedIdea,
  InnovatorProfile,
  InnovatorProjectType,
} from "@/types/innovator";

/**
 * Innovator: the student describes themselves, the server researches real
 * problems, existing solutions and gaps, and comes back with up to three
 * evidence-backed project ideas. Research runs on the server for a few
 * minutes; the screen polls `refreshStatus` while it does.
 */

export type InnovatorForm = {
  academicField: string;
  academicLevel: string;
  interests: string;
  skills: string;
  hardware: string;
  budget: string;
  deadline: string;
  teamSize: string;
  projectType: InnovatorProjectType | null;
};

const EMPTY_FORM: InnovatorForm = {
  academicField: "",
  academicLevel: "",
  interests: "",
  skills: "",
  hardware: "",
  budget: "",
  deadline: "",
  teamSize: "",
  projectType: null,
};

type InnovatorState = {
  ownerId: string | null;
  form: InnovatorForm;
  sessionId: string | null;
  status: DiscoveryStatus | null;
  results: DiscoveryResults | null;
  starting: boolean;
  error: string | null;
  /** Ideas being refined right now (idea_id). */
  refining: Record<string, boolean>;
  refineErrors: Record<string, string>;
  /** idea_id → id of the copy saved to Your Ideas. */
  saved: Record<string, string>;

  setForm: (changes: Partial<InnovatorForm>) => void;
  start: () => Promise<void>;
  refreshStatus: () => Promise<void>;
  refine: (ideaId: string, feedback: string) => Promise<boolean>;
  saveToIdeas: (evaluated: EvaluatedIdea) => string;
  newSearch: () => void;
  dismissError: () => void;
  claimForUser: (userId: string) => void;
};

const splitList = (text: string) =>
  text
    .split(/[,\n]/)
    .map((part) => part.trim())
    .filter(Boolean);

/** The form needs at least an interest or a field so the research has a direction. */
export const canStart = (form: InnovatorForm) => splitList(form.interests).length > 0 || form.academicField.trim() !== "";

export function toProfile(form: InnovatorForm): InnovatorProfile {
  const team = Number.parseInt(form.teamSize, 10);
  const text = (value: string) => value.trim() || undefined;
  const interests = splitList(form.interests);
  return {
    academic_field: text(form.academicField),
    academic_level: text(form.academicLevel),
    interests,
    preferred_domains: interests,
    technical_skills: splitList(form.skills),
    available_hardware: splitList(form.hardware),
    budget: text(form.budget),
    deadline: text(form.deadline),
    team_size: Number.isFinite(team) && team > 0 ? Math.min(team, 50) : undefined,
    project_type: form.projectType ?? undefined,
  };
}

const isGone = (error: unknown) => error instanceof ApiError && error.status === 404;

export const useInnovatorStore = create<InnovatorState>()(
  persist(
    (set, get) => ({
      ownerId: null,
      form: EMPTY_FORM,
      sessionId: null,
      status: null,
      results: null,
      starting: false,
      error: null,
      refining: {},
      refineErrors: {},
      saved: {},

      setForm: (changes) => set((state) => ({ form: { ...state.form, ...changes } })),

      start: async () => {
        const { form, starting } = get();
        if (starting || !canStart(form)) return;
        set({ starting: true, error: null, results: null, status: null, refineErrors: {} });
        try {
          const started = await innovatorApi.start(toProfile(form));
          set({ sessionId: started.session_id });
          await get().refreshStatus();
        } catch (error) {
          // A 404 here means the backend predates Innovator (an old server process still running).
          const message =
            error instanceof ApiError && error.status === 404
              ? "Innovator isn't available on the Veya server yet. Restart the backend and try again."
              : describeApiError(error);
          set({ error: message });
        } finally {
          set({ starting: false });
        }
      },

      refreshStatus: async () => {
        const sessionId = get().sessionId;
        if (!sessionId) return;
        try {
          const status = await innovatorApi.status(sessionId);
          if (get().sessionId !== sessionId) return;
          set({ status, error: null });
          if (status.status === "completed" || (status.status === "failed" && !get().results)) {
            const results = await innovatorApi.results(sessionId);
            if (get().sessionId === sessionId) set({ results });
          }
        } catch (error) {
          if (get().sessionId !== sessionId) return;
          if (isGone(error)) {
            set({ sessionId: null, status: null, results: null, error: describeApiError(error) });
          } else {
            set({ error: describeApiError(error) });
          }
        }
      },

      refine: async (ideaId, feedback) => {
        set((state) => ({ refining: { ...state.refining, [ideaId]: true }, refineErrors: omit(state.refineErrors, ideaId) }));
        try {
          await innovatorApi.refine(ideaId, feedback.trim());
          // Refining re-ranks the whole session, so reload everything.
          const sessionId = get().sessionId;
          if (sessionId) set({ results: await innovatorApi.results(sessionId) });
          return true;
        } catch (error) {
          set((state) => ({ refineErrors: { ...state.refineErrors, [ideaId]: describeApiError(error) } }));
          return false;
        } finally {
          set((state) => ({ refining: omit(state.refining, ideaId) }));
        }
      },

      saveToIdeas: ({ idea, feasibility }) => {
        const existing = get().saved[idea.idea_id];
        if (existing && useWorkspaceStore.getState().ideas[existing]) return existing;
        const openQuestions = [...idea.risks, ...idea.assumptions, ...(feasibility?.blockers ?? [])];
        const id = useWorkspaceStore.getState().addIdea({
          title: idea.title,
          description: [idea.differentiator, feasibility?.minimum_credible_demo && `Demo: ${feasibility.minimum_credible_demo}`]
            .filter(Boolean)
            .join("\n\n"),
          problem: idea.problem_statement,
          solution: [idea.proposed_solution, idea.technical_approach].filter(Boolean).join("\n\n"),
          targetUsers: idea.target_users.join(", "),
          openQuestions: openQuestions.map((item) => `• ${item}`).join("\n"),
        });
        set((state) => ({ saved: { ...state.saved, [idea.idea_id]: id } }));
        return id;
      },

      newSearch: () => set({ sessionId: null, status: null, results: null, error: null, refining: {}, refineErrors: {} }),

      dismissError: () => set({ error: null }),

      claimForUser: (userId) => {
        if (get().ownerId === userId) return;
        // Another account on this device: never show the previous person's profile or results.
        set({ ownerId: userId, form: EMPTY_FORM, sessionId: null, status: null, results: null, error: null, saved: {} });
      },
    }),
    {
      name: "veya.innovator",
      version: 1,
      storage: persistStorage,
      onRehydrateStorage: reportHydrationErrors("veya.innovator"),
      partialize: ({ ownerId, form, sessionId, status, results, saved }) => ({ ownerId, form, sessionId, status, results, saved }),
    },
  ),
);

/** Research is still going on the server. */
export const isResearching = (state: Pick<InnovatorState, "sessionId" | "status" | "starting">) =>
  state.starting || (state.sessionId !== null && (state.status === null || state.status.status === "running" || state.status.status === "created"));

function omit<T>(record: Record<string, T>, key: string): Record<string, T> {
  const { [key]: _removed, ...rest } = record;
  return rest;
}
