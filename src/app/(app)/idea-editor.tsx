import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { ScreenBackground } from "@/components/ScreenBackground";
import { ScreenTopBar } from "@/components/ScreenTopBar";
import { TextField } from "@/components/TextField";
import { haptics } from "@/lib/haptics";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { screenGutter, spacing } from "@/theme";
import type { IdeaDraft } from "@/types/models";

const EMPTY_DRAFT: IdeaDraft = { title: "", description: "", problem: "", solution: "", targetUsers: "", openQuestions: "" };

/** Create or refine an idea. `id` edits an existing idea. */
export default function IdeaEditorScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const existing = useWorkspaceStore((state) => (id ? state.ideas[id] : undefined));
  const addIdea = useWorkspaceStore((state) => state.addIdea);
  const updateIdea = useWorkspaceStore((state) => state.updateIdea);

  const [draft, setDraft] = useState<IdeaDraft>(() =>
    existing
      ? {
          title: existing.title,
          description: existing.description,
          problem: existing.problem,
          solution: existing.solution,
          targetUsers: existing.targetUsers,
          openQuestions: existing.openQuestions,
        }
      : EMPTY_DRAFT,
  );
  const [titleError, setTitleError] = useState<string | null>(null);

  const set = (key: keyof IdeaDraft) => (value: string) => {
    setDraft((current) => ({ ...current, [key]: value }));
    if (key === "title" && titleError) setTitleError(null);
  };

  const save = () => {
    const trimmed = Object.fromEntries(Object.entries(draft).map(([key, value]) => [key, value.trim()])) as IdeaDraft;
    if (!trimmed.title) {
      haptics.error();
      setTitleError("Give your idea a short title.");
      return;
    }
    if (existing) updateIdea(existing.id, trimmed);
    else addIdea(trimmed);
    haptics.success();
    router.back();
  };

  return (
    <ScreenBackground glow="top">
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <ScreenTopBar title={existing ? "Refine idea" : "New idea"} onBack={() => router.back()} backIcon="close" backLabel="Cancel" />
        <KeyboardAvoidingView style={styles.safe} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
            <AppText variant="bodyMedium" tone="secondary">
              Capture it roughly — you can refine it any time. Only the title is required.
            </AppText>
            <TextField label="Title" placeholder="e.g. Voice notes for hackathon teams" value={draft.title} onChangeText={set("title")} error={titleError} autoFocus={!existing} returnKeyType="next" maxLength={120} />
            <TextField label="The idea" placeholder="Describe it in your own words" value={draft.description} onChangeText={set("description")} multiline />
            <TextField label="Problem" placeholder="What problem does it solve?" value={draft.problem} onChangeText={set("problem")} multiline />
            <TextField label="Proposed solution" placeholder="How might it work?" value={draft.solution} onChangeText={set("solution")} multiline />
            <TextField label="Who it's for" placeholder="Target users or use case" value={draft.targetUsers} onChangeText={set("targetUsers")} multiline />
            <TextField label="Open questions" placeholder="Assumptions to test, unknowns" value={draft.openQuestions} onChangeText={set("openQuestions")} multiline />
          </ScrollView>
          <Button label={existing ? "Save changes" : "Save idea"} icon="check" onPress={save} style={styles.save} />
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { paddingHorizontal: screenGutter, paddingBottom: spacing[6], gap: spacing[4] },
  save: { marginHorizontal: screenGutter, marginBottom: spacing[2] },
});
