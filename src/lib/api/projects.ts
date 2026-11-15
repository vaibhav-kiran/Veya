import type {
  CreateProjectRequest,
  EditProjectRequest,
  EditProjectResponse,
  ProjectImageResponse,
  ProjectListResponse,
  StoredProject,
  UpdateProjectRequest,
} from "@/types/api";

import { apiRequest, apiRequestText, apiUrl } from "./client";

/** The model rewrites whole sections of a long plan: give it time. */
const EDIT_TIMEOUT_MS = 5 * 60_000;

/** Stable Diffusion on a laptop can take minutes. */
const IMAGE_TIMEOUT_MS = 10 * 60_000;

const projectPath = (projectId: string, suffix = "") => `/projects/${encodeURIComponent(projectId)}${suffix}`;

export function listProjects(): Promise<ProjectListResponse> {
  return apiRequest("/projects");
}

export function getProject(projectId: string): Promise<StoredProject> {
  return apiRequest(projectPath(projectId));
}

export function createProject(body: CreateProjectRequest): Promise<StoredProject> {
  return apiRequest("/projects", { method: "POST", json: body });
}

export function updateProject(projectId: string, body: UpdateProjectRequest): Promise<StoredProject> {
  return apiRequest(projectPath(projectId), { method: "PATCH", json: body });
}

export function deleteProject(projectId: string): Promise<void> {
  return apiRequest(projectPath(projectId), { method: "DELETE" });
}

/** Change the plan (README) as the student said or typed. */
export function editProject(projectId: string, body: EditProjectRequest): Promise<EditProjectResponse> {
  return apiRequest(projectPath(projectId, "/edit"), { method: "POST", json: body, timeoutMs: EDIT_TIMEOUT_MS });
}

/** Put the plan back to how it was before the last change. */
export function undoProjectEdit(projectId: string): Promise<StoredProject> {
  return apiRequest(projectPath(projectId, "/edit/undo"), { method: "POST" });
}

export function generateProjectImage(projectId: string): Promise<ProjectImageResponse> {
  return apiRequest(projectPath(projectId, "/generate-image"), { method: "POST", timeoutMs: IMAGE_TIMEOUT_MS });
}

/** The README file served by the backend's download endpoint. */
export function downloadReadme(projectId: string): Promise<string> {
  return apiRequestText(projectPath(projectId, "/readme"));
}

/** Backend-relative asset paths (e.g. `/generated_images/x.png`) as absolute URLs. */
export function assetUrl(path: string): string {
  return /^https?:\/\//.test(path) ? path : apiUrl(path);
}
