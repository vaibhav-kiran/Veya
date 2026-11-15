import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppText } from "@/components/AppText";
import { Icon } from "@/components/Icon";
import { MonthCalendar, type DayMarker } from "@/components/MonthCalendar";
import { PressableScale } from "@/components/PressableScale";
import { ScreenBackground } from "@/components/ScreenBackground";
import {
  DayTimeline,
  ProgressRing,
  ProjectProgress,
  StatChips,
  projectHealth,
  weekStart,
} from "@/components/timeline/TimelineParts";
import { Group, Row, SectionHeader, TABULAR } from "@/components/ui/Grouped";
import { haptics } from "@/lib/haptics";
import { useProjectsStore } from "@/stores/projectsStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { colors, fontFamilies, screenGutter, shadows, spacing } from "@/theme";
import type { ISODate, TimelineItem } from "@/types/models";
import { addDays, formatLongDate, formatShortDate, fromISODate, monthOf, todayISO } from "@/utils/date";

const COMING_UP_LIMIT = 8;

function daysBetween(from: ISODate, to: ISODate): number {
  return Math.round((fromISODate(to).getTime() - fromISODate(from).getTime()) / 86_400_000);
}

function dayName(date: ISODate, today: ISODate): string {
  const diff = daysBetween(today, date);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return formatLongDate(date);
}

/**
 * Calendar tab: how today is going (a progress ring and quick numbers), the
 * month calendar, the chosen day as a timeline you tick off, what's coming
 * up, and every project's progress against its deadline.
 */
export default function TimelineScreen() {
  const router = useRouter();
  const itemsById = useWorkspaceStore((state) => state.items);
  const toggleItemCompleted = useWorkspaceStore((state) => state.toggleItemCompleted);
  const updateItem = useWorkspaceStore((state) => state.updateItem);
  const projects = useProjectsStore((state) => state.summaries);
  const refreshProjects = useProjectsStore((state) => state.refresh);

  const today = todayISO();
  const [selectedDate, setSelectedDate] = useState<ISODate>(today);
  const [month, setMonth] = useState(() => monthOf(today));

  // Project deadlines live on the backend; refresh whenever the tab is shown.
  useFocusEffect(
    useCallback(() => {
      void refreshProjects();
    }, [refreshProjects]),
  );

  const items = useMemo(
    () =>
      Object.values(itemsById).sort(
        (a, b) => a.dueDate.localeCompare(b.dueDate) || Number(b.kind === "milestone") - Number(a.kind === "milestone"),
      ),
    [itemsById],
  );
  const deadlines = useMemo(
    () =>
      projects
        .filter((project): project is typeof project & { deadline_date: string } => Boolean(project.deadline_date))
        .sort((a, b) => a.deadline_date.localeCompare(b.deadline_date)),
    [projects],
  );

  const markers = useMemo(() => {
    const result: Record<ISODate, DayMarker> = {};
    for (const item of items) {
      if (item.completed) continue;
      const marker = result[item.dueDate] ?? { tasks: 0, milestones: 0, overdue: false };
      result[item.dueDate] = {
        tasks: marker.tasks + (item.kind === "task" ? 1 : 0),
        milestones: marker.milestones + (item.kind === "milestone" ? 1 : 0),
        overdue: marker.overdue || item.dueDate < today,
      };
    }
    for (const project of deadlines) {
      const marker = result[project.deadline_date] ?? { tasks: 0, milestones: 0, overdue: false };
      result[project.deadline_date] = { ...marker, deadlines: (marker.deadlines ?? 0) + 1 };
    }
    return result;
  }, [items, deadlines, today]);

  // ---- numbers ----
  const todayItems = items.filter((item) => item.dueDate === today);
  const todayDone = todayItems.filter((item) => item.completed).length;
  const overdue = items.filter((item) => !item.completed && item.dueDate < today);
  const thisWeekStart = weekStart(today);
  const thisWeek = items.filter((item) => item.dueDate >= thisWeekStart && item.dueDate <= addDays(thisWeekStart, 6));
  const thisWeekDone = thisWeek.filter((item) => item.completed).length;
  const dueSoon = deadlines.filter((project) => {
    const days = daysBetween(today, project.deadline_date);
    return days >= 0 && days <= 7;
  }).length;
  const nextUp = items.find((item) => !item.completed && item.dueDate >= today);

  // ---- the chosen day ----
  const agenda = items.filter((item) => item.dueDate === selectedDate);
  const deadlinesOnDay = deadlines.filter((project) => project.deadline_date === selectedDate);

  // ---- coming up, grouped like a planner ----
  const comingUp = items.filter((item) => !item.completed && item.dueDate > today).slice(0, COMING_UP_LIMIT);
  const groups = [
    { title: "Tomorrow", items: comingUp.filter((item) => daysBetween(today, item.dueDate) === 1) },
    { title: "This week", items: comingUp.filter((item) => daysBetween(today, item.dueDate) > 1 && item.dueDate <= addDays(thisWeekStart, 6)) },
    { title: "Later", items: comingUp.filter((item) => item.dueDate > addDays(thisWeekStart, 6)) },
  ].filter((group) => group.items.length);

  // ---- projects ----
  const projectRows = [...deadlines, ...projects.filter((project) => !project.deadline_date)].map((project) => {
    const tasks = items.filter((item) => item.projectId === project.project_id);
    const done = tasks.filter((item) => item.completed).length;
    const days = project.deadline_date ? daysBetween(today, project.deadline_date) : null;
    const countdown =
      days === null ? null : days > 1 ? `${days} days left` : days === 1 ? "Due tomorrow" : days === 0 ? "Due today" : `${-days} days late`;
    return {
      project,
      done,
      total: tasks.length,
      countdown,
      health: projectHealth(done, tasks.length, project.created_at, project.deadline_date ?? null, today),
    };
  });

  const projectTitle = (item: TimelineItem) =>
    item.projectId ? projects.find((project) => project.project_id === item.projectId)?.title : undefined;
  const editItem = (item: TimelineItem) => router.push({ pathname: "/item-editor", params: { id: item.id } });
  const addItem = () => router.push({ pathname: "/item-editor", params: { date: selectedDate } });
  const openProjectTimeline = (id: string) => router.push({ pathname: "/project-timeline", params: { projectId: id } });

  const selectDate = (date: ISODate) => {
    setSelectedDate(date);
    setMonth(monthOf(date));
  };
  const moveOverdueToToday = () => {
    haptics.success();
    for (const item of overdue) {
      updateItem(item.id, {
        kind: item.kind,
        title: item.title,
        notes: item.notes,
        projectId: item.projectId,
        dueDate: today,
        priority: item.priority,
      });
    }
  };

  const empty = items.length === 0 && projects.length === 0;
  const todayShare = todayItems.length ? todayDone / todayItems.length : 0;

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* ---- header ---- */}
          <View style={styles.header}>
            <View style={styles.headerText}>
              <AppText variant="bodySmall" tone="secondary">
                {formatLongDate(today)}
              </AppText>
              <AppText style={styles.title} accessibilityRole="header">
                Timeline
              </AppText>
            </View>
            {selectedDate !== today ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Jump to today"
                hitSlop={8}
                onPress={() => {
                  haptics.selection();
                  selectDate(today);
                }}
                style={styles.pill}
              >
                <AppText variant="bodySmall" style={styles.pillLabel}>
                  Today
                </AppText>
              </Pressable>
            ) : null}
          </View>

          {/* ---- today at a glance ---- */}
          <Group>
            <View style={styles.todayCard}>
              <ProgressRing progress={todayShare} size={68} stroke={6}>
                <AppText variant="bodyMedium" style={[styles.ringValue, TABULAR]}>
                  {todayItems.length ? `${Math.round(todayShare * 100)}%` : "–"}
                </AppText>
              </ProgressRing>
              <View style={styles.todayText}>
                <AppText variant="h4" style={styles.strong}>
                  {todayItems.length
                    ? todayDone === todayItems.length
                      ? "Today is done"
                      : `${todayDone} of ${todayItems.length} done today`
                    : "Nothing due today"}
                </AppText>
                <AppText variant="bodySmall" tone="muted" numberOfLines={2}>
                  {nextUp
                    ? `Next: ${nextUp.title}${nextUp.dueDate !== today ? ` · ${formatShortDate(nextUp.dueDate)}` : ""}`
                    : empty
                      ? "Add tasks, or plan a project, and they show up here."
                      : "All caught up."}
                </AppText>
              </View>
            </View>
          </Group>
          <View style={styles.chipsWrap}>
            <StatChips
              stats={[
                { label: "Overdue", value: String(overdue.length), tone: overdue.length ? colors.semantic.error : undefined },
                { label: "This week", value: thisWeek.length ? `${thisWeekDone}/${thisWeek.length}` : "0" },
                { label: "Deadlines in 7 days", value: String(dueSoon) },
                { label: "Projects", value: String(projects.length) },
              ]}
            />
          </View>

          {/* ---- the month ---- */}
          <SectionHeader title="Calendar" />
          <Group>
            <View style={styles.month}>
              <MonthCalendar month={month} onMonthChange={setMonth} selectedDate={selectedDate} onSelectDate={selectDate} markers={markers} />
            </View>
          </Group>

          {/* ---- overdue ---- */}
          {overdue.length ? (
            <>
              <SectionHeader title={`Overdue · ${overdue.length}`} action="Move all to today" onAction={moveOverdueToToday} />
              <Group>
                <View style={styles.dayCard}>
                  <DayTimeline
                    items={overdue}
                    projectTitle={projectTitle}
                    today={today}
                    onToggle={(item) => toggleItemCompleted(item.id)}
                    onOpen={editItem}
                  />
                </View>
              </Group>
            </>
          ) : null}

          {/* ---- the chosen day ---- */}
          <SectionHeader title={dayName(selectedDate, today)} action="Add" onAction={addItem} />
          <Group>
            {deadlinesOnDay.map((project) => (
              <Row
                key={project.project_id}
                title={project.title}
                subtitle="Project deadline"
                onPress={() => openProjectTimeline(project.project_id)}
                leading={<Icon name="flag" size={15} color={colors.semantic.error} />}
                trailing={<Icon name="chevronRight" size={13} color={colors.text.muted} />}
              />
            ))}
            {agenda.length ? (
              <View style={styles.dayCard}>
                <DayTimeline
                  items={agenda}
                  projectTitle={projectTitle}
                  today={today}
                  onToggle={(item) => toggleItemCompleted(item.id)}
                  onOpen={editItem}
                />
              </View>
            ) : (
              <Row
                title={selectedDate === today ? "Nothing planned today" : "Nothing planned"}
                subtitle="Tap to add a task or milestone"
                onPress={addItem}
                leading={<Icon name="plus" size={15} color={colors.text.muted} />}
              />
            )}
          </Group>

          {/* ---- coming up ---- */}
          {groups.map((group) => (
            <View key={group.title}>
              <SectionHeader title={group.title} />
              <Group>
                {group.items.map((item) => (
                  <Row
                    key={item.id}
                    title={item.title}
                    subtitle={[formatShortDate(item.dueDate), item.kind === "milestone" ? "Milestone" : null, projectTitle(item) ?? null].filter(Boolean).join(" · ")}
                    onPress={() => {
                      haptics.selection();
                      selectDate(item.dueDate);
                    }}
                    leading={
                      <View style={[styles.bullet, item.kind === "milestone" && styles.bulletMilestone, item.priority === "high" && styles.bulletHigh]} />
                    }
                  />
                ))}
              </Group>
            </View>
          ))}

          {/* ---- projects ---- */}
          {projectRows.length ? (
            <>
              <SectionHeader title="Projects" />
              <Group>
                {projectRows.map(({ project, done, total, countdown, health }) => (
                  <ProjectProgress
                    key={project.project_id}
                    title={project.title}
                    done={done}
                    total={total}
                    countdown={countdown}
                    health={health}
                    onPress={() => openProjectTimeline(project.project_id)}
                  />
                ))}
              </Group>
            </>
          ) : null}
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
          <Icon name="plus" size={24} color={colors.text.inverse} weight="medium" />
        </PressableScale>
      </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { paddingHorizontal: screenGutter, paddingTop: spacing[2], paddingBottom: 120 },
  header: { flexDirection: "row", alignItems: "flex-end", gap: spacing[3], marginBottom: spacing[5] },
  headerText: { flex: 1, gap: 2 },
  title: { fontFamily: fontFamilies.bold, fontSize: 30, lineHeight: 35, letterSpacing: -0.6, color: colors.text.primary },
  pill: { paddingHorizontal: spacing[3], paddingVertical: 6, borderRadius: 999, backgroundColor: colors.overlay.lavenderSoft },
  pillLabel: { fontFamily: fontFamilies.medium, color: colors.text.primary },
  strong: { fontFamily: fontFamilies.semibold, color: colors.text.primary },
  todayCard: { flexDirection: "row", alignItems: "center", gap: spacing[4], padding: spacing[4] },
  todayText: { flex: 1, gap: 4 },
  ringValue: { fontFamily: fontFamilies.semibold, color: colors.text.primary },
  chipsWrap: { marginTop: spacing[3] },
  month: { padding: spacing[3] },
  dayCard: { paddingHorizontal: spacing[4], paddingVertical: spacing[4] },
  bullet: { width: 8, height: 8, borderRadius: 4, borderWidth: 1.5, borderColor: colors.text.muted },
  bulletMilestone: { borderRadius: 2, transform: [{ rotate: "45deg" }], borderColor: colors.veya.lavender },
  bulletHigh: { borderColor: colors.semantic.warning },
  fab: {
    position: "absolute",
    right: screenGutter,
    bottom: spacing[5],
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.veya.lavender,
    boxShadow: shadows.fab,
  },
});
