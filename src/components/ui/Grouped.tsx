import { createContext, useContext, type ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated from "react-native-reanimated";

import { enterSoft } from "@/lib/softMotion";
import { colors, fontFamilies, spacing, themed } from "@/theme";

import { AppText } from "../AppText";

/**
 * The app's quiet, native building blocks: small uppercase section labels,
 * grouped lists in one rounded container with hairline dividers, and rows.
 * Neutral by default; colour is for meaning only.
 */
/** In the app's colour theme (Violet, Graphite or Emerald), like every other card. */
export const HAIRLINE = themed("rgba(196, 181, 253, 0.12)");
export const GROUP_BG = themed("rgba(22, 20, 36, 0.8)");
export const PRESSED_BG = themed("rgba(196, 181, 253, 0.07)");

/** Plain greys, not tinted by the theme (the Analyze page). */
export const NEUTRAL = {
  hairline: "rgba(255, 255, 255, 0.07)",
  background: "rgba(255, 255, 255, 0.035)",
  pressed: "rgba(255, 255, 255, 0.04)",
} as const;

/** Groups and rows inside use the neutral greys instead of the theme. */
const NeutralTone = createContext(false);
export function NeutralGroups({ children }: { children: ReactNode }) {
  return <NeutralTone.Provider value>{children}</NeutralTone.Provider>;
}
export const RADIUS = 14;
/** Numbers in columns line up. */
export const TABULAR = { fontVariant: ["tabular-nums" as const] };

/** A small section label, with an optional action on the right. */
export function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.sectionHeader}>
      <AppText variant="caption" style={styles.sectionTitle} accessibilityRole="header">
        {title}
      </AppText>
      {action && onAction ? (
        <Pressable accessibilityRole="button" onPress={onAction} hitSlop={10}>
          <AppText variant="caption" style={styles.sectionAction}>
            {action}
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Rows grouped in one rounded container, separated by hairlines. */
export function Group({ children }: { children: ReactNode }) {
  const neutral = useContext(NeutralTone);
  const rows = (Array.isArray(children) ? children : [children]).flat().filter(Boolean);
  return (
    <Animated.View entering={enterSoft} style={[styles.group, neutral && styles.groupNeutral]}>
      {rows.map((row, index) => (
        <View key={index}>
          {index > 0 ? <View style={[styles.divider, neutral && styles.dividerNeutral]} /> : null}
          {row}
        </View>
      ))}
    </Animated.View>
  );
}

/** One row in a Group. */
export function Row({
  title,
  subtitle,
  leading,
  trailing,
  onPress,
  accessibilityLabel,
  numberOfLines = 1,
}: {
  title: string;
  subtitle?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  numberOfLines?: number;
}) {
  const neutral = useContext(NeutralTone);
  const content = (
    <>
      {leading}
      <View style={styles.rowText}>
        <AppText variant="bodyMedium" numberOfLines={numberOfLines} style={styles.rowTitle}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="bodySmall" tone="muted" numberOfLines={2}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {trailing}
    </>
  );
  if (!onPress) return <View style={styles.row}>{content}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && (neutral ? styles.rowPressedNeutral : styles.rowPressed)]}
    >
      {content}
    </Pressable>
  );
}

/** A label for text inside a group ("SUMMARY", "SCORES"). */
export function Label({ children }: { children: string }) {
  return (
    <AppText variant="caption" style={styles.sectionTitle}>
      {children}
    </AppText>
  );
}

const styles = StyleSheet.create({
  sectionHeader: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingHorizontal: spacing[1],
    marginTop: spacing[6],
    marginBottom: spacing[2],
  },
  sectionTitle: { fontFamily: fontFamilies.medium, letterSpacing: 0.4, textTransform: "uppercase", color: colors.text.muted },
  sectionAction: { fontFamily: fontFamilies.medium, color: colors.text.secondary },
  group: { borderRadius: RADIUS, backgroundColor: GROUP_BG, borderWidth: StyleSheet.hairlineWidth, borderColor: HAIRLINE, overflow: "hidden" },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: HAIRLINE, marginLeft: spacing[4] },
  row: { flexDirection: "row", alignItems: "center", gap: spacing[3], minHeight: 56, paddingHorizontal: spacing[4], paddingVertical: spacing[3] },
  rowPressed: { backgroundColor: PRESSED_BG },
  rowPressedNeutral: { backgroundColor: NEUTRAL.pressed },
  groupNeutral: { backgroundColor: NEUTRAL.background, borderColor: NEUTRAL.hairline },
  dividerNeutral: { backgroundColor: NEUTRAL.hairline },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontFamily: fontFamilies.medium, color: colors.text.primary },
});
