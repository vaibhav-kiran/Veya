import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { Icon } from "@/components/Icon";
import { ProjectTimelineCard } from "@/components/project/ProjectTimelineCard";
import { ScreenBackground } from "@/components/ScreenBackground";
import { ScreenTopBar } from "@/components/ScreenTopBar";
import { haptics } from "@/lib/haptics";
import { ApiError, describeApiError } from "@/lib/veyaApi";
import { useProjectsStore } from "@/stores/projectsStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { colors, screenGutter, spacing } from "@/theme";

/**
 * A project's deadline and day-by-day phase plan. Opened from the project
 * page and from the project list on the Calendar tab. Param: `projectId`.
 */
export default function ProjectTimelineScreen() {
  const router = useRouter();
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const project = useProjectsStore((state) => state.details[projectId]);
  const load = useProjectsStore((state) => state.load);
  const allItems = useWorkspaceStore((state) => state.items);
  const addItem = useWorkspaceStore((state) => state.addItem);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const fetchProject = useCallback(async () => {
    setLoadError(null);
    try {
      await load(projectId);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) setNotFound(true);
      else setLoadError(describeApiError(error));
    }
  }, [load, projectId]);

  // Reload when shown, e.g. after changing the deadline.
  useFocusEffect(
    useCallback(() => {
      void fetchProject();
    }, [fetchProject]),
  );

  if (!project) {
    return (
      <ScreenBackground>
        <SafeAreaView style={styles.safe}>
          <ScreenTopBar onBack={() => router.back()} />
          {notFound ? (
            <EmptyState icon="folder" title="Project not found" message="It may have been deleted." />
          ) : loadError ? (
            <EmptyState
              icon="warning"
              title="Couldn't load the timeline"
              message={loadError}
              action={<Button label="Try again" icon="retry" iconPosition="left" variant="secondary" onPress={() => void fetchProject()} />}
            />
          ) : (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.veya.lavender} />
            </View>
          )}
        </SafeAreaView>
      </ScreenBackground>
    );
  }

  // One task per phase, due on its last day, so the plan shows up in the calendar.
  const projectItems = Object.values(allItems).filter((item) => item.projectId === project.project_id);
  const phases = project.timeline?.phases ?? [];
  const alreadyAdded = (name: string, due: string) => projectItems.some((item) => item.title === name && item.dueDate === due);
  const phasesInCalendar = phases.length > 0 && phases.every((phase) => alreadyAdded(phase.name, phase.end_date));

  const addPhasesToCalendar = () => {
    for (const phase of phases) {
      if (alreadyAdded(phase.name, phase.end_date)) continue;
      addItem({
        kind: "task",
        title: phase.name,
        notes: phase.focus.join("\n"),
        projectId: project.project_id,
        dueDate: phase.end_date,
        priority: "normal",
      });
    }
    haptics.success();
  };

  return (
    <ScreenBackground glow="top">
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <ScreenTopBar onBack={() => router.back()} />
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <AppText variant="eyebrow" tone="accent">
            Timeline
          </AppText>
          <Pressable
            accessibilityRole="link"
            accessibilityHint="Opens the project"
            onPress={() => router.push({ pathname: "/project/[id]", params: { id: project.project_id } })}
            style={styles.titleRow}
          >
            <AppText variant="h1" accessibilityRole="header" style={styles.title} numberOfLines={2}>
              {project.title}
            </AppText>
            <Icon name="chevronRight" size={18} color={colors.text.muted} />
          </Pressable>

          <ProjectTimelineCard
            timeline={project.timeline}
            deadlineSaid={project.project_details?.deadline ?? null}
            onEditDeadline={() => router.push({ pathname: "/deadline-editor", params: { projectId: project.project_id } })}
            onAddToCalendar={addPhasesToCalendar}
            phasesInCalendar={phasesInCalendar}
          />
        </ScrollView>
      </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { paddingHorizontal: screenGutter, paddingBottom: spacing[12] },
  titleRow: { flexDirection: "row", alignItems: "center", gap: spacing[2], marginTop: spacing[1] },
  title: { flex: 1, fontSize: 28, lineHeight: 34 },
});
