import { Pressable, StyleSheet, View } from "react-native";

import { haptics } from "@/lib/haptics";
import { colors, fontFamilies, spacing, themed } from "@/theme";
import type { ISODate } from "@/types/models";
import {
  WEEKDAY_LABELS,
  buildMonthGrid,
  formatLongDate,
  formatMonthYear,
  shiftMonth,
  todayISO,
  type MonthCursor,
} from "@/utils/date";

import { AppText } from "./AppText";
import { IconButton } from "./IconButton";

/** `deadlines`: project deadlines due that day (shown as a red dot). */
export type DayMarker = { tasks: number; milestones: number; overdue: boolean; deadlines?: number };

type MonthCalendarProps = {
  month: MonthCursor;
  onMonthChange: (month: MonthCursor) => void;
  selectedDate: ISODate;
  onSelectDate: (date: ISODate) => void;
  markers?: Record<ISODate, DayMarker>;
};

/** Month grid from the calendar reference: today ring, selected glow and per-day dots. */
export function MonthCalendar({ month, onMonthChange, selectedDate, onSelectDate, markers = {} }: MonthCalendarProps) {
  const weeks = buildMonthGrid(month);
  const today = todayISO();

  return (
    <View>
      <View style={styles.header}>
        <IconButton icon="chevronLeft" variant="plain" size={36} accessibilityLabel="Previous month" onPress={() => onMonthChange(shiftMonth(month, -1))} />
        <AppText variant="h3" accessibilityRole="header" accessibilityLiveRegion="polite">
          {formatMonthYear(month)}
        </AppText>
        <IconButton icon="chevronRight" variant="plain" size={36} accessibilityLabel="Next month" onPress={() => onMonthChange(shiftMonth(month, 1))} />
      </View>

      <View style={styles.week}>
        {WEEKDAY_LABELS.map((label) => (
          <AppText key={label} variant="bodySmall" tone="secondary" align="center" style={styles.cell}>
            {label}
          </AppText>
        ))}
      </View>

      {weeks.map((week) => (
        <View key={week[0].iso} style={styles.week}>
          {week.map((day) => {
            const selected = day.iso === selectedDate;
            const isToday = day.iso === today;
            const marker = markers[day.iso];
            const count = marker ? marker.tasks + marker.milestones : 0;
            const deadlines = marker?.deadlines ?? 0;
            return (
              <Pressable
                key={day.iso}
                accessibilityRole="button"
                accessibilityLabel={`${formatLongDate(day.iso)}${isToday ? ", today" : ""}${deadlines ? `, ${deadlines} project deadline${deadlines > 1 ? "s" : ""}` : ""}${count ? `, ${count} item${count > 1 ? "s" : ""}` : ""}`}
                accessibilityState={{ selected }}
                onPress={() => {
                  haptics.selection();
                  if (!day.inMonth) onMonthChange(shiftMonth(month, day.iso < selectedDate ? -1 : 1));
                  onSelectDate(day.iso);
                }}
                style={styles.cell}
              >
                <View style={[styles.day, isToday && styles.today, selected && styles.selected]}>
                  <AppText
                    variant="bodyLarge"
                    tone={day.inMonth ? "primary" : "muted"}
                    style={(selected || isToday) && styles.dayStrong}
                  >
                    {day.day}
                  </AppText>
                </View>
                <View style={styles.dots}>
                  {deadlines > 0 ? <View style={styles.deadlineDot} /> : null}
                  {marker && marker.milestones > 0 ? <View style={[styles.dot, styles.milestoneDot]} /> : null}
                  {marker && marker.tasks > 0 ? (
                    <View style={[styles.dot, marker.overdue ? styles.overdueDot : styles.taskDot]} />
                  ) : null}
                  {marker && marker.tasks > 1 ? <View style={[styles.dot, styles.taskDot]} /> : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing[2] },
  week: { flexDirection: "row" },
  cell: { flex: 1, alignItems: "center", paddingVertical: 3 },
  day: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  today: { borderWidth: 1, borderColor: colors.overlay.lavenderBorder },
  selected: {
    backgroundColor: themed("rgba(124, 58, 237, 0.55)"),
    borderWidth: 1.5,
    borderColor: colors.veya.lavender,
    boxShadow: themed("0px 0px 16px rgba(196, 181, 253, 0.6)"),
  },
  dayStrong: { fontFamily: fontFamilies.semibold },
  dots: { flexDirection: "row", gap: 3, height: 6, marginTop: 2 },
  dot: { width: 5, height: 5, borderRadius: 3 },
  taskDot: { backgroundColor: colors.veya.violet },
  milestoneDot: { backgroundColor: colors.veya.lavender, borderRadius: 1, transform: [{ rotate: "45deg" }] },
  overdueDot: { backgroundColor: colors.semantic.error },
  deadlineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.semantic.error,
    boxShadow: "0px 0px 6px rgba(255, 77, 79, 0.8)",
  },
});
