import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors, radii, screenGutter, spacing } from "@/theme";

import { AppText } from "./AppText";
import { ScreenBackground } from "./ScreenBackground";
import { VeyaLogo } from "./VeyaLogo";

/**
 * Shown when the Clerk publishable key is missing, instead of crashing inside
 * ClerkProvider. This is a developer configuration problem, not a user state.
 */
type SetupRequiredScreenProps = { reason: "missing" | "invalid"; onReady: () => void };

export function SetupRequiredScreen({ reason, onReady }: SetupRequiredScreenProps) {
  useEffect(() => {
    onReady();
  }, [onReady]);

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.safe}>
        <VeyaLogo size="medium" showTagline />
        <View style={styles.card}>
          <AppText variant="h3">
            {reason === "invalid" ? "Clerk key isn’t valid" : "Authentication isn’t configured"}
          </AppText>
          <AppText variant="bodyMedium" tone="secondary">
            {reason === "invalid"
              ? "The current value isn’t a Clerk publishable key. Copy the real one from Clerk → API keys into "
              : "Add your Clerk publishable key to "}
            <AppText variant="bodyMedium">.env</AppText> in the project root, then restart the dev server with a
            cleared cache:
          </AppText>
          <View style={styles.code}>
            <AppText variant="bodySmall" tone="accent" selectable>
              EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_…
            </AppText>
          </View>
          <AppText variant="bodySmall" tone="muted">
            Restart with: npx expo start --clear. See .env.example. Enable Email + Password in the Clerk dashboard.
          </AppText>
        </View>
      </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, justifyContent: "center", paddingHorizontal: screenGutter, gap: spacing[8] },
  card: {
    gap: spacing[3],
    padding: spacing[5],
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.overlay.borderStrong,
    backgroundColor: colors.overlay.surfaceGlass,
  },
  code: { padding: spacing[3], borderRadius: radii.md, backgroundColor: colors.veya.background },
});
