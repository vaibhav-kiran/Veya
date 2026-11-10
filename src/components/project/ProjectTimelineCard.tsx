import { StyleSheet, View } from "react-native";

import { colors, fontFamilies, gradients, radii, spacing, themed } from "@/theme";
import type { ProjectTimeline } from "@/types/api";
import { formatLongDate, formatShortDate, fromISODate, todayISO } from "@/utils/date";

import { AppText } from "../AppText";
import { Button } from "../Button";
import { Icon } from "../Icon";

/** Purple shades for the phase bar, cycling for long plans. */
const PHASE_SHADES = [themed("#C4B5FD"), themed("#A78BFA"), themed("#8B5CF6"), themed("#7C3AED"), themed("#6D28D9"), themed("#5B21B6"), themed("#4C1D95")];

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((fromISODate(toIso).getTime() - fromISODate(fromIso).getTime()) / 86_400_000);
}

function dateRange(start: string, end: string): string {
  return start === end ? formatShortDate(start) : `${formatShortDate(start)} – ${formatShortDate(end)}`;
}

type ProjectTimelineCardProps = {
  timeline: ProjectTimeline | null;
  /** What the user originally said ("this weekend"), shown when no date could be read from it. */
  deadlineSaid: string | null;
  onEditDeadline: () => void;
  onAddToCalendar: () => void;
  phasesInCalendar: boolean;
};

/** Deadline countdown and a day-by-day phase plan (e.g. 2 days UI, 1 day auth). */
export function ProjectTimelineCard({ timeline, deadlineSaid, onEditDeadline, onAddToCalendar, phasesInCalendar }: ProjectTimelineCardProps) {
  if (!timeline) {
    return (
      <View style={[styles.card, styles.emptyCard]}>
        <View style={styles.emptyIcon}>
          <Icon name="calendar" size={18} color={colors.veya.lavender} />
        </View>
        <View style={styles.flex}>
          <AppText variant="h4">No deadline yet</AppText>
          <AppText variant="bodySmall" tone="secondary">
            {deadlineSaid
              ? `You said “${deadlineSaid}”. Pick the date and Veya will plan the days for you.`
              : "Set a deadline and Veya will split the time into phases for you."}
          </AppText>
        </View>
        <Button label="Set" size="small" variant="secondary" icon="calendar" iconPosition="left" onPress={onEditDeadline} />
      </View>
    );
  }

  const today = todayISO();
  const daysLeft = daysBetween(today, timeline.deadline_date);
  const countdown =
    daysLeft > 1 ? `${daysLeft} days left` : daysLeft === 1 ? "Due tomorrow" : daysLeft === 0 ? "Due today" : `${-daysLeft} days overdue`;
  const urgent = daysLeft <= 1;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.flex}>
          <AppText variant="eyebrow" tone="accent">
            Deadline
          </AppText>
          <AppText variant="h3">{formatLongDate(timeline.deadline_date)}</AppText>
        </View>
        <View style={[styles.countdown, urgent ? styles.countdownUrgent : styles.countdownNormal]}>
          <AppText style={[styles.countdownText, urgent && styles.countdownTextUrgent]}>{countdown}</AppText>
        </View>
      </View>

      {/* Proportional bar: one segment per phase. */}
      <View style={styles.bar} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {timeline.phases.map((phase, index) => (
          <View
            key={phase.name}
            style={[styles.barSegment, { flex: phase.days, backgroundColor: PHASE_SHADES[index % PHASE_SHADES.length] }]}
          />
        ))}
      </View>

      <View style={styles.phases}>
        {timeline.phases.map((phase, index) => {
          const done = phase.end_date < today;
          const current = phase.start_date <= today && today <= phase.end_date;
          return (
            <View
              key={phase.name}
              style={[styles.phase, current && styles.phaseCurrent, done && styles.phaseDone]}
              accessibilityLabel={`${phase.name}, ${phase.days} ${phase.days === 1 ? "day" : "days"}, ${dateRange(phase.start_date, phase.end_date)}${current ? ", in progress" : done ? ", done" : ""}`}
            >
              <View style={[styles.phaseDot, { backgroundColor: PHASE_SHADES[index % PHASE_SHADES.length] }]}>
                {done ? <Icon name="check" size={10} color={colors.text.inverse} weight="semibold" /> : null}
              </View>
              <View style={styles.flex}>
                <View style={styles.phaseTitleRow}>
                  <AppText variant="h4" style={styles.flex} numberOfLines={2}>
                    {phase.name}
                  </AppText>
                  {current ? (
                    <View style={styles.nowChip}>
                      <AppText style={styles.nowText}>Now</AppText>
                    </View>
                  ) : null}
                </View>
                <AppText variant="bodySmall" tone="accent" style={styles.phaseMeta}>
                  {phase.days} {phase.days === 1 ? "day" : "days"} · {dateRange(phase.start_date, phase.end_date)}
                </AppText>
                {phase.focus.map((item) => (
                  <AppText key={item} variant="bodySmall" tone="secondary">
                    • {item}
                  </AppText>
                ))}
              </View>
            </View>
          );
        })}
      </View>

      <View style={styles.actions}>
        <Button
          label={phasesInCalendar ? "In your calendar" : "Add phases to calendar"}
          size="small"
          variant="secondary"
          icon={phasesInCalendar ? "check" : "calendar"}
          iconPosition="left"
          disabled={phasesInCalendar}
          onPress={onAddToCalendar}
          style={styles.flex}
        />
        <Button label="Change date" size="small" variant="ghost" onPress={onEditDeadline} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: {
    marginTop: spacing[4],
    gap: spacing[4],
    padding: spacing[5],
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: themed("rgba(196, 181, 253, 0.2)"),
    backgroundColor: colors.veya.surface,
  },
  emptyCard: { flexDirection: "row", alignItems: "center", gap: spacing[3], padding: spacing[4] },
  emptyIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.overlay.lavenderSoft,
  },
  header: { flexDirection: "row", alignItems: "center", gap: spacing[3] },
  countdown: { paddingHorizontal: spacing[3], paddingVertical: 6, borderRadius: radii.full },
  countdownNormal: { backgroundImage: gradients.primaryButton },
  countdownUrgent: { backgroundColor: colors.overlay.errorSoft, borderWidth: 1, borderColor: "rgba(255, 77, 79, 0.45)" },
  countdownText: { fontFamily: fontFamilies.semibold, fontSize: 12, lineHeight: 16, color: colors.text.inverse },
  countdownTextUrgent: { color: colors.semantic.error },
  bar: { flexDirection: "row", height: 8, borderRadius: 4, overflow: "hidden", gap: 2 },
  barSegment: { height: 8 },
  phases: { gap: spacing[2] },
  phase: {
    flexDirection: "row",
    gap: spacing[3],
    padding: spacing[3],
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: "transparent",
  },
  phaseCurrent: { borderColor: themed("rgba(196, 181, 253, 0.45)"), backgroundColor: themed("rgba(124, 58, 237, 0.12)") },
  phaseDone: { opacity: 0.55 },
  phaseDot: { width: 18, height: 18, borderRadius: 9, marginTop: 2, alignItems: "center", justifyContent: "center" },
  phaseTitleRow: { flexDirection: "row", alignItems: "center", gap: spacing[2] },
  phaseMeta: { marginTop: 1, marginBottom: 2, fontFamily: fontFamilies.medium },
  nowChip: { paddingHorizontal: spacing[2], paddingVertical: 2, borderRadius: radii.full, backgroundColor: colors.veya.lavender },
  nowText: { fontFamily: fontFamilies.semibold, fontSize: 11, lineHeight: 14, color: colors.text.inverse },
  actions: { flexDirection: "row", alignItems: "center", gap: spacing[2] },
});
