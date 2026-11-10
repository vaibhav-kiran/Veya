import { useEffect } from "react";

import { toBackendSections } from "@/constants/projectSections";
import { isBackendConfigured, setApiUser } from "@/lib/veyaApi";
import { useChatStore } from "@/stores/chatStore";
import { useConversationStore } from "@/stores/conversationStore";
import { useProjectsStore } from "@/stores/projectsStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";

let lastUserId: string | null = null;
let migrating = false;

/**
 * Upload projects that were created on this device before projects moved to
 * the backend, then point their ideas and tasks at the new ids. Anything that
 * fails stays in `legacyProjects` and is retried on the next launch.
 */
async function migrateLegacyProjects(): Promise<void> {
  if (migrating || !isBackendConfigured()) return;
  migrating = true;
  try {
    const legacy = Object.values(useWorkspaceStore.getState().legacyProjects);
    for (const project of legacy) {
      try {
        const created = await useProjectsStore
          .getState()
          .create(project.title.trim() || "Untitled project", toBackendSections(project.sections));
        useWorkspaceStore.getState().replaceProjectId(project.id, created.project_id);
      } catch (error) {
        console.warn("[veya] Couldn't upload a project saved on this device; will retry next launch.", error);
      }
    }
  } finally {
    migrating = false;
  }
}

/**
 * Keeps the API client and server-backed caches in step with the signed-in
 * Clerk user, so one account's projects or conversation never show for another.
 */
export function useBackendUser(userId: string | null | undefined): void {
  useEffect(() => {
    const current = userId ?? null;
    setApiUser(current);
    if (current === lastUserId) return;
    lastUserId = current;

    useProjectsStore.getState().reset();
    if (!current) return;
    useConversationStore.getState().claimForUser(current);
    void useConversationStore.getState().resume();
    useChatStore.getState().claimForUser(current);
    void useChatStore.getState().resume();

    void migrateLegacyProjects().then(() => useProjectsStore.getState().refresh());
  }, [userId]);
}
