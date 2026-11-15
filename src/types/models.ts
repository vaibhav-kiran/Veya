import type { BoardContext, BoardPurpose, BoardRating, IdeaCheck, ImprovePlan } from "@/types/api";

/** ISO calendar date in local time, formatted `YYYY-MM-DD`. */
export type ISODate = string;

export type IdeaStatus = "new" | "reviewing" | "selected" | "converted";

/** An idea captured by the user. Every field is user-authored or user-edited. */
export type Idea = {
  id: string;
  title: string;
  description: string;
  problem: string;
  solution: string;
  targetUsers: string;
  openQuestions: string;
  status: IdeaStatus;
  projectId: string | null;
  /** The idea page (hackathon, college project...) it belongs to; none = general ideas. */
  boardId?: string | null;
  createdAt: string;
  updatedAt: string;
};

/** A page of ideas for one purpose: a hackathon, a college project, a startup... */
export type IdeaBoard = {
  id: string;
  name: string;
  purpose: BoardPurpose;
  /** For a hackathon: the name or link the user gave. */
  query: string;
  notes: string;
  /** What Veya found out (hackathon research, or the criteria for the purpose). */
  context: BoardContext | null;
  /** Saved (backend) projects on this page. Ideas point to their page with `Idea.boardId`. */
  projectIds?: string[];
  /** Ratings use item keys: `idea:<id>` or `project:<id>`. */
  rating: BoardRating | null;
  /** The items (key -> last edit) that `rating` covers, to tell when it's out of date. */
  ratedIdeas: Record<string, string>;
  /** Idea Check per item key, judged against this page. */
  checks?: Record<string, IdeaCheck>;
  /** The folder's colour (see constants/folderColors). Older folders have none. */
  color?: string;
  /** "Make it better": the changes Veya suggested for one item. */
  improvement?: { key: BoardItemKey; plan: ImprovePlan; at: string } | null;
  /** Projects whose plan was changed from this folder ("Implement the plan"). */
  implemented?: Partial<Record<BoardItemKey, { at: string; summary: string; changedSections: string[] }>>;
  ratedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/** An item on an idea page: a saved idea or a backend project. */
export type BoardItemKey = `idea:${string}` | `project:${string}`;

export type IdeaDraft = Pick<Idea, "title" | "description" | "problem" | "solution" | "targetUsers" | "openQuestions">;

export type ProjectSectionKey =
  | "overview"
  | "problem"
  | "solution"
  | "goals"
  | "techStack"
  | "architecture"
  | "resources";

export type Project = {
  id: string;
  ideaId: string | null;
  title: string;
  sections: Record<ProjectSectionKey, string>;
  createdAt: string;
  updatedAt: string;
};

export type TimelineItemKind = "task" | "milestone";
export type TaskPriority = "low" | "normal" | "high";

export type TimelineItem = {
  id: string;
  kind: TimelineItemKind;
  title: string;
  notes: string;
  projectId: string | null;
  dueDate: ISODate;
  priority: TaskPriority;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
};

export type TimelineItemDraft = Pick<TimelineItem, "kind" | "title" | "notes" | "projectId" | "dueDate" | "priority">;

export type ChatRole = "user" | "veya";
export type ChatMessageStatus = "sending" | "sent" | "failed";

export type ChatMessage = {
  id: string;
  role: ChatRole;
  text: string;
  status: ChatMessageStatus;
  error: string | null;
  createdAt: string;
  /** Set once the user has saved this message as an idea. */
  savedIdeaId: string | null;
  /** On Veya's "project ready" message: the saved backend project to open. */
  projectId?: string | null;
};
