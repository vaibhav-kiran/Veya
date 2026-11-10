import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { spacing } from "@/theme";

import { AppText } from "./AppText";

type ScreenHeaderProps = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  /** Element placed to the right of the eyebrow row (e.g. an icon button). */
  accessory?: ReactNode;
};

/** "YOUR TIMELINE / Stay on track." header pattern from the calendar and settings references. */
export function ScreenHeader({ eyebrow, title, subtitle, accessory }: ScreenHeaderProps) {
  return (
    <View style={styles.container}>
      {eyebrow || accessory ? (
        <View style={styles.topRow}>
          {eyebrow ? (
            <AppText variant="eyebrow" tone="secondary">
              {eyebrow}
            </AppText>
          ) : (
            <View />
          )}
          {accessory}
        </View>
      ) : null}
      <AppText variant="h1" accessibilityRole="header" style={styles.title}>
        {title}
      </AppText>
      {subtitle ? (
        <AppText variant="bodyLarge" tone="secondary">
          {subtitle}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing[1] },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 40 },
  title: { marginTop: spacing[1] },
});
