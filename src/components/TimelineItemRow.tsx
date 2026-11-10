import { Pressable, StyleSheet, View } from "react-native";

import { haptics } from "@/lib/haptics";
import { colors, minTouchTarget, spacing } from "@/theme";
import type { TimelineItem } from "@/types/models";
import { formatShortDate, todayISO } from "@/utils/date";

import { AppText } from "./AppText";
import { Icon } from "./Icon";
import { Chip } from "./StatusChip";

type TimelineItemRowProps = {
  item: TimelineItem;
  projectTitle?: string;
  onToggle: () => void;
  onPress: () => void;
  /** Show the due date in the meta line (used outside the day agenda). */
  showDate?: boolean;
};

export function timelineItemState(item: TimelineItem): "completed" | "overdue" | "upcoming" {
  if (item.completed) return "completed";
  return item.dueDate < todayISO() ? "overdue" : "upcoming";
}

/** Task/milestone row from the calendar reference: check circle, title, project meta and status chips. */
export function TimelineItemRow({ item, projectTitle, onToggle, onPress, showDate = false }: TimelineItemRowProps) {
  const state = timelineItemState(item);
  const isMilestone = item.kind === "milestone";
  const meta = [showDate ? formatShortDate(item.dueDate) : null, isMilestone ? "Milestone" : null, projectTitle ?? null]
    .filter(Boolean)
    .join(" · ");

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityLabel={`Mark ${item.title} as ${item.completed ? "not done" : "done"}`}
        accessibilityState={{ checked: item.completed }}
        onPress={() => {
          if (item.completed) haptics.selection();
          else haptics.success();
          onToggle();
        }}
        hitSlop={8}
        style={styles.check}
      >
        <Icon
          name={item.completed ? "checkCircle" : isMilestone ? "flag" : "circle"}
          size={22}
          color={item.completed ? colors.veya.violet : isMilestone ? colors.veya.lavender : colors.text.secondary}
        />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityHint="Edit this item"
        onPress={onPress}
        style={({ pressed }) => [styles.body, pressed && styles.pressed]}
      >
        <View style={styles.titleRow}>
          <AppText
            variant="bodyLarge"
            tone={item.completed ? "muted" : "primary"}
            numberOfLines={2}
            style={[styles.title, item.completed && styles.done]}
          >
            {item.title}
          </AppText>
          {state === "overdue" ? <Chip label="Overdue" tone="error" /> : null}
          {state !== "overdue" && item.priority === "high" && !item.completed ? <Chip label="Priority" tone="streak" /> : null}
        </View>
        {meta ? (
          <AppText variant="bodySmall" tone="secondary" numberOfLines={1}>
            {meta}
          </AppText>
        ) : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start", gap: spacing[2] },
  check: { width: 36, minHeight: minTouchTarget - 8, alignItems: "center", justifyContent: "center" },
  body: { flex: 1, paddingVertical: spacing[2], borderRadius: 8, gap: 2 },
  pressed: { opacity: 0.7 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: spacing[2] },
  title: { flexShrink: 1 },
  done: { textDecorationLine: "line-through" },
});
