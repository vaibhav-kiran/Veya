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
  createdAt: string;
  updatedAt: string;
};

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
