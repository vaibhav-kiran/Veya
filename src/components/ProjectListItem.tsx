import { StyleSheet, View } from "react-native";

import { colors, radii, spacing, themed } from "@/theme";
import type { ProjectSummary } from "@/types/api";
import { formatRelativeDay } from "@/utils/date";

import { AppText } from "./AppText";
import { Icon } from "./Icon";
import { PressableScale } from "./PressableScale";

type ProjectListItemProps = {
  project: ProjectSummary;
  onPress: () => void;
};

/** A saved backend project, styled like an idea card. */
export function ProjectListItem({ project, onPress }: ProjectListItemProps) {
  const origin = project.source === "conversation" ? "Planned with Veya" : "From your idea";
  const extras = [project.has_readme ? "README" : null, project.has_diagram ? "Workflow" : null, project.image_url ? "Image" : null]
    .filter(Boolean)
    .join(" · ");
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`${project.title}. ${origin}. Updated ${formatRelativeDay(project.updated_at)}`}
      accessibilityHint="Opens the project"
      onPress={onPress}
      pressedScale={0.98}
      style={styles.card}
    >
      <View style={styles.top}>
        <View style={styles.origin}>
          <Icon name={project.source === "conversation" ? "sparkle" : "folder"} size={12} color={colors.veya.lavender} />
          <AppText variant="caption" tone="accent">
            {origin}
          </AppText>
        </View>
        <AppText variant="caption" tone="muted">
          {formatRelativeDay(project.updated_at)}
        </AppText>
      </View>
      <View style={styles.bottom}>
        <AppText variant="h4" numberOfLines={2} style={styles.title}>
          {project.title}
        </AppText>
        <Icon name="chevronRight" size={14} color={colors.text.muted} />
      </View>
      {extras ? (
        <AppText variant="bodySmall" tone="secondary">
          {extras}
        </AppText>
      ) : null}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing[2],
    padding: spacing[4],
    borderRadius: radii.lg + 2,
    borderWidth: 1,
    borderColor: themed("rgba(196, 181, 253, 0.25)"),
    backgroundColor: themed("rgba(124, 58, 237, 0.10)"),
  },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  origin: { flexDirection: "row", alignItems: "center", gap: 6 },
  bottom: { flexDirection: "row", alignItems: "center", gap: spacing[3] },
  title: { flex: 1 },
});
