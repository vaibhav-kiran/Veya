import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import Svg, { Circle } from "react-native-svg";

import { haptics } from "@/lib/haptics";
import { colors, fontFamilies, spacing } from "@/theme";
import type { ISODate, TimelineItem } from "@/types/models";
import { addDays, formatShortDate, fromISODate } from "@/utils/date";

import { AppText } from "../AppText";
import { Icon } from "../Icon";
import { GROUP_BG, HAIRLINE, PRESSED_BG, TABULAR } from "../ui/Grouped";

// ---------------------------------------------------------------------------
// Progress ring
// ---------------------------------------------------------------------------

/** A circular progress ring (0–1). */
export function ProgressRing({
  progress,
  size = 64,
  stroke = 6,
  color = colors.veya.lavender,
  children,
}: {
  progress: number;
  size?: number;
  stroke?: number;
  color?: string;
  children?: React.ReactNode;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const value = Math.max(0, Math.min(1, progress));
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={HAIRLINE} strokeWidth={stroke} fill="none" />
        {value > 0 ? (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={color}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={circumference * (1 - value)}
            // Start at 12 o'clock.
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        ) : null}
      </Svg>
      {children ? <View style={styles.ringCenter}>{children}</View> : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Weeks
// ---------------------------------------------------------------------------

/** Monday of the week that contains `date`. */
export function weekStart(date: ISODate): ISODate {
  const day = fromISODate(date).getDay(); // 0 = Sunday
  return addDays(date, day === 0 ? -6 : 1 - day);
}

// ---------------------------------------------------------------------------
// Day timeline
// ---------------------------------------------------------------------------

/**
 * A day's tasks on a vertical rail (like a day planner). Tap the circle to
 * complete a task, tap the row to edit it.
 */
export function DayTimeline({
  items,
  projectTitle,
  today,
  onToggle,
  onOpen,
  showDate = false,
}: {
  items: TimelineItem[];
  projectTitle: (item: TimelineItem) => string | undefined;
  today: ISODate;
  /** Show each item's date (for lists that span several days). */
  showDate?: boolean;
  onToggle: (item: TimelineItem) => void;
  onOpen: (item: TimelineItem) => void;
}) {
  return (
    <View>
      {items.map((item, index) => {
        const last = index === items.length - 1;
        const overdue = !item.completed && item.dueDate < today;
        const project = projectTitle(item);
        const meta = [showDate ? formatShortDate(item.dueDate) : null, item.kind === "milestone" ? "Milestone" : null, project ?? null, item.priority === "high" ? "High priority" : null, overdue ? "Overdue" : null]
          .filter(Boolean)
          .join(" · ");
        return (
          <View key={item.id} style={styles.slot}>
            <View style={styles.rail}>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: item.completed }}
                accessibilityLabel={`${item.completed ? "Completed" : "Complete"} ${item.title}`}
                hitSlop={10}
                onPress={() => {
                  if (item.completed) haptics.selection();
                  else haptics.success();
                  onToggle(item);
                }}
                style={[
                  styles.check,
                  item.kind === "milestone" && styles.checkMilestone,
                  item.completed && styles.checkDone,
                  overdue && styles.checkOverdue,
                ]}
              >
                {item.completed ? (
                  <View style={item.kind === "milestone" ? styles.unrotate : undefined}>
                    <Icon name="check" size={11} color={colors.text.inverse} weight="semibold" />
                  </View>
                ) : null}
              </Pressable>
              {last ? null : <View style={styles.railLine} />}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${item.title}${meta ? `, ${meta}` : ""}`}
              accessibilityHint="Edit"
              onPress={() => onOpen(item)}
              style={({ pressed }) => [styles.slotBody, pressed && styles.pressed, !last && styles.slotGap]}
            >
              <AppText variant="bodyMedium" numberOfLines={2} style={[styles.slotTitle, item.completed && styles.slotDone]}>
                {item.title}
              </AppText>
              {meta ? (
                <AppText variant="bodySmall" numberOfLines={1} style={overdue ? styles.metaOverdue : styles.meta}>
                  {meta}
                </AppText>
              ) : null}
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Project progress
// ---------------------------------------------------------------------------

export type ProjectHealth = { label: string; color: string };

/**
 * On track when the share of work done keeps up with the share of time used
 * (from when the project was made to its deadline).
 */
export function projectHealth(done: number, total: number, createdAt: string, deadline: ISODate | null, today: ISODate): ProjectHealth {
  if (total > 0 && done === total) return { label: "Done", color: colors.semantic.success };
  if (deadline && deadline < today) return { label: "Past deadline", color: colors.semantic.error };
  if (!total) return { label: "No tasks yet", color: colors.text.muted };
  if (!deadline) return { label: `${Math.round((done / total) * 100)}% done`, color: colors.text.secondary };
  const start = fromISODate(createdAt.slice(0, 10)).getTime();
  const end = fromISODate(deadline).getTime();
  const now = fromISODate(today).getTime();
  const timeUsed = end > start ? Math.max(0, Math.min(1, (now - start) / (end - start))) : 1;
  const workDone = done / total;
  if (workDone >= timeUsed - 0.1) return { label: "On track", color: colors.semantic.success };
  if (workDone >= timeUsed - 0.3) return { label: "At risk", color: colors.semantic.warning };
  return { label: "Behind", color: colors.semantic.error };
}

export function ProjectProgress({
  title,
  done,
  total,
  countdown,
  health,
  onPress,
}: {
  title: string;
  done: number;
  total: number;
  countdown: string | null;
  health: ProjectHealth;
  onPress: () => void;
}) {
  const share = total ? done / total : 0;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${health.label}, ${done} of ${total} done${countdown ? `, ${countdown}` : ""}`}
      accessibilityHint="Opens the project's timeline"
      onPress={() => {
        haptics.selection();
        onPress();
      }}
      style={({ pressed }) => [styles.project, pressed && styles.pressed]}
    >
      <View style={styles.projectHead}>
        <AppText variant="bodyMedium" numberOfLines={1} style={[styles.slotTitle, styles.flex]}>
          {title}
        </AppText>
        {countdown ? (
          <AppText variant="bodySmall" tone="muted" style={TABULAR}>
            {countdown}
          </AppText>
        ) : null}
      </View>
      <View style={styles.bar}>
        <View style={[styles.barFill, { width: `${share * 100}%`, backgroundColor: health.color === colors.text.muted ? colors.veya.lavender : health.color }]} />
      </View>
      <View style={styles.projectFoot}>
        <View style={[styles.dot, { backgroundColor: health.color }]} />
        <AppText variant="caption" style={{ color: health.color }}>
          {health.label}
        </AppText>
        <View style={styles.flex} />
        <AppText variant="caption" tone="muted" style={TABULAR}>
          {done}/{total} tasks
        </AppText>
      </View>
    </Pressable>
  );
}

/** Horizontal chips that scroll: quick numbers at a glance. */
export function StatChips({ stats }: { stats: { label: string; value: string; tone?: string }[] }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
      {stats.map((stat) => (
        <View key={stat.label} style={styles.chip}>
          <AppText variant="bodyMedium" style={[styles.chipValue, TABULAR, stat.tone ? { color: stat.tone } : null]}>
            {stat.value}
          </AppText>
          <AppText variant="caption" tone="muted">
            {stat.label}
          </AppText>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { backgroundColor: PRESSED_BG },
  ringCenter: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" },
  // day timeline
  slot: { flexDirection: "row", gap: spacing[3] },
  rail: { width: 22, alignItems: "center" },
  check: {
    width: 22,
    height: 22,
    borderRadius: 11,
    marginTop: 1,
    borderWidth: 1.5,
    borderColor: colors.text.muted,
    alignItems: "center",
    justifyContent: "center",
  },
  checkMilestone: { borderRadius: 6, transform: [{ rotate: "45deg" }], width: 18, height: 18, marginTop: 3 },
  unrotate: { transform: [{ rotate: "-45deg" }] },
  checkDone: { backgroundColor: colors.veya.lavender, borderColor: colors.veya.lavender },
  checkOverdue: { borderColor: colors.semantic.error },
  railLine: { flex: 1, width: StyleSheet.hairlineWidth, marginTop: 4, backgroundColor: HAIRLINE },
  slotBody: { flex: 1, gap: 2, borderRadius: 8 },
  slotGap: { paddingBottom: spacing[5] },
  slotTitle: { fontFamily: fontFamilies.medium, color: colors.text.primary },
  slotDone: { color: colors.text.muted, textDecorationLine: "line-through" },
  meta: { color: colors.text.muted },
  metaOverdue: { color: colors.semantic.error },
  // projects
  project: { gap: spacing[2], paddingHorizontal: spacing[4], paddingVertical: spacing[3] },
  projectHead: { flexDirection: "row", alignItems: "center", gap: spacing[3] },
  bar: { height: 4, borderRadius: 2, backgroundColor: HAIRLINE, overflow: "hidden" },
  barFill: { height: 4, borderRadius: 2 },
  projectFoot: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  // chips
  chips: { gap: spacing[2] },
  chip: {
    minWidth: 92,
    gap: 2,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: HAIRLINE,
    backgroundColor: GROUP_BG,
  },
  chipValue: { fontFamily: fontFamilies.semibold, color: colors.text.primary },
});
