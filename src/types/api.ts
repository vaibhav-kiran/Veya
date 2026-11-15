/**
 * Types mirroring the Veya FastAPI backend's Pydantic schemas
 * (gnani/services/conversation_manager/schemas.py and
 * gnani/services/project_store/schemas.py). Keep them in sync.
 */

import type { AiModel } from "@/constants/aiModels";

export type ConversationStatus =
  | "created"
  | "collecting_information"
  | "awaiting_confirmation"
  | "ready_to_generate"
  | "generating_project"
  | "completed"
  | "cancelled"
  | "error";

export type ConversationAction =
  | "ask_question"
  | "provide_guidance"
  | "update_information"
  | "request_clarification"
  | "summarise"
  | "request_confirmation"
  | "generate_project"
  | "cancel_conversation";

/** Languages the backend can translate to and speak (SUPPORTED_OUTPUT_LANGUAGES). */
export type BackendLanguage =
  | "English"
  | "Hindi"
  | "Tamil"
  | "Telugu"
  | "Kannada"
  | "Malayalam"
  | "Bengali"
  | "Marathi"
  | "Gujarati"
  | "Punjabi";

export type ProjectDetails = {
  initial_idea: string | null;
  problem_statement: string | null;
  proposed_solution: string | null;
  project_type: string | null;
  target_users: string[] | null;
  expected_outcome: string | null;
  deadline: string | null;
  available_time: string | null;
  team_size: string | null;
  preferred_technologies: string[] | null;
  technical_skills: string[] | null;
  available_hardware: string[] | null;
  available_software: string[] | null;
  budget: string | null;
  preferred_features: string[] | null;
  constraints: string[] | null;
  recommendations_requested: string[] | null;
  veya_recommendations: string[] | null;
  additional_instructions: string[] | null;
};

/** Idea Check: shown with the summary, before the plan. Links come from GitHub / Devpost. */
export type SimilarProject = {
  id: string;
  source: "github" | "devpost";
  title: string;
  description: string;
  url: string;
  stars: number | null;
  winner: boolean | null;
  overlap: number;
};

export type StandOutAngle = { title: string; description: string; why: string };

export type IdeaCheck = {
  idea: string;
  label: "strongly_differentiated" | "potentially_differentiated" | "significant_existing_overlap" | "insufficient_evidence";
  label_text: string;
  explanation: string;
  similar_projects: SimilarProject[];
  angles: StandOutAngle[];
  feasibility: { verdict: "feasible" | "stretch" | "not_feasible"; reason: string; smaller_version: string };
  hackathon_fit: string;
  warnings: string[];
};

/** How to build after Idea Check: as it is, with angle N, or the smaller version. */
export type IdeaChoice = "as_is" | "smaller" | `angle:${0 | 1 | 2}`;

export type ConversationTurnResponse = {
  session_id: string;
  status: ConversationStatus;
  message: string;
  next_action: ConversationAction | null;
  transcript: string | null;
  detected_language: string | null;
  audio_available: boolean;
  audio_error: string | null;
  project_details: ProjectDetails;
  skipped_fields: string[];
  /** After the third fixed answer: call POST /conversation/{id}/summary next. */
  summary_pending: boolean;
  idea_check?: IdeaCheck | null;
};

export type ProjectGenerationResult = {
  project_name: string;
  response: string;
  readme_markdown: string;
  readme_filename: string | null;
  workflow_diagram: string | null;
  image_generation_available: boolean;
  perception_input: string;
  perception: Record<string, unknown>;
};

export type ConfirmConversationResponse = {
  session_id: string;
  status: ConversationStatus;
  result: ProjectGenerationResult;
  project_id: string | null;
};

export type PublicMessage = {
  role: "user" | "assistant";
  text: string;
  timestamp: string;
  message_type: string | null;
};

export type ConversationStateResponse = {
  session_id: string;
  status: ConversationStatus;
  preferred_language: string;
  project_details: ProjectDetails;
  skipped_fields: string[];
  messages: PublicMessage[];
  generation_result: ProjectGenerationResult | null;
  project_id: string | null;
  last_error: string | null;
};

export type CancelConversationResponse = {
  session_id: string;
  status: ConversationStatus;
};

export type ProjectSections = {
  overview: string;
  problem: string;
  solution: string;
  goals: string;
  tech_stack: string;
  architecture: string;
  resources: string;
};

export type ProjectSource = "conversation" | "manual";

/** One phase of the plan from today to the deadline (gnani/services/project_store/timeline.py). */
export type TimelinePhase = {
  name: string;
  days: number;
  /** ISO dates, `YYYY-MM-DD`. */
  start_date: string;
  end_date: string;
  focus: string[];
};

export type ProjectTimeline = {
  start_date: string;
  deadline_date: string;
  total_days: number;
  phases: TimelinePhase[];
};

export type StoredProject = {
  project_id: string;
  title: string;
  source: ProjectSource;
  sections: ProjectSections;
  created_at: string;
  updated_at: string;
  session_id: string | null;
  project_details: ProjectDetails | null;
  plan_response: string;
  readme_markdown: string;
  readme_filename: string | null;
  workflow_diagram: string | null;
  image_url: string | null;
  image_generation_available: boolean;
  /** The plan was changed by voice or text, and that change can be undone. */
  can_undo_edit?: boolean;
  /** `YYYY-MM-DD`, from what the user said or set in the app. */
  deadline_date: string | null;
  timeline: ProjectTimeline | null;
};

export type ProjectSummary = {
  project_id: string;
  title: string;
  source: ProjectSource;
  created_at: string;
  updated_at: string;
  has_readme: boolean;
  has_diagram: boolean;
  image_url: string | null;
  deadline_date: string | null;
};

export type ProjectListResponse = { projects: ProjectSummary[] };

export type ProjectImageResponse = { project_id: string; image_url: string; filename: string };

export type CreateProjectRequest = { title: string; sections?: Partial<ProjectSections> };

/** `deadline_date`: a `YYYY-MM-DD` date to set it, `null` to clear it, omitted to leave it. */
export type UpdateProjectRequest = { title?: string; sections?: Partial<ProjectSections>; deadline_date?: string | null };

export type PlanName = "free" | "paid";

/** GET /plan — the user's plan and what it includes (gnani/webapp/plan_routes.py). */
export type PlanResponse = {
  plan: PlanName;
  label: string;
  entitlements: { image_generation: boolean; max_projects: number | null };
  projects_used: number;
};

/** POST /chat/start and /chat/{id}/message (gnani/services/chat_manager/schemas.py). */
export type ChatTurnResponse = {
  session_id: string;
  status: ConversationStatus;
  message: string;
  next_action: ConversationAction | null;
  project_details: ProjectDetails;
  skipped_fields: string[];
  idea_check?: IdeaCheck | null;
};

// ---------------------------------------------------------------------------
// Idea pages (/boards): what a page is for, and how its ideas rate.
// ---------------------------------------------------------------------------

export type BoardPurpose = "hackathon" | "college_project" | "startup" | "personal" | "other";

export type BoardCriterion = { name: string; description: string; weight: number | null };

export type BoardContext = {
  purpose: BoardPurpose;
  name: string;
  url: string;
  summary: string;
  themes: string[];
  tracks: string[];
  judging_criteria: BoardCriterion[];
  /** "official": from the hackathon's own pages; "typical": usual criteria. */
  criteria_source: "official" | "typical";
  dates: string;
  prizes: string;
  rules: string[];
  sources: { title: string; url: string }[];
  /** False: the hackathon couldn't be identified online. */
  found: boolean;
  warnings: string[];
  notes: string;
};

export type IdeaRating = {
  idea_id: string;
  /** 0-100, weighted from the criterion scores. */
  total: number;
  scores: { criterion: string; score: number; reason: string }[];
  verdict: string;
  strengths: string[];
  risks: string[];
  improvements: string[];
  other_uses: string[];
};

export type BoardRating = {
  /** Best first. */
  ratings: IdeaRating[];
  best_idea_id: string | null;
  best_reason: string;
};

/** POST /projects/{id}/edit — change the plan by voice or text. */
export type EditProjectRequest = {
  instruction: string;
  model: AiModel;
  /** For Veya's short reply; the plan stays in English. */
  language: string;
};

export type EditProjectResponse = {
  project: StoredProject;
  /** What Veya changed, or a question when it wasn't sure. */
  summary: string;
  changed: boolean;
  changed_sections: string[];
};

/** POST /boards/improve: changes that make one idea or project a stronger fit. */
export type Improvement = {
  title: string;
  detail: string;
  helps_with: string;
  /** The similar existing project (from the Idea Check) this makes it better than. */
  beats: string;
};

export type ImprovePlan = {
  summary: string;
  changes: Improvement[];
  /** The same changes as one request for the plan editor (POST /projects/{id}/edit). */
  instruction: string;
};
