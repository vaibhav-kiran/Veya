import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { ScreenBackground } from "@/components/ScreenBackground";
import { ScreenTopBar } from "@/components/ScreenTopBar";
import { TextField } from "@/components/TextField";
import { PROJECT_SECTIONS, backendSectionKey, projectSectionLabel } from "@/constants/projectSections";
import { haptics } from "@/lib/haptics";
import { describeApiError } from "@/lib/veyaApi";
import { useProjectsStore } from "@/stores/projectsStore";
import { screenGutter, spacing } from "@/theme";
import type { ProjectSectionKey } from "@/types/models";

const isSectionKey = (value: string): value is ProjectSectionKey => PROJECT_SECTIONS.some((section) => section.key === value);

/** Edits one project field (`title` or a section key) and saves it to the Veya backend. */
export default function SectionEditorScreen() {
  const router = useRouter();
  const { projectId, field = "" } = useLocalSearchParams<{ projectId: string; field: string }>();
  const project = useProjectsStore((state) => state.details[projectId]);
  const updateProject = useProjectsStore((state) => state.update);

  const isTitle = field === "title";
  const initial = project ? (isTitle ? project.title : isSectionKey(field) ? project.sections[backendSectionKey(field)] : "") : "";
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!project || (!isTitle && !isSectionKey(field))) {
    return (
      <ScreenBackground>
        <SafeAreaView style={styles.safe}>
          <ScreenTopBar onBack={() => router.back()} backIcon="close" />
          <EmptyState icon="folder" title="Nothing to edit" message="This project or section no longer exists." />
        </SafeAreaView>
      </ScreenBackground>
    );
  }

  const label = isTitle ? "Project name" : projectSectionLabel(field as ProjectSectionKey);
  const placeholder = isTitle ? "Name your project" : PROJECT_SECTIONS.find((section) => section.key === field)?.placeholder;

  const save = async () => {
    const trimmed = value.trim();
    if (isTitle && !trimmed) {
      haptics.error();
      setError("A project needs a name.");
      return;
    }
    setSaving(true);
    try {
      if (isTitle) await updateProject(project.project_id, { title: trimmed });
      else if (isSectionKey(field)) await updateProject(project.project_id, { sections: { [backendSectionKey(field)]: trimmed } });
      haptics.success();
      router.back();
    } catch (cause) {
      haptics.error();
      setError(describeApiError(cause));
      setSaving(false);
    }
  };

  return (
    <ScreenBackground glow="top">
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <ScreenTopBar title={label} onBack={() => router.back()} backIcon="close" backLabel="Cancel" />
        <KeyboardAvoidingView style={styles.safe} behavior="padding">
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <TextField
              placeholder={placeholder}
              value={value}
              onChangeText={(text) => {
                setValue(text);
                if (error) setError(null);
              }}
              error={error}
              multiline={!isTitle}
              minHeight={isTitle ? undefined : 200}
              autoFocus
              accessibilityLabel={label}
            />
          </ScrollView>
          <Button label="Save" icon="check" loading={saving} onPress={() => void save()} style={styles.save} />
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { paddingHorizontal: screenGutter, paddingTop: spacing[2] },
  save: { marginHorizontal: screenGutter, marginBottom: spacing[2] },
});
