import type {
  CreateProjectRequest,
  ProjectImageResponse,
  ProjectListResponse,
  StoredProject,
  UpdateProjectRequest,
} from "@/types/api";

import { apiRequest, apiRequestText, apiUrl } from "./client";

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
