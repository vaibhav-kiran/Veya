import { useClerk } from "@clerk/expo";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";
import { useAuth } from "@/lib/auth";
import { completeFromDeepLink, log, type SSOOutcome } from "@/lib/googleSignIn";
import { colors, spacing } from "@/theme";

/**
 * Landing route for the Google redirect (`…/sso-callback?rotating_token_nonce=…`).
 * On Android the browser often hands the result back here rather than to the
 * button that opened it, so this finishes the sign-in, then enters the app.
 * On failure it steps back to the login screen, which shows the error.
 */
export default function SSOCallback() {
  const router = useRouter();
  const clerk = useClerk();
  const { isLoaded, isSignedIn } = useAuth();
  const { rotating_token_nonce: nonce } = useLocalSearchParams<{ rotating_token_nonce?: string }>();
  const [canGoBack] = useState(() => router.canGoBack());
  const [outcome, setOutcome] = useState<SSOOutcome | null>(null);

  useEffect(() => {
    if (!isLoaded || isSignedIn) return;
    log("redirect received in the app, nonce:", nonce ? "present" : "missing");
    let active = true;
    void completeFromDeepLink(clerk, nonce ?? "").then((result) => {
      if (active) setOutcome(result);
    });
    return () => {
      active = false;
    };
  }, [clerk, isLoaded, isSignedIn, nonce]);

  // It failed: return to the login screen, which shows the error.
  const leave = !isSignedIn && outcome !== null && outcome.status !== "signed-in";
  useEffect(() => {
    if (leave && canGoBack) router.back();
  }, [canGoBack, leave, router]);

  if (isSignedIn || outcome?.status === "signed-in" || (leave && !canGoBack)) return <Redirect href="/" />;
  return (
    <View style={styles.root}>
      <ActivityIndicator color={colors.veya.lavender} />
      <AppText variant="bodyMedium" tone="secondary">
        Signing you in…
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing[3], backgroundColor: colors.veya.background },
});
