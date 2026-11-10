import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Alert, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { GlassCard } from "@/components/GlassCard";
import { IconButton } from "@/components/IconButton";
import { MonthCalendar } from "@/components/MonthCalendar";
import { ScreenBackground } from "@/components/ScreenBackground";
import { ScreenTopBar } from "@/components/ScreenTopBar";
import { SegmentedControl } from "@/components/SegmentedControl";
import { TextField } from "@/components/TextField";
import { haptics } from "@/lib/haptics";
import { useProjectsStore } from "@/stores/projectsStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { colors, fontFamilies, radii, screenGutter, spacing, themed } from "@/theme";
import type { ISODate, TaskPriority, TimelineItemDraft, TimelineItemKind } from "@/types/models";
import { formatLongDate, monthOf, todayISO } from "@/utils/date";

const KIND_SEGMENTS = [
  { value: "task", label: "Task" },
  { value: "milestone", label: "Milestone" },
] as const satisfies readonly { value: TimelineItemKind; label: string }[];

const PRIORITY_SEGMENTS = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
] as const satisfies readonly { value: TaskPriority; label: string }[];

/** Add or edit a task/milestone. Params: `id` (edit), `projectId`, `date` (prefill). */
export default function ItemEditorScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; projectId?: string; date?: ISODate }>();
  const existing = useWorkspaceStore((state) => (params.id ? state.items[params.id] : undefined));
  const projectSummaries = useProjectsStore((state) => state.summaries);
  const addItem = useWorkspaceStore((state) => state.addItem);
  const updateItem = useWorkspaceStore((state) => state.updateItem);
  const deleteItem = useWorkspaceStore((state) => state.deleteItem);

  const [draft, setDraft] = useState<TimelineItemDraft>(() => ({
    kind: existing?.kind ?? "task",
    title: existing?.title ?? "",
    notes: existing?.notes ?? "",
    projectId: existing?.projectId ?? params.projectId ?? null,
    dueDate: existing?.dueDate ?? params.date ?? todayISO(),
    priority: existing?.priority ?? "normal",
  }));
  const [month, setMonth] = useState(() => monthOf(draft.dueDate));
  const [titleError, setTitleError] = useState<string | null>(null);
  const projects = projectSummaries
    .map((project) => ({ id: project.project_id, title: project.title }))
    .sort((a, b) => a.title.localeCompare(b.title));

  const update = <K extends keyof TimelineItemDraft>(key: K, value: TimelineItemDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const save = () => {
    const title = draft.title.trim();
    if (!title) {
      haptics.error();
      setTitleError(`Give this ${draft.kind} a title.`);
      return;
    }
    const clean = { ...draft, title, notes: draft.notes.trim() };
    if (existing) updateItem(existing.id, clean);
    else addItem(clean);
    haptics.success();
    router.back();
  };

  const confirmDelete = () =>
    existing &&
    Alert.alert(`Delete this ${existing.kind}?`, existing.title, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          deleteItem(existing.id);
          router.back();
        },
      },
    ]);

  return (
    <ScreenBackground glow="top">
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <ScreenTopBar
          title={existing ? `Edit ${existing.kind}` : "New item"}
          onBack={() => router.back()}
          backIcon="close"
          backLabel="Cancel"
          right={existing ? <IconButton icon="trash" accessibilityLabel={`Delete ${existing.kind}`} onPress={confirmDelete} /> : null}
        />
        <KeyboardAvoidingView style={styles.safe} behavior="padding">
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
            <SegmentedControl segments={KIND_SEGMENTS} value={draft.kind} onChange={(kind) => update("kind", kind)} accessibilityLabel="Item type" />
            <TextField
              label="Title"
              placeholder={draft.kind === "milestone" ? "e.g. MVP demo" : "e.g. Finalise problem statement"}
              value={draft.title}
              onChangeText={(value) => {
                update("title", value);
                if (titleError) setTitleError(null);
              }}
              error={titleError}
              autoFocus={!existing}
              maxLength={140}
            />

            <View style={styles.field}>
              <AppText variant="bodySmall" tone="secondary" style={styles.label}>
                {draft.kind === "milestone" ? "Target date" : "Due date"} · {formatLongDate(draft.dueDate)}
              </AppText>
              <GlassCard style={styles.calendar}>
                <MonthCalendar month={month} onMonthChange={setMonth} selectedDate={draft.dueDate} onSelectDate={(date) => update("dueDate", date)} />
              </GlassCard>
            </View>

            {draft.kind === "task" ? (
              <View style={styles.field}>
                <AppText variant="bodySmall" tone="secondary" style={styles.label}>
                  Priority
                </AppText>
                <SegmentedControl segments={PRIORITY_SEGMENTS} value={draft.priority} onChange={(priority) => update("priority", priority)} accessibilityLabel="Priority" />
              </View>
            ) : null}

            {projects.length ? (
              <View style={styles.field}>
                <AppText variant="bodySmall" tone="secondary" style={styles.label}>
                  Project
                </AppText>
                <View style={styles.projects} accessibilityRole="radiogroup">
                  {[{ id: null, title: "None" }, ...projects].map((project) => {
                    const selected = draft.projectId === project.id;
                    return (
                      <Pressable
                        key={project.id ?? "none"}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: selected }}
                        onPress={() => {
                          haptics.selection();
                          update("projectId", project.id);
                        }}
                        style={[styles.projectChip, selected && styles.projectChipSelected]}
                      >
                        <AppText variant="bodySmall" tone={selected ? "primary" : "secondary"} numberOfLines={1} style={selected && styles.selectedLabel}>
                          {project.title}
                        </AppText>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}

            <TextField label="Notes" placeholder="Optional details" value={draft.notes} onChangeText={(value) => update("notes", value)} multiline />
          </ScrollView>
          <Button label={existing ? "Save changes" : `Add ${draft.kind}`} icon="check" onPress={save} style={styles.save} />
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { paddingHorizontal: screenGutter, paddingBottom: spacing[6], gap: spacing[5] },
  field: { gap: spacing[2] },
  label: { fontFamily: fontFamilies.medium },
  calendar: { padding: spacing[3] },
  projects: { flexDirection: "row", flexWrap: "wrap", gap: spacing[2] },
  projectChip: {
    maxWidth: "100%",
    minHeight: 36,
    justifyContent: "center",
    paddingHorizontal: spacing[4],
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.overlay.borderStrong,
    backgroundColor: colors.veya.surface,
  },
  projectChipSelected: { borderColor: colors.overlay.lavenderBorder, backgroundColor: themed("rgba(124, 58, 237, 0.22)") },
  selectedLabel: { fontFamily: fontFamilies.medium },
  save: { marginHorizontal: screenGutter, marginBottom: spacing[2] },
});
