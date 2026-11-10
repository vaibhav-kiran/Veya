/**
 * Innovator — the research-driven idea discovery service, reached through the
 * Veya backend at /innovator/*. Shapes mirror veya-idea-engine's API (only
 * the fields the app uses are typed).
 */

export type InnovatorProjectType =
  | "hackathon"
  | "final_year_project"
  | "academic_mini_project"
  | "research_project"
  | "startup_concept"
  | "personal_learning";

export type InnovatorProfile = {
  academic_field?: string;
  academic_level?: string;
  interests?: string[];
  technical_skills?: string[];
  preferred_domains?: string[];
  available_hardware?: string[];
  budget?: string;
  deadline?: string;
  team_size?: number;
  project_type?: InnovatorProjectType;
  constraints?: string[];
};

export type DiscoveryStatusName = "created" | "running" | "completed" | "failed";

export type DiscoveryStart = {
  session_id: string;
  status: DiscoveryStatusName;
  missing_fields: string[];
  clarifying_questions: string[];
  assumptions: string[];
};

export type DiscoveryStatus = {
  session_id: string;
  status: DiscoveryStatusName;
  stage: string;
  progress: number;
  counts: Record<string, number>;
  warnings: string[];
  error: string | null;
};

export type EvidenceRef = {
  evidence_id: string;
  title: string;
  url: string;
  source_type: string;
  published_date?: string | null;
};

export type Claim = {
  statement: string;
  status: string;
  evidence_ids: string[];
};

export type CandidateIdea = {
  idea_id: string;
  title: string;
  problem_statement: string;
  target_users: string[];
  proposed_solution: string;
  technical_approach: string;
  existing_solutions: string[];
  identified_gap: string;
  differentiator: string;
  supporting_claims: Claim[];
  required_technologies: string[];
  hardware_requirements: string[];
  estimated_budget: string;
  estimated_timeline: string;
  prototype_scope: string;
  risks: string[];
  assumptions: string[];
  revision: number;
  supporting_evidence: EvidenceRef[];
};

export type Feasibility = {
  verdict: "feasible" | "stretch" | "not_feasible";
  feasibility_score: number;
  minimum_credible_demo: string;
  exclude_from_prototype: string[];
  skills_to_learn: string[];
  blockers: string[];
  dataset_availability: string;
};

export type Similarity = {
  label: string;
  label_text: string;
  closest_matches: { evidence: EvidenceRef; lexical_overlap: number }[];
  differences: string[];
  explanation: string;
};

export type ScoreBreakdown = {
  criterion: string;
  score_0_10: number;
  weight: number;
  contribution: number;
  basis: string;
};

export type EvaluatedIdea = {
  idea: CandidateIdea;
  feasibility: Feasibility | null;
  similarity: Similarity | null;
  critique: { verdict: string; strongest_rejection_reason: string; issues: string[] } | null;
  status: "candidate" | "selected" | "rejected";
  rejection_reason: string | null;
  score: number | null;
  score_breakdown: ScoreBreakdown[];
  selection_reason: string | null;
};

export type DiscoveryResults = {
  session_id: string;
  status: DiscoveryStatusName;
  assumptions: string[];
  recommended_ideas: EvaluatedIdea[];
  rejected_ideas: EvaluatedIdea[];
  problems: { problem_id: string; problem_title: string; description: string; independent_source_count: number }[];
  gaps: { gap_id: string; gap_title: string; status: string; evidence_strength: string }[];
  evidence: EvidenceRef[];
  warnings: string[];
  disclaimer: string;
};
