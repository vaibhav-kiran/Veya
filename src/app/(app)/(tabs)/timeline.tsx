import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { GlassCard } from "@/components/GlassCard";
import { Icon } from "@/components/Icon";
import { MonthCalendar, type DayMarker } from "@/components/MonthCalendar";
import { PressableScale } from "@/components/PressableScale";
import { ScreenBackground } from "@/components/ScreenBackground";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Chip } from "@/components/StatusChip";
import { TimelineItemRow, timelineItemState } from "@/components/TimelineItemRow";
import { haptics } from "@/lib/haptics";
import { useProjectsStore } from "@/stores/projectsStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { colors, fontFamilies, radii, screenGutter, shadows, spacing, themed } from "@/theme";
import type { ProjectSummary } from "@/types/api";
import type { ISODate, TimelineItem } from "@/types/models";
import { formatLongDate, formatShortDate, monthOf, todayISO } from "@/utils/date";

const UPCOMING_LIMIT = 3;

/** 06-calander.png — month view, upcoming deadlines and the selected day's agenda. */
export default function TimelineScreen() {
  const router = useRouter();
  const itemsById = useWorkspaceStore((state) => state.items);
  const projects = useProjectsStore((state) => state.summaries);
  const refreshProjects = useProjectsStore((state) => state.refresh);
  const toggleItemCompleted = useWorkspaceStore((state) => state.toggleItemCompleted);

  const today = todayISO();
  const [selectedDate, setSelectedDate] = useState<ISODate>(today);
  const [month, setMonth] = useState(() => monthOf(today));

  // Project deadlines live on the backend; refresh whenever the tab is shown.
  useFocusEffect(
    useCallback(() => {
      void refreshProjects();
    }, [refreshProjects]),
  );

  const items = Object.values(itemsById).sort(
    (a, b) => a.dueDate.localeCompare(b.dueDate) || Number(b.kind === "milestone") - Number(a.kind === "milestone"),
  );
  const markers = items.reduce<Record<ISODate, DayMarker>>((acc, item) => {
    if (item.completed) return acc;
    const marker = acc[item.dueDate] ?? { tasks: 0, milestones: 0, overdue: false };
    acc[item.dueDate] = {
      tasks: marker.tasks + (item.kind === "task" ? 1 : 0),
      milestones: marker.milestones + (item.kind === "milestone" ? 1 : 0),
      overdue: marker.overdue || item.dueDate < today,
    };
    return acc;
  }, {});

  // Project deadlines get a red dot on their day.
  const deadlines = projects
    .filter((project): project is ProjectSummary & { deadline_date: string } => Boolean(project.deadline_date))
    .sort((a, b) => a.deadline_date.localeCompare(b.deadline_date));
  for (const project of deadlines) {
    const marker = markers[project.deadline_date] ?? { tasks: 0, milestones: 0, overdue: false };
    markers[project.deadline_date] = { ...marker, deadlines: (marker.deadlines ?? 0) + 1 };
  }
  const deadlinesToday = deadlines.filter((project) => project.deadline_date === selectedDate);
  // Every project, soonest deadline first; projects without one at the end.
  const projectList = [...deadlines, ...projects.filter((project) => !project.deadline_date)];
  const openTimeline = (id: string) => router.push({ pathname: "/project-timeline", params: { projectId: id } });
  const overdue = items.filter((item) => timelineItemState(item) === "overdue");
  const upcoming = items.filter((item) => !item.completed && item.dueDate >= today).slice(0, UPCOMING_LIMIT);
  const agenda = items.filter((item) => item.dueDate === selectedDate);

  const projectTitle = (item: TimelineItem) =>
    item.projectId ? projects.find((project) => project.project_id === item.projectId)?.title : undefined;
  const editItem = (id: string) => router.push({ pathname: "/item-editor", params: { id } });
  const addItem = () => router.push({ pathname: "/item-editor", params: { date: selectedDate } });

  const jumpToToday = () => {
    setSelectedDate(today);
    setMonth(monthOf(today));
  };

  return (
    <ScreenBackground glow="top">
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <ScreenHeader
            eyebrow="Your timeline"
            title="Stay on track."
            subtitle="Every idea deserves a deadline."
            accessory={
              selectedDate !== today ? (
                <Pressable accessibilityRole="button" accessibilityLabel="Jump to today" onPress={jumpToToday} hitSlop={8} style={styles.todayPill}>
                  <AppText variant="bodySmall" tone="accent" style={styles.todayLabel}>
                    Today
                  </AppText>
                </Pressable>
              ) : undefined
            }
          />

          <GlassCard style={styles.calendar}>
            <MonthCalendar month={month} onMonthChange={setMonth} selectedDate={selectedDate} onSelectDate={setSelectedDate} markers={markers} />
          </GlassCard>

          {items.length === 0 && projects.length === 0 ? (
            <View style={styles.emptyCard}>
              <Icon name="calendar" size={22} color={colors.veya.lavender} />
              <AppText variant="h4" align="center">
                Your timeline is clear
              </AppText>
              <AppText variant="bodySmall" tone="secondary" align="center">
                Add tasks and milestones — or turn an idea into a project and plan it there. They&apos;ll show up here.
              </AppText>
            </View>
          ) : null}

          {projectList.length > 0 ? (
            <Section title="Projects">
              {projectList.map((project) => (
                <ProjectRow key={project.project_id} project={project} today={today} onPress={() => openTimeline(project.project_id)} />
              ))}
            </Section>
          ) : null}

          {overdue.length > 0 ? (
            <Section title={`Overdue · ${overdue.length}`} tone="error">
              {overdue.map((item) => (
                <TimelineItemRow key={item.id} item={item} projectTitle={projectTitle(item)} showDate onToggle={() => toggleItemCompleted(item.id)} onPress={() => editItem(item.id)} />
              ))}
            </Section>
          ) : null}

          {upcoming.length > 0 ? (
            <Section title="Upcoming">
              {upcoming.map((item, index) => (
                <UpcomingRow
                  key={item.id}
                  item={item}
                  projectTitle={projectTitle(item)}
                  isLast={index === upcoming.length - 1}
                  onPress={() => {
                    haptics.selection();
                    setSelectedDate(item.dueDate);
                    setMonth(monthOf(item.dueDate));
                  }}
                />
              ))}
            </Section>
          ) : null}

          <Section title={formatLongDate(selectedDate)}>
            {deadlinesToday.map((project) => (
              <ProjectRow key={project.project_id} project={project} today={today} onPress={() => openTimeline(project.project_id)} />
            ))}
            {agenda.length || deadlinesToday.length ? (
              agenda.map((item) => (
                <TimelineItemRow key={item.id} item={item} projectTitle={projectTitle(item)} onToggle={() => toggleItemCompleted(item.id)} onPress={() => editItem(item.id)} />
              ))
            ) : (
              <View style={styles.dayEmpty}>
                <AppText variant="bodyMedium" tone="secondary">
                  Nothing scheduled{selectedDate === today ? " today" : ""}.
                </AppText>
                <Button label="Add task" size="small" variant="ghost" icon="plus" iconPosition="left" onPress={addItem} />
              </View>
            )}
          </Section>
        </ScrollView>

        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={`Add task or milestone on ${formatLongDate(selectedDate)}`}
          onPress={() => {
            haptics.light();
            addItem();
          }}
          pressedScale={0.92}
          style={styles.fab}
        >
          <Icon name="plus" size={26} color={colors.text.primary} weight="medium" />
        </PressableScale>
      </SafeAreaView>
    </ScreenBackground>
  );
}

function Section({ title, tone = "secondary", children }: { title: string; tone?: "secondary" | "error"; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <AppText variant="eyebrow" tone={tone} accessibilityRole="header">
        {title}
      </AppText>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function daysUntil(today: ISODate, date: ISODate): number {
  const [y1, m1, d1] = today.split("-").map(Number);
  const [y2, m2, d2] = date.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

/** A project with its deadline countdown (red flag) — opens the project's timeline page. */
function ProjectRow({ project, today, onPress }: { project: ProjectSummary; today: ISODate; onPress: () => void }) {
  const deadline = project.deadline_date;
  const days = deadline ? daysUntil(today, deadline) : null;
  const countdown =
    days === null ? null : days > 1 ? `in ${days} days` : days === 1 ? "tomorrow" : days === 0 ? "today" : `${-days} days ago`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={deadline ? `${project.title}, due ${formatShortDate(deadline)}, ${countdown}` : `${project.title}, no deadline yet`}
      accessibilityHint="Opens the project's timeline"
      onPress={() => {
        haptics.selection();
        onPress();
      }}
      style={({ pressed }) => [styles.deadline, pressed && styles.pressed]}
    >
      <View style={[styles.deadlineIcon, deadline ? styles.deadlineIconDue : styles.deadlineIconEmpty]}>
        <Icon name={deadline ? "flag" : "calendar"} size={14} color={deadline ? colors.text.primary : colors.text.muted} />
      </View>
      <View style={styles.upcomingBody}>
        <AppText variant="bodyLarge" numberOfLines={1} style={styles.upcomingTitle}>
          {project.title}
        </AppText>
        <AppText variant="bodySmall" tone="secondary" numberOfLines={1}>
          {deadline ? `Deadline · ${formatShortDate(deadline)}` : "No deadline yet"}
        </AppText>
      </View>
      {countdown ? <Chip label={countdown} tone={days !== null && days <= 1 ? "error" : "accent"} /> : null}
      <Icon name="chevronRight" size={16} color={colors.text.muted} />
    </Pressable>
  );
}

/** Upcoming deadline with the connected-dot rail from the reference. */
function UpcomingRow({ item, projectTitle, isLast, onPress }: { item: TimelineItem; projectTitle?: string; isLast: boolean; onPress: () => void }) {
  const heading = projectTitle ?? item.title;
  const detail = projectTitle ? item.title : item.kind === "milestone" ? "Milestone" : "Task";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${heading}, ${formatShortDate(item.dueDate)}, ${detail}`}
      accessibilityHint="Shows this day on the calendar"
      onPress={onPress}
      style={({ pressed }) => [styles.upcoming, pressed && styles.pressed]}
    >
      <View style={styles.rail}>
        <View style={[styles.railDot, item.kind === "milestone" ? styles.railDotMilestone : null]} />
        {!isLast ? <View style={styles.railLine} /> : null}
      </View>
      <View style={styles.upcomingBody}>
        <AppText variant="bodyLarge" numberOfLines={1} style={styles.upcomingTitle}>
          {heading.toUpperCase()}
        </AppText>
        <AppText variant="bodySmall" tone="secondary" numberOfLines={1}>
          {formatShortDate(item.dueDate)} · {detail}
        </AppText>
      </View>
      {item.kind === "milestone" ? <Chip label="Milestone" tone="accent" /> : item.priority === "high" ? <Chip label="Priority" tone="streak" /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { paddingHorizontal: screenGutter, paddingTop: spacing[2], paddingBottom: 120 },
  todayPill: {
    minHeight: 32,
    justifyContent: "center",
    paddingHorizontal: spacing[3],
    borderRadius: radii.full,
    backgroundColor: colors.overlay.lavenderSoft,
  },
  todayLabel: { fontFamily: fontFamilies.semibold },
  calendar: { marginTop: spacing[5], padding: spacing[3] },
  emptyCard: {
    marginTop: spacing[5],
    alignItems: "center",
    gap: spacing[2],
    padding: spacing[5],
    borderRadius: radii.lg + 2,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.overlay.borderStrong,
  },
  section: { marginTop: spacing[6], gap: spacing[2] },
  sectionBody: { gap: spacing[1] },
  dayEmpty: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing[3], paddingVertical: spacing[2] },
  upcoming: { flexDirection: "row", alignItems: "center", gap: spacing[3], minHeight: 52 },
  deadline: { flexDirection: "row", alignItems: "center", gap: spacing[3], minHeight: 56 },
  deadlineIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  deadlineIconDue: { backgroundColor: colors.semantic.error, boxShadow: "0px 0px 10px rgba(255, 77, 79, 0.45)" },
  deadlineIconEmpty: { backgroundColor: colors.overlay.surfaceRaised },
  pressed: { opacity: 0.7 },
  rail: { width: 14, alignSelf: "stretch", alignItems: "center", paddingTop: 8 },
  railDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: colors.veya.violet },
  railDotMilestone: { backgroundColor: colors.veya.lavender, boxShadow: themed("0px 0px 10px rgba(196, 181, 253, 0.7)") },
  railLine: { flex: 1, width: 1.5, marginTop: 3, marginBottom: -12, backgroundColor: colors.overlay.borderStrong },
  upcomingBody: { flex: 1, gap: 1 },
  upcomingTitle: { fontFamily: fontFamilies.medium, letterSpacing: 0.2 },
  fab: {
    position: "absolute",
    right: screenGutter,
    bottom: spacing[5],
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.overlay.lavenderBorder,
    backgroundColor: themed("#2A2240"),
    boxShadow: shadows.fab,
  },
});
