import type { IconName } from "@/components/Icon";
import type { ProjectSections } from "@/types/api";
import type { ProjectSectionKey } from "@/types/models";

export const PROJECT_SECTIONS: {
  key: ProjectSectionKey;
  /** Field name in the backend's ProjectSections schema. */
  backendKey: keyof ProjectSections;
  label: string;
  icon: IconName;
  placeholder: string;
}[] = [
  { key: "overview", backendKey: "overview", label: "Overview", icon: "idea", placeholder: "What are you building?" },
  { key: "problem", backendKey: "problem", label: "Problem", icon: "target", placeholder: "What problem does it solve?" },
  { key: "solution", backendKey: "solution", label: "Proposed solution", icon: "build", placeholder: "What's the approach?" },
  { key: "goals", backendKey: "goals", label: "Goals & scope", icon: "flag", placeholder: "What's in and out of scope for the first version?" },
  { key: "techStack", backendKey: "tech_stack", label: "Technology stack", icon: "settings", placeholder: "Frameworks, services and tools you'll use" },
  { key: "architecture", backendKey: "architecture", label: "Architecture", icon: "list", placeholder: "How the pieces fit together" },
  { key: "resources", backendKey: "resources", label: "Resources & links", icon: "folder", placeholder: "Docs, references, repos" },
];

export const projectSectionLabel = (key: ProjectSectionKey) =>
  PROJECT_SECTIONS.find((section) => section.key === key)?.label ?? key;

export const backendSectionKey = (key: ProjectSectionKey): keyof ProjectSections =>
  PROJECT_SECTIONS.find((section) => section.key === key)?.backendKey ?? "overview";

/** Local (camelCase) sections to the backend's snake_case shape. */
export function toBackendSections(sections: Partial<Record<ProjectSectionKey, string>>): Partial<ProjectSections> {
  const result: Partial<ProjectSections> = {};
  for (const section of PROJECT_SECTIONS) {
    const value = sections[section.key];
    if (value !== undefined) result[section.backendKey] = value;
  }
  return result;
}
