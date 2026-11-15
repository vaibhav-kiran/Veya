import { StyleSheet, View } from "react-native";

import { colors, spacing } from "@/theme";
import type { ProjectSummary } from "@/types/api";
import { formatRelativeDay } from "@/utils/date";

import { GROUP_BG, HAIRLINE } from "./ui/Grouped";
import { AppText } from "./AppText";
import { Icon } from "./Icon";
import { PressableScale } from "./PressableScale";

type ProjectListItemProps = {
  project: ProjectSummary;
  onPress: () => void;
  /** Changed from an Analyze folder: shown in the folder's colour. */
  folder?: { name: string; color: string };
};

/** A saved backend project, styled like an idea card. */
export function ProjectListItem({ project, onPress, folder }: ProjectListItemProps) {
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
      style={[styles.card, folder ? { borderColor: folder.color, borderLeftWidth: 4 } : null]}
    >
      <View style={styles.top}>
        <View style={styles.origin}>
          <Icon name={project.source === "conversation" ? "chat" : "folder"} size={12} color={colors.text.muted} />
          <AppText variant="caption" tone="muted">
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
      {folder ? (
        <View style={styles.origin}>
          <View style={[styles.dot, { backgroundColor: folder.color }]} />
          <AppText variant="caption" style={{ color: folder.color }} numberOfLines={1}>
            Improved for {folder.name}
          </AppText>
        </View>
      ) : null}
      {extras ? (
        <AppText variant="bodySmall" tone="secondary">
          {extras}
        </AppText>
      ) : null}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  dot: { width: 8, height: 8, borderRadius: 4 },
  card: {
    gap: spacing[2],
    padding: spacing[4],
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: HAIRLINE,
    backgroundColor: GROUP_BG,
  },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  origin: { flexDirection: "row", alignItems: "center", gap: 6 },
  bottom: { flexDirection: "row", alignItems: "center", gap: spacing[3] },
  title: { flex: 1 },
});
