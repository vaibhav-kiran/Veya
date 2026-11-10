/**
 * Auth hooks used across the app, backed by Clerk. Screens import from here
 * rather than from `@clerk/expo` directly so the auth provider stays swappable.
 */
export { useAuth, useUser } from "@clerk/expo";
