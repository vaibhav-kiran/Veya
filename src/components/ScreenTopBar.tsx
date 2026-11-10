import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { screenGutter, spacing } from "@/theme";

import { AppText } from "./AppText";
import { IconButton } from "./IconButton";

type ScreenTopBarProps = {
  title?: string;
  onBack?: () => void;
  backIcon?: "chevronLeft" | "close";
  backLabel?: string;
  right?: ReactNode;
};

/** Compact navigation bar for pushed screens and modals. */
export function ScreenTopBar({ title, onBack, backIcon = "chevronLeft", backLabel = "Go back", right }: ScreenTopBarProps) {
  return (
    <View style={styles.bar}>
      <View style={styles.side}>{onBack ? <IconButton icon={backIcon} accessibilityLabel={backLabel} onPress={onBack} /> : null}</View>
      {title ? (
        <AppText variant="h4" numberOfLines={1} accessibilityRole="header" style={styles.title}>
          {title}
        </AppText>
      ) : (
        <View style={styles.title} />
      )}
      <View style={[styles.side, styles.right]}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: screenGutter,
    gap: spacing[2],
  },
  side: { minWidth: 40 },
  right: { alignItems: "flex-end" },
  title: { flex: 1, textAlign: "center" },
});
