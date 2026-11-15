import { Image } from "expo-image";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View, type ScrollViewInstance } from "react-native";
import Animated, { LayoutAnimationConfig } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { CollapsibleSection } from "@/components/CollapsibleSection";
import { EmptyState } from "@/components/EmptyState";
import { Icon } from "@/components/Icon";
import { IconButton } from "@/components/IconButton";
import { MermaidDiagram } from "@/components/project/MermaidDiagram";
import { ProjectTimelineCard } from "@/components/project/ProjectTimelineCard";
import { PlanView } from "@/components/project/PlanView";
import { ProjectTabs, type ProjectTab } from "@/components/project/ProjectTabs";
import { ProjectVoiceEdit } from "@/components/project/ProjectVoiceEdit";
import { ReadmeCard } from "@/components/project/ReadmeCard";
import { ScreenBackground } from "@/components/ScreenBackground";
import { ScreenTopBar } from "@/components/ScreenTopBar";
import { DayTimeline } from "@/components/timeline/TimelineParts";
import { GROUP_BG, Group, Row, SectionHeader } from "@/components/ui/Grouped";
import { folderColor, folderThatChanged } from "@/constants/folderColors";
import { PROJECT_SECTIONS } from "@/constants/projectSections";
import { haptics } from "@/lib/haptics";
import { fadeSoft } from "@/lib/softMotion";
import { extractImplementation } from "@/lib/planMarkdown";
import { ApiError, describeApiError, projectsApi } from "@/lib/veyaApi";
import { useProjectsStore } from "@/stores/projectsStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { colors, fontFamilies, screenGutter, spacing } from "@/theme";
import { todayISO } from "@/utils/date";

type TabKey = "timeline" | "overview" | "build" | "visuals";

/**
 * Ready-to-build workspace. A short header (title, where it came from, what
 * to do next), then tabs that stay at the top while scrolling: Overview
 * (Veya's plan), Build (implementation + README), Visuals (workflow and
 * concept image) and Timeline (deadline, phases and the tasks to tick off). One section at a time, so nothing is repeated
 * in one long scroll. Loaded from the Veya backend.
 */
export default function ProjectScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const project = useProjectsStore((state) => state.details[id]);
  const load = useProjectsStore((state) => state.load);
  const removeProject = useProjectsStore((state) => state.remove);
  const generateImage = useProjectsStore((state) => state.generateImage);
  const sourceIdea = useWorkspaceStore((state) => Object.values(state.ideas).find((idea) => idea.projectId === id));
  const allItems = useWorkspaceStore((state) => state.items);
  const toggleItemCompleted = useWorkspaceStore((state) => state.toggleItemCompleted);
  const addItem = useWorkspaceStore((state) => state.addItem);
  const projectDeleted = useWorkspaceStore((state) => state.projectDeleted);
  // Changed from an Analyze folder: the page takes that folder's colour.
  const changedBy = useWorkspaceStore((state) => folderThatChanged(state.boards, id));

  // The README's implementation part, shown as its own section.
  const readme = project?.readme_markdown ?? "";
  const implementation = useMemo(() => extractImplementation(readme), [readme]);
  const detailedImplementation = /^###\s+\d+\.\d+\s+(project structure|frontend|backend)/im.test(implementation);

  const [tab, setTab] = useState<TabKey>("overview");
  const scrollRef = useRef<ScrollViewInstance>(null);
  const scrollY = useRef(0);
  const tabsY = useRef(0);

  const [loadError, setLoadError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [imageState, setImageState] = useState<{ loading: boolean; error: string | null }>({ loading: false, error: null });

  const fetchProject = useCallback(async () => {
    setLoadError(null);
    try {
      await load(id);
      setNotFound(false);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) setNotFound(true);
      else setLoadError(describeApiError(error));
    }
  }, [id, load]);

  // Refresh whenever the screen is shown, e.g. after editing a section.
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
              title="Couldn't load this project"
              message={loadError}
              action={<Button label="Try again" icon="retry" iconPosition="left" variant="secondary" onPress={() => void fetchProject()} />}
            />
          ) : (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.text.secondary} />
            </View>
          )}
        </SafeAreaView>
      </ScreenBackground>
    );
  }

  const items = Object.values(allItems)
    .filter((item) => item.projectId === project.project_id)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.createdAt.localeCompare(b.createdAt));
  const done = items.filter((item) => item.completed).length;
  // Open tasks first (soonest first), then the finished ones.
  const timelineItems = [...items.filter((item) => !item.completed), ...items.filter((item) => item.completed)];
  const today = todayISO();

  // One task per phase, due on its last day, so the plan shows up in the calendar.
  const phases = project.timeline?.phases ?? [];
  const alreadyAdded = (name: string, due: string) => items.some((item) => item.title === name && item.dueDate === due);
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
  const deadline = project.project_details?.deadline;

  // Only tabs with something in them.
  const hasVisuals = Boolean(project.workflow_diagram || project.image_url || project.image_generation_available);
  const hasBuild = Boolean(implementation || project.readme_markdown.trim());
  const tabs: (ProjectTab & { key: TabKey })[] = [
    { key: "overview", label: "Overview", icon: "idea" },
    ...(hasBuild ? [{ key: "build" as const, label: "Build", icon: "build" as const }] : []),
    ...(hasVisuals ? [{ key: "visuals" as const, label: "Visuals", icon: "image" as const }] : []),
    {
      key: "timeline",
      label: "Timeline",
      icon: "calendar",
      badge: items.length && done < items.length ? String(items.length - done) : undefined,
    },
  ];
  const activeTab: TabKey = tabs.some((entry) => entry.key === tab) ? tab : "overview";
  const switchTab = (key: string) => {
    setTab(key as TabKey);
    // Scrolled past the tabs: start the new section at its top, under the tabs.
    if (scrollY.current > tabsY.current) scrollRef.current?.scrollTo({ y: tabsY.current, animated: false });
  };

  const editSection = (field: string) => router.push({ pathname: "/section-editor", params: { projectId: project.project_id, field } });
  const newItem = () => router.push({ pathname: "/item-editor", params: { projectId: project.project_id } });
  const editItem = (itemId: string) => router.push({ pathname: "/item-editor", params: { id: itemId } });

  const requestImage = async () => {
    setImageState({ loading: true, error: null });
    try {
      await generateImage(project.project_id);
      haptics.success();
      setImageState({ loading: false, error: null });
    } catch (error) {
      setImageState({ loading: false, error: describeApiError(error) });
    }
  };

  const confirmDelete = () =>
    Alert.alert(
      "Delete this project?",
      "It's removed from Veya, and its tasks and milestones on this device are removed too. A source idea goes back to Selected.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setDeleting(true);
            try {
              await removeProject(project.project_id);
              projectDeleted(project.project_id);
              haptics.warning();
              router.back();
            } catch (error) {
              setDeleting(false);
              Alert.alert("Couldn't delete the project", describeApiError(error));
            }
          },
        },
      ],
    );

  return (
    <ScreenBackground glow="top">
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <ScreenTopBar
          onBack={() => router.back()}
          right={<IconButton icon="trash" accessibilityLabel="Delete project" onPress={confirmDelete} disabled={deleting} />}
        />
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          stickyHeaderIndices={[1]}
          onScroll={(event) => (scrollY.current = event.nativeEvent.contentOffset.y)}
          scrollEventThrottle={32}
        >
          {/* ---- header: always visible ---- */}
          <View style={styles.header}>
            <View style={styles.meta}>
              {changedBy ? <View style={[styles.metaDot, { backgroundColor: folderColor(changedBy) }]} /> : null}
              {sourceIdea ? (
                <Pressable
                  accessibilityRole="link"
                  onPress={() => router.push({ pathname: "/ideas/[id]", params: { id: sourceIdea.id } })}
                  hitSlop={6}
                  style={styles.flexShrink}
                >
                  <AppText variant="bodySmall" tone="secondary" numberOfLines={1}>
                    From your idea · {sourceIdea.title}
                  </AppText>
                </Pressable>
              ) : (
                <AppText variant="bodySmall" tone="secondary" numberOfLines={1} style={styles.flexShrink}>
                  {project.source === "conversation" ? "Planned with Veya" : "Your project"}
                  {deadline ? ` · due ${deadline}` : ""}
                </AppText>
              )}
            </View>
            <Pressable accessibilityRole="button" accessibilityHint="Rename project" onPress={() => editSection("title")}>
              <AppText style={styles.title} accessibilityRole="header" numberOfLines={3}>
                {project.title}
              </AppText>
            </Pressable>
            {changedBy ? (
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={`Improved for ${changedBy.name}. Opens the analysis.`}
                onPress={() => router.push({ pathname: "/board/[id]", params: { id: changedBy.id } })}
                hitSlop={6}
                style={styles.improved}
              >
                <AppText variant="bodySmall" style={[styles.improvedLabel, { color: folderColor(changedBy) }]} numberOfLines={1}>
                  Improved for {changedBy.name}
                </AppText>
                <Icon name="chevronRight" size={12} color={folderColor(changedBy)} />
              </Pressable>
            ) : null}
          </View>

          {/* ---- tabs: stay at the top while scrolling ---- */}
          <View style={styles.tabsWrap} onLayout={(event) => (tabsY.current = event.nativeEvent.layout.y)}>
            <ProjectTabs tabs={tabs} value={activeTab} onChange={switchTab} />
          </View>

          {/* ---- one section at a time ---- */}
          <LayoutAnimationConfig skipEntering>
            <Animated.View key={activeTab} entering={fadeSoft} style={styles.tabBody}>
              {activeTab === "overview" ? (
                <>
            {project.plan_response.trim() ? (
              <>
                <PlanView markdown={project.plan_response} projectTitle={project.title} openSections={1} />
              </>
            ) : null}
  
            {/* Projects with Veya's blueprint don't repeat it as editable sections; projects
                made from an idea (no blueprint) keep them as their only plan. */}
            {project.plan_response.trim() ? null : (
              <>
                <View style={styles.sections}>
                  {PROJECT_SECTIONS.map((section, index) => (
                    <CollapsibleSection
                      key={section.key}
                      title={section.label}
                      icon={section.icon}
                      content={project.sections[section.backendKey]}
                      placeholder={section.placeholder}
                      initiallyOpen={index === 0}
                      onEdit={() => editSection(section.key)}
                    />
                  ))}
                </View>
                <AppText variant="caption" tone="muted" style={styles.note}>
                  Sections hold what you write — always editable.
                </AppText>
              </>
            )}
  
                </>
              ) : null}
              {activeTab === "build" ? (
                <>
            {implementation ? (
              <>
                <PlanView
                  markdown={implementation}
                  projectTitle={project.title}
                  heroTitle="How to build it"
                  heroSubtitle={
                    detailedImplementation
                      ? "Project structure, frontend, backend, data and the build order, step by step"
                      : "The build order, phase by phase, with commands and code"
                  }
                  openSections={1}
                />
              </>
            ) : null}
  
            {project.readme_markdown.trim() ? (
              <>
                <SectionHeader title="README" />
                <ReadmeCard
                  projectId={project.project_id}
                  markdown={project.readme_markdown}
                  filename={project.readme_filename ?? `${project.title.replace(/\s+/g, "_")}_README.md`}
                />
              </>
            ) : null}
  
                </>
              ) : null}
              {activeTab === "visuals" ? (
                <>
            {project.workflow_diagram ? (
              <>
                <SectionHeader title="Workflow" />
                <MermaidDiagram code={project.workflow_diagram} />
              </>
            ) : null}
  
            {project.image_url || project.image_generation_available ? (
              <>
                <SectionHeader title="Concept image" />
                {project.image_url ? (
                  <Image
                    source={{ uri: projectsApi.assetUrl(project.image_url) }}
                    style={styles.image}
                    contentFit="cover"
                    accessibilityLabel={`Concept image for ${project.title}`}
                  />
                ) : null}
                {imageState.error ? (
                  <AppText variant="bodySmall" tone="error" accessibilityRole="alert" style={styles.imageError}>
                    {imageState.error}
                  </AppText>
                ) : null}
                {project.image_generation_available ? (
                  <Button
                    label={project.image_url ? "Generate a new image" : "Generate concept image"}
                    icon="image"
                    iconPosition="left"
                    variant="secondary"
                    loading={imageState.loading}
                    onPress={() => void requestImage()}
                    style={styles.imageButton}
                  />
                ) : null}
                {imageState.loading ? (
                  <AppText variant="caption" tone="muted" align="center" style={styles.note}>
                    Stable Diffusion is drawing your concept. This can take a few minutes.
                  </AppText>
                ) : null}
              </>
            ) : null}
  
                </>
              ) : null}
              {activeTab === "timeline" ? (
                <>
                  <ProjectTimelineCard
                    timeline={project.timeline}
                    deadlineSaid={project.project_details?.deadline ?? null}
                    onEditDeadline={() => router.push({ pathname: "/deadline-editor", params: { projectId: project.project_id } })}
                    onAddToCalendar={addPhasesToCalendar}
                    phasesInCalendar={phasesInCalendar}
                  />

                  <SectionHeader
                    title={items.length ? `Tasks & milestones · ${done} of ${items.length} done` : "Tasks & milestones"}
                    action="Add"
                    onAction={newItem}
                  />
                  <Group>
                    {items.length ? (
                      <View style={styles.rail}>
                        <DayTimeline
                          items={timelineItems}
                          projectTitle={() => undefined}
                          today={today}
                          showDate
                          onToggle={(item) => toggleItemCompleted(item.id)}
                          onOpen={(item) => editItem(item.id)}
                        />
                      </View>
                    ) : (
                      <Row
                        title="No tasks yet"
                        subtitle="Break the project into a first task to get moving."
                        onPress={newItem}
                        leading={<Icon name="plus" size={15} color={colors.text.muted} />}
                      />
                    )}
                  </Group>
                </>
              ) : null}
            </Animated.View>
          </LayoutAnimationConfig>
        </ScrollView>
        {/* Change the plan file by voice (or text). */}
        {project.readme_markdown.trim() ? <ProjectVoiceEdit projectId={project.project_id} canUndo={Boolean(project.can_undo_edit)} /> : null}
      </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  // Room at the bottom for the voice-edit orb.
  content: { paddingHorizontal: screenGutter, paddingBottom: spacing[16] + spacing[8] },
  header: { gap: spacing[2], paddingTop: spacing[2] },
  meta: { flexDirection: "row", alignItems: "center", gap: spacing[2] },
  metaDot: { width: 8, height: 8, borderRadius: 4 },
  flexShrink: { flexShrink: 1 },
  title: { fontFamily: fontFamilies.bold, fontSize: 30, lineHeight: 35, letterSpacing: -0.6, color: colors.text.primary },
  improved: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start" },
  improvedLabel: { fontFamily: fontFamilies.medium },
  tabsWrap: { paddingTop: spacing[6], paddingBottom: spacing[2], backgroundColor: colors.veya.background },
  tabBody: { paddingTop: spacing[1] },
  sections: { gap: spacing[3] },
  note: { marginTop: spacing[3] },
  image: { width: "100%", aspectRatio: 1, borderRadius: 14, backgroundColor: GROUP_BG },
  imageError: { marginTop: spacing[2] },
  imageButton: { marginTop: spacing[3] },
  rail: { paddingHorizontal: spacing[4], paddingVertical: spacing[4] },
});
