import { StyleSheet, View } from "react-native";

import { colors, fontFamilies, radii, spacing, themed } from "@/theme";
import type { IdeaStatus } from "@/types/models";

import { AppText } from "./AppText";

type ChipTone = "accent" | "warning" | "success" | "info" | "error" | "neutral" | "streak";

const toneStyles: Record<ChipTone, { color: string; background: string }> = {
  accent: { color: colors.veya.lavender, background: themed("rgba(196, 181, 253, 0.12)") },
  warning: { color: colors.semantic.warning, background: "rgba(255, 200, 0, 0.12)" },
  success: { color: colors.semantic.success, background: "rgba(33, 193, 107, 0.12)" },
  info: { color: colors.semantic.info, background: "rgba(77, 139, 255, 0.12)" },
  error: { color: colors.semantic.error, background: colors.overlay.errorSoft },
  streak: { color: colors.semantic.streak, background: "rgba(255, 138, 0, 0.12)" },
  neutral: { color: colors.text.secondary, background: themed("rgba(161, 161, 170, 0.12)") },
};

/** Text label + tinted pill. The label always carries the meaning, never colour alone. */
export function Chip({ label, tone = "neutral" }: { label: string; tone?: ChipTone }) {
  const palette = toneStyles[tone];
  return (
    <View style={[styles.chip, { backgroundColor: palette.background }]}>
      <View style={[styles.dot, { backgroundColor: palette.color }]} />
      <AppText variant="caption" style={[styles.label, { color: palette.color }]}>
        {label}
      </AppText>
    </View>
  );
}

const IDEA_STATUS: Record<IdeaStatus, { label: string; tone: ChipTone }> = {
  new: { label: "New", tone: "warning" },
  reviewing: { label: "Reviewing", tone: "info" },
  selected: { label: "Selected", tone: "accent" },
  converted: { label: "Project", tone: "success" },
};

export function IdeaStatusChip({ status }: { status: IdeaStatus }) {
  const { label, tone } = IDEA_STATUS[status];
  return <Chip label={label} tone={tone} />;
}

export const ideaStatusLabel = (status: IdeaStatus) => IDEA_STATUS[status].label;

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 5,
    paddingHorizontal: spacing[2] + 2,
    paddingVertical: 3,
    borderRadius: radii.full,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  label: { fontFamily: fontFamilies.medium, letterSpacing: 0.3 },
});
