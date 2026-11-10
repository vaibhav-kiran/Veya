import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { Icon, type IconName } from "@/components/Icon";
import { IconButton } from "@/components/IconButton";
import { ScreenBackground } from "@/components/ScreenBackground";
import { ScreenTopBar } from "@/components/ScreenTopBar";
import { IdeaStatusChip } from "@/components/StatusChip";
import { toBackendSections } from "@/constants/projectSections";
import { haptics } from "@/lib/haptics";
import { describeApiError } from "@/lib/veyaApi";
import { useProjectsStore } from "@/stores/projectsStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { colors, radii, screenGutter, spacing, themed } from "@/theme";
import type { Idea, IdeaDraft } from "@/types/models";
import { formatRelativeDay } from "@/utils/date";

const SECTIONS: { key: keyof Omit<IdeaDraft, "title">; label: string; icon: IconName; empty: string }[] = [
  { key: "description", label: "The idea", icon: "idea", empty: "Describe the idea in your own words" },
  { key: "problem", label: "Problem", icon: "target", empty: "What problem does it solve?" },
  { key: "solution", label: "Proposed solution", icon: "build", empty: "How might it work?" },
  { key: "targetUsers", label: "Who it's for", icon: "people", empty: "Who are the target users?" },
  { key: "openQuestions", label: "Open questions", icon: "list", empty: "Assumptions or unanswered questions" },
];

/** Idea review: everything shown is what the user wrote — nothing is generated here. */
export default function IdeaReviewScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const idea = useWorkspaceStore((state) => state.ideas[id]);
  const setIdeaStatus = useWorkspaceStore((state) => state.setIdeaStatus);
  const discardIdea = useWorkspaceStore((state) => state.discardIdea);
  const linkIdeaToProject = useWorkspaceStore((state) => state.linkIdeaToProject);
  const createProject = useProjectsStore((state) => state.create);
  const [converting, setConverting] = useState(false);
  const [convertError, setConvertError] = useState<string | null>(null);

  if (!idea) {
    return (
      <ScreenBackground>
        <SafeAreaView style={styles.safe}>
          <ScreenTopBar onBack={() => router.back()} />
          <EmptyState icon="idea" title="Idea not found" message="It may have been discarded." />
        </SafeAreaView>
      </ScreenBackground>
    );
  }

  const edit = () => router.push({ pathname: "/idea-editor", params: { id: idea.id } });

  const confirmDiscard = () =>
    Alert.alert("Discard this idea?", `"${idea.title}" will be removed from this device.`, [
      { text: "Keep", style: "cancel" },
      {
        text: "Discard",
        style: "destructive",
        onPress: () => {
          haptics.warning();
          discardIdea(idea.id);
          router.back();
        },
      },
    ]);

  // Seed the backend project with what the user already wrote about the idea.
  const convert = async () => {
    if (converting) return;
    if (idea.projectId) {
      router.push({ pathname: "/project/[id]", params: { id: idea.projectId } });
      return;
    }
    setConverting(true);
    setConvertError(null);
    try {
      const project = await createProject(
        idea.title,
        toBackendSections({
          overview: idea.description,
          problem: idea.problem,
          solution: idea.solution,
          goals: idea.targetUsers ? `Target users: ${idea.targetUsers}` : "",
        }),
      );
      linkIdeaToProject(idea.id, project.project_id);
      haptics.success();
      router.push({ pathname: "/project/[id]", params: { id: project.project_id } });
    } catch (error) {
      haptics.error();
      setConvertError(describeApiError(error));
    } finally {
      setConverting(false);
    }
  };

  return (
    <ScreenBackground glow="top">
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <ScreenTopBar
          onBack={() => router.back()}
          right={<IconButton icon="edit" accessibilityLabel="Edit idea" onPress={edit} />}
        />
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.meta}>
            <IdeaStatusChip status={idea.status} />
            <AppText variant="caption" tone="muted">
              Updated {formatRelativeDay(idea.updatedAt).toLowerCase()}
            </AppText>
          </View>
          <AppText variant="h1" accessibilityRole="header" style={styles.title}>
            {idea.title}
          </AppText>

          <View style={styles.sections}>
            {SECTIONS.map(({ key, label, icon, empty }) =>
              idea[key] ? (
                <View key={key} style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <Icon name={icon} size={16} color={colors.veya.lavender} />
                    <AppText variant="eyebrow" tone="secondary">
                      {label}
                    </AppText>
                  </View>
                  <AppText variant="bodyLarge" selectable>
                    {idea[key]}
                  </AppText>
                </View>
              ) : (
                <Pressable
                  key={key}
                  accessibilityRole="button"
                  accessibilityLabel={`Add: ${empty}`}
                  onPress={edit}
                  style={({ pressed }) => [styles.emptySection, pressed && styles.emptyPressed]}
                >
                  <Icon name="plus" size={16} color={colors.text.muted} />
                  <AppText variant="bodyMedium" tone="muted">
                    {empty}
                  </AppText>
                </Pressable>
              ),
            )}
          </View>

          <NextStep
            idea={idea}
            busy={converting}
            error={convertError}
            onStatus={(status) => setIdeaStatus(idea.id, status)}
            onConvert={() => void convert()}
            onOpenProject={() => idea.projectId && router.push({ pathname: "/project/[id]", params: { id: idea.projectId } })}
          />

          {idea.status !== "converted" ? (
            <Button label="Discard idea" variant="destructive" icon="trash" iconPosition="left" onPress={confirmDiscard} style={styles.discard} />
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </ScreenBackground>
  );
}

type NextStepProps = {
  idea: Idea;
  busy: boolean;
  error: string | null;
  onStatus: (status: "reviewing" | "selected") => void;
  onConvert: () => void;
  onOpenProject: () => void;
};

/** One clear next action per stage: review → select → build. */
function NextStep({ idea, busy, error, onStatus, onConvert, onOpenProject }: NextStepProps) {
  const steps = {
    new: { hint: "Read it back. Does it still excite you?", label: "Start reviewing", action: () => onStatus("reviewing"), icon: "arrowRight" },
    reviewing: { hint: "Happy with it? Select it to turn it into a project.", label: "Select this idea", action: () => onStatus("selected"), icon: "check" },
    selected: { hint: "Ready to build. Veya will set up a project workspace from what you've written.", label: "Turn into a project", action: onConvert, icon: "build" },
    converted: { hint: "This idea is now a project.", label: "Open project", action: onOpenProject, icon: "arrowRight" },
  } as const satisfies Record<Idea["status"], { hint: string; label: string; action: () => void; icon: IconName }>;
  const step = steps[idea.status];

  return (
    <View style={styles.nextStep}>
      <AppText variant="eyebrow" tone="accent">
        Next step
      </AppText>
      <AppText variant="bodyMedium" tone="secondary">
        {step.hint}
      </AppText>
      {error ? (
        <AppText variant="bodySmall" tone="error" accessibilityRole="alert">
          {error}
        </AppText>
      ) : null}
      <Button label={step.label} icon={step.icon} loading={busy} onPress={() => { haptics.selection(); step.action(); }} />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { paddingHorizontal: screenGutter, paddingBottom: spacing[10] },
  meta: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing[2] },
  title: { marginTop: spacing[3], fontSize: 28, lineHeight: 34 },
  sections: { marginTop: spacing[6], gap: spacing[5] },
  section: { gap: spacing[2] },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: spacing[2] },
  emptySection: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
    minHeight: 48,
    paddingHorizontal: spacing[4],
    borderRadius: radii.md,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.overlay.borderStrong,
  },
  emptyPressed: { backgroundColor: colors.overlay.lavenderSoft },
  nextStep: {
    marginTop: spacing[8],
    gap: spacing[3],
    padding: spacing[5],
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: themed("rgba(196, 181, 253, 0.25)"),
    backgroundColor: themed("rgba(124, 58, 237, 0.10)"),
  },
  discard: { marginTop: spacing[4] },
});
