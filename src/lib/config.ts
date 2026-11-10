/**
 * Public, client-safe configuration. `EXPO_PUBLIC_*` values are bundled into
 * the app binary — never place secrets here.
 */
const clerkPublishableKey = (process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "").trim();

/**
 * Clerk publishable keys look like `pk_test_<base64>` / `pk_live_<base64>`,
 * where the base64 part decodes to the Frontend API host followed by `$`.
 * Checking this up front avoids a crash inside ClerkProvider on a bad key.
 */
function isValidClerkPublishableKey(key: string): boolean {
  const match = /^pk_(test|live)_([A-Za-z0-9+/=_-]+)$/.exec(key);
  if (!match) return false;
  try {
    return atob(match[2]).endsWith("$");
  } catch {
    return false;
  }
}

/**
 * Development convenience: start every launch/reload on onboarding so it can
 * be reviewed quickly. Production builds show onboarding only once.
 * Set to `false` to use the normal first-run-only behaviour in development too.
 */
export const SHOW_ONBOARDING_ON_EVERY_LAUNCH = __DEV__;

export const appConfig = {
  clerkPublishableKey,
  clerkKeyStatus: !clerkPublishableKey
    ? "missing"
    : isValidClerkPublishableKey(clerkPublishableKey)
      ? "valid"
      : "invalid",
  /** Base URL of the Veya FastAPI backend (gnani/), e.g. http://localhost:8000. */
  veyaApiUrl: process.env.EXPO_PUBLIC_VEYA_API_URL ?? "",
} as const;
