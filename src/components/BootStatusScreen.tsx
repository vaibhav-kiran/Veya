import { ActivityIndicator, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors, radii, screenGutter, spacing } from "@/theme";

import { AppText } from "./AppText";
import { Icon } from "./Icon";
import { ScreenBackground } from "./ScreenBackground";
import { VeyaLogo } from "./VeyaLogo";

export type BootStep = { label: string; done: boolean };

/**
 * Shown when startup takes unusually long, instead of leaving the splash
 * screen up indefinitely. Lists which step is still pending.
 */
export function BootStatusScreen({ steps }: { steps: BootStep[] }) {
  const waitingOnAuth = steps.some((step) => step.label === "Account service" && !step.done);
  return (
    <ScreenBackground>
      <SafeAreaView style={styles.safe}>
        <VeyaLogo size="medium" showTagline />
        <View style={styles.card} accessibilityLiveRegion="polite">
          <View style={styles.titleRow}>
            <ActivityIndicator color={colors.veya.lavender} />
            <AppText variant="h3">Still getting ready…</AppText>
          </View>
          {steps.map((step) => (
            <View key={step.label} style={styles.step}>
              <Icon name={step.done ? "checkCircle" : "clock"} size={18} color={step.done ? colors.semantic.success : colors.text.secondary} />
              <AppText variant="bodyMedium" tone={step.done ? "secondary" : "primary"}>
                {step.label} — {step.done ? "ready" : "waiting"}
              </AppText>
            </View>
          ))}
          {waitingOnAuth ? (
            <AppText variant="bodySmall" tone="secondary">
              Veya can&apos;t reach its account service. Check your internet connection — Veya will continue automatically once it connects.
            </AppText>
          ) : null}
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
  titleRow: { flexDirection: "row", alignItems: "center", gap: spacing[3] },
  step: { flexDirection: "row", alignItems: "center", gap: spacing[2] },
});
