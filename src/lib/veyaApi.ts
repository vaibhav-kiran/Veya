import { ApiError, BackendNotConfiguredError, NetworkError, TimeoutError } from "@/lib/api/client";

/**
 * Service boundary for the Veya FastAPI backend. Endpoint calls live in
 * `src/lib/api/`; this module turns their errors into messages for people.
 */
export * from "@/lib/api/client";
export * as conversationApi from "@/lib/api/conversation";
export * as chatApi from "@/lib/api/chat";
export * as projectsApi from "@/lib/api/projects";
export * as planApi from "@/lib/api/plan";

export function describeApiError(error: unknown): string {
  if (error instanceof BackendNotConfiguredError) {
    return "Veya's AI service isn't set up in this build. Set EXPO_PUBLIC_VEYA_API_URL and restart the app.";
  }
  if (error instanceof TimeoutError) {
    return "Veya is taking too long to answer. Please try again.";
  }
  if (error instanceof NetworkError || error instanceof TypeError) {
    return "Couldn't reach Veya. Check your connection and that the Veya server is running.";
  }
  if (error instanceof ApiError) {
    if (error.status >= 500 && !error.detail) return "Veya ran into a problem. Please try again.";
    // The backend's `detail` is written for users (see gnani errors.py).
    return error.detail;
  }
  return "Something went wrong while talking to Veya. Please try again.";
}

/** The conversation is gone on the server (expired or server restarted). */
export function isConversationGone(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}
