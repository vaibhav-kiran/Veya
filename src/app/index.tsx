import { useAuth } from "@/lib/auth";
import { Redirect } from "expo-router";

import { usePreferencesStore } from "@/stores/preferencesStore";

/** Entry point: sends the user to the right step of the journey. */
export default function Index() {
  const { isSignedIn } = useAuth();
  const onboardingComplete = usePreferencesStore((state) => state.onboardingComplete);
  const introPending = usePreferencesStore((state) => state.introPending);
  const authEntry = usePreferencesStore((state) => state.authEntry);

  if (introPending) return <Redirect href="/onboarding" />;
  if (isSignedIn) return <Redirect href="/talk" />;
  if (!onboardingComplete) return <Redirect href="/onboarding" />;
  return <Redirect href={authEntry === "sign-up" ? "/sign-up" : "/auth"} />;
}
