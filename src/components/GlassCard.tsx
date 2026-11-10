import type { ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { colors, radii, shadows, spacing } from "@/theme";

/** Translucent dark panel used by the auth form and calendar in the references. */
export function GlassCard({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.xl - 4,
    borderWidth: 1,
    borderColor: colors.overlay.borderStrong,
    backgroundColor: colors.overlay.surfaceGlass,
    padding: spacing[4],
    boxShadow: shadows.card,
  },
});
