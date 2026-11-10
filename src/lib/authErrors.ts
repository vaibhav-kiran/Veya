import { isClerkAPIResponseError } from "@clerk/expo";

type ErrorLike = { message?: unknown; longMessage?: unknown; code?: unknown };

/**
 * Turns Clerk errors into short, user-facing copy. Never include passwords or
 * tokens in messages or logs.
 */
export function describeAuthError(error: unknown): string {
  if (isClerkAPIResponseError(error)) {
    const first = error.errors[0];
    if (first) return friendlyByCode(first.code) ?? first.longMessage ?? first.message;
  }
  if (error && typeof error === "object") {
    const { code, longMessage, message } = error as ErrorLike;
    if (typeof code === "string") {
      const friendly = friendlyByCode(code);
      if (friendly) return friendly;
    }
    if (typeof longMessage === "string" && longMessage) return longMessage;
    if (typeof message === "string" && message) return message;
  }
  return "Something went wrong. Please try again.";
}

function friendlyByCode(code: string): string | undefined {
  switch (code) {
    case "form_password_incorrect":
      return "That password doesn't match this account.";
    case "form_identifier_not_found":
      return "We couldn't find an account with that email.";
    case "form_identifier_exists":
      return "An account with this email already exists. Try signing in.";
    case "form_password_pwned":
      return "This password has appeared in a data breach. Please choose a different one.";
    case "form_code_incorrect":
      return "That code isn't right. Check your email and try again.";
    case "verification_expired":
      return "That code has expired. Request a new one.";
    case "too_many_requests":
      return "Too many attempts. Please wait a moment and try again.";
    case "network_error":
      return "Couldn't connect. Check your internet connection.";
    default:
      return undefined;
  }
}
