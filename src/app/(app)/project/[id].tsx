import { Image } from "expo-image";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { CollapsibleSection } from "@/components/CollapsibleSection";
import { EmptyState } from "@/components/EmptyState";
import { Icon } from "@/components/Icon";
import { IconButton } from "@/components/IconButton";
import { MermaidDiagram } from "@/components/project/MermaidDiagram";
import { PlanView } from "@/components/project/PlanView";
import { ReadmeCard } from "@/components/project/ReadmeCard";
import { ScreenBackground } from "@/components/ScreenBackground";
import { ScreenTopBar } from "@/components/ScreenTopBar";
import { TimelineItemRow } from "@/components/TimelineItemRow";
import { PROJECT_SECTIONS } from "@/constants/projectSections";
import { haptics } from "@/lib/haptics";
import { ApiError, describeApiError, projectsApi } from "@/lib/veyaApi";
import { useProjectsStore } from "@/stores/projectsStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { colors, fontFamilies, radii, screenGutter, spacing, themed } from "@/theme";
import { formatShortDate } from "@/utils/date";

/** Ready-to-build workspace: what, why, how, and what to do next. Loaded from the Veya backend. */
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
  const projectDeleted = useWorkspaceStore((state) => state.projectDeleted);

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
              <ActivityIndicator color={colors.veya.lavender} />
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
  const nextUp = items.find((item) => !item.completed);
  const progress = items.length ? done / items.length : 0;
  const deadline = project.project_details?.deadline;

  const editSection = (field: string) => router.push({ pathname: "/section-editor", params: { projectId: project.project_id, field } });
  const newItem = () => router.push({ pathname: "/item-editor", params: { projectId: project.project_id } });
  const openTimeline = () => router.push({ pathname: "/project-timeline", params: { projectId: project.project_id } });
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
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <AppText variant="eyebrow" tone="accent">
            Project
          </AppText>
          <Pressable accessibilityRole="button" accessibilityHint="Rename project" onPress={() => editSection("title")}>
            <AppText variant="h1" accessibilityRole="header" style={styles.title}>
              {project.title}
            </AppText>
          </Pressable>
          {sourceIdea ? (
            <Pressable
              accessibilityRole="link"
              onPress={() => router.push({ pathname: "/ideas/[id]", params: { id: sourceIdea.id } })}
              style={styles.source}
            >
              <Icon name="idea" size={13} color={colors.text.secondary} />
              <AppText variant="bodySmall" tone="secondary" numberOfLines={1}>
                From your idea · {sourceIdea.title}
              </AppText>
            </Pressable>
          ) : project.source === "conversation" ? (
            <View style={styles.source}>
              <Icon name="chat" size={13} color={colors.text.secondary} />
              <AppText variant="bodySmall" tone="secondary" numberOfLines={1}>
                Planned with Veya{deadline ? ` · deadline: ${deadline}` : ""}
              </AppText>
            </View>
          ) : null}

          <View style={styles.nextCard}>
            <View style={styles.nextHeader}>
              <AppText variant="eyebrow" tone="accent">
                What to do next
              </AppText>
              {items.length ? (
                <AppText variant="caption" tone="secondary">
                  {done} of {items.length} done
                </AppText>
              ) : null}
            </View>
            {items.length ? (
              <View style={styles.progressTrack} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: items.length, now: done }}>
                <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
              </View>
            ) : null}
            {nextUp ? (
              <Pressable accessibilityRole="button" onPress={() => editItem(nextUp.id)}>
                <AppText variant="h3">{nextUp.title}</AppText>
                <AppText variant="bodySmall" tone="secondary">
                  {nextUp.kind === "milestone" ? "Milestone" : "Task"} · due {formatShortDate(nextUp.dueDate)}
                </AppText>
              </Pressable>
            ) : (
              <AppText variant="bodyMedium" tone="secondary">
                {items.length ? "Everything's done. Add the next milestone when you're ready." : "Break the project into a first task to get moving."}
              </AppText>
            )}
          </View>

          {/* The deadline and phase plan live on their own page. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Timeline and deadline. ${project.deadline_date ? `Due ${formatShortDate(project.deadline_date)}` : "No deadline yet"}`}
            onPress={openTimeline}
            style={({ pressed }) => [styles.timelineButton, pressed && styles.timelineButtonPressed]}
          >
            <View style={styles.timelineIcon}>
              <Icon name="calendar" size={16} color={colors.veya.lavender} />
            </View>
            <View style={styles.timelineText}>
              <AppText variant="h4">Timeline & deadline</AppText>
              <AppText variant="bodySmall" tone="secondary">
                {project.deadline_date
                  ? `Due ${formatShortDate(project.deadline_date)} · ${project.timeline?.phases.length ?? 0} phases`
                  : "No deadline yet. Set one to plan your days"}
              </AppText>
            </View>
            <Icon name="chevronRight" size={16} color={colors.text.muted} />
          </Pressable>

          {project.plan_response.trim() ? (
            <>
              <AppText variant="eyebrow" tone="secondary" style={styles.sectionLabel}>
                Veya&apos;s plan
              </AppText>
              <PlanView markdown={project.plan_response} projectTitle={project.title} />
            </>
          ) : null}

          {/* Projects with Veya's blueprint don't repeat it as editable sections; projects
              made from an idea (no blueprint) keep them as their only plan. */}
          {project.plan_response.trim() ? null : (
            <>
              <AppText variant="eyebrow" tone="secondary" style={styles.sectionLabel}>
                Plan
              </AppText>
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

          {project.workflow_diagram ? (
            <>
              <AppText variant="eyebrow" tone="secondary" style={styles.sectionLabel}>
                Workflow
              </AppText>
              <MermaidDiagram code={project.workflow_diagram} />
            </>
          ) : null}

          {project.image_url || project.image_generation_available ? (
            <>
              <AppText variant="eyebrow" tone="secondary" style={styles.sectionLabel}>
                Concept image
              </AppText>
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

          {project.readme_markdown.trim() ? (
            <>
              <AppText variant="eyebrow" tone="secondary" style={styles.sectionLabel}>
                README
              </AppText>
              <ReadmeCard
                projectId={project.project_id}
                markdown={project.readme_markdown}
                filename={project.readme_filename ?? `${project.title.replace(/\s+/g, "_")}_README.md`}
              />
            </>
          ) : null}

          <View style={styles.tasksHeader}>
            <AppText variant="eyebrow" tone="secondary">
              Tasks & milestones
            </AppText>
            <Pressable accessibilityRole="button" accessibilityLabel="Add task or milestone" onPress={newItem} hitSlop={8} style={styles.addLink}>
              <Icon name="plus" size={14} color={colors.veya.lavender} />
              <AppText variant="bodySmall" tone="accent" style={styles.addLabel}>
                Add
              </AppText>
            </Pressable>
          </View>
          {items.length ? (
            <View style={styles.items}>
              {items.map((item) => (
                <TimelineItemRow
                  key={item.id}
                  item={item}
                  showDate
                  onToggle={() => toggleItemCompleted(item.id)}
                  onPress={() => editItem(item.id)}
                />
              ))}
            </View>
          ) : (
            <Button label="Add first task" variant="secondary" icon="plus" iconPosition="left" onPress={newItem} />
          )}
        </ScrollView>
      </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { paddingHorizontal: screenGutter, paddingBottom: spacing[12] },
  title: { marginTop: spacing[1], fontSize: 28, lineHeight: 34 },
  source: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing[2], minHeight: 28 },
  nextCard: {
    marginTop: spacing[6],
    gap: spacing[3],
    padding: spacing[5],
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: themed("rgba(196, 181, 253, 0.25)"),
    backgroundColor: themed("rgba(124, 58, 237, 0.10)"),
  },
  nextHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  progressTrack: { height: 4, borderRadius: 2, backgroundColor: colors.overlay.borderStrong, overflow: "hidden" },
  timelineButton: {
    marginTop: spacing[3],
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    padding: spacing[4],
    borderRadius: radii.lg + 2,
    borderWidth: 1,
    borderColor: themed("rgba(196, 181, 253, 0.2)"),
    backgroundColor: colors.veya.surface,
  },
  timelineButtonPressed: { borderColor: colors.overlay.lavenderBorder },
  timelineIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.overlay.lavenderSoft,
  },
  timelineText: { flex: 1, gap: 2 },
  progressFill: { height: 4, borderRadius: 2, backgroundImage: `linear-gradient(90deg, ${colors.veya.violet} 0%, ${colors.veya.lavender} 100%)` },
  sectionLabel: { marginTop: spacing[8], marginBottom: spacing[3] },
  sections: { gap: spacing[3] },
  note: { marginTop: spacing[3] },
  image: { width: "100%", aspectRatio: 1, borderRadius: radii.lg, backgroundColor: colors.overlay.surfaceRaised },
  imageError: { marginTop: spacing[2] },
  imageButton: { marginTop: spacing[3] },
  tasksHeader: { marginTop: spacing[8], marginBottom: spacing[2], flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  addLink: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 32 },
  addLabel: { fontFamily: fontFamilies.semibold },
  items: { gap: spacing[1] },
});
