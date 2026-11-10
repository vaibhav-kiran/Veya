import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { describeAuthError } from "@/lib/authErrors";
import { log, useGoogleSignIn } from "@/lib/googleSignIn";
import { haptics } from "@/lib/haptics";
import { colors, spacing } from "@/theme";

import { AppText } from "./AppText";
import { Button } from "./Button";

type SocialAuthButtonsProps = {
  disabled?: boolean;
  /** Called with true while the provider's browser session is open. */
  onBusyChange: (busy: boolean) => void;
  onError: (message: string | null) => void;
  /** Called once Clerk has activated the new session. */
  onSignedIn: () => void;
};

/**
 * "or" divider plus "Continue with Google" (see src/lib/googleSignIn.ts for the
 * AuthSession flow). Google must be enabled under SSO connections in Clerk.
 */
export function SocialAuthButtons({ disabled, onBusyChange, onError, onSignedIn }: SocialAuthButtonsProps) {
  const signInWithGoogle = useGoogleSignIn();
  const [loading, setLoading] = useState(false);

  const start = async () => {
    if (loading || disabled) return;
    onError(null);
    setLoading(true);
    onBusyChange(true);

    try {
      const outcome = await signInWithGoogle();
      log("outcome:", outcome.status);
      if (outcome.status === "signed-in") {
        haptics.success();
        onSignedIn();
      } else if (outcome.status === "failed") {
        haptics.error();
        onError(outcome.message);
      }
      // "cancelled": the user closed the browser; nothing to report.
    } catch (error) {
      log("failed:", error);
      haptics.error();
      onError(describeAuthError(error));
    } finally {
      setLoading(false);
      onBusyChange(false);
    }
  };

  return (
    <View style={styles.root}>
      <View style={styles.divider} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <View style={styles.line} />
        <AppText variant="caption" tone="muted">
          or
        </AppText>
        <View style={styles.line} />
      </View>
      <Button
        label="Continue with Google"
        variant="secondary"
        accessibilityHint="Opens Google sign-in in a browser window"
        onPress={start}
        loading={loading}
        disabled={disabled && !loading}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing[4] },
  divider: { flexDirection: "row", alignItems: "center", gap: spacing[3] },
  line: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.text.muted, opacity: 0.5 },
});
