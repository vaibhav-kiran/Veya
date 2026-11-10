/**
 * Types mirroring the Veya FastAPI backend's Pydantic schemas
 * (gnani/services/conversation_manager/schemas.py and
 * gnani/services/project_store/schemas.py). Keep them in sync.
 */

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
};
