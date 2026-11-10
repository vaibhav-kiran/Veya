import { StyleSheet, View } from "react-native";

import { colors, radii, spacing } from "@/theme";
import type { Idea } from "@/types/models";
import { formatRelativeDay } from "@/utils/date";

import { AppText } from "./AppText";
import { Icon } from "./Icon";
import { PressableScale } from "./PressableScale";
import { IdeaStatusChip, ideaStatusLabel } from "./StatusChip";

type IdeaListItemProps = {
  idea: Idea;
  onPress: () => void;
};

export function IdeaListItem({ idea, onPress }: IdeaListItemProps) {
  const summary = idea.description || idea.problem || "No description yet.";
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`${idea.title}. ${ideaStatusLabel(idea.status)}. Updated ${formatRelativeDay(idea.updatedAt)}`}
      accessibilityHint="Opens the idea review"
      onPress={onPress}
      pressedScale={0.98}
      style={styles.card}
    >
      <View style={styles.top}>
        <IdeaStatusChip status={idea.status} />
        <AppText variant="caption" tone="muted">
          {formatRelativeDay(idea.updatedAt)}
        </AppText>
      </View>
      <AppText variant="h4" numberOfLines={2}>
        {idea.title}
      </AppText>
      <View style={styles.bottom}>
        <AppText variant="bodySmall" tone="secondary" numberOfLines={2} style={styles.summary}>
          {summary}
        </AppText>
        <Icon name="chevronRight" size={14} color={colors.text.muted} />
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing[2],
    padding: spacing[4],
    borderRadius: radii.lg + 2,
    borderWidth: 1,
    borderColor: colors.veya.border,
    backgroundColor: colors.veya.surface,
  },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  bottom: { flexDirection: "row", alignItems: "center", gap: spacing[3] },
  summary: { flex: 1 },
});
