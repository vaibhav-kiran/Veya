import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { FormMessage } from "@/components/FormMessage";
import { GlassCard } from "@/components/GlassCard";
import { MonthCalendar } from "@/components/MonthCalendar";
import { ScreenBackground } from "@/components/ScreenBackground";
import { ScreenTopBar } from "@/components/ScreenTopBar";
import { haptics } from "@/lib/haptics";
import { describeApiError } from "@/lib/veyaApi";
import { useProjectsStore } from "@/stores/projectsStore";
import { screenGutter, spacing } from "@/theme";
import type { ISODate } from "@/types/models";
import { formatLongDate, monthOf, todayISO } from "@/utils/date";

/** Pick (or clear) a project's deadline. Veya re-plans the phases from it. Param: `projectId`. */
export default function DeadlineEditorScreen() {
  const router = useRouter();
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const project = useProjectsStore((state) => state.details[projectId]);
  const updateProject = useProjectsStore((state) => state.update);

  const [date, setDate] = useState<ISODate>(() => project?.deadline_date ?? todayISO());
  const [month, setMonth] = useState(() => monthOf(project?.deadline_date ?? todayISO()));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!project) {
    return (
      <ScreenBackground>
        <SafeAreaView style={styles.flex}>
          <ScreenTopBar onBack={() => router.back()} backIcon="close" />
          <EmptyState icon="folder" title="Project not found" message="It may have been deleted." />
        </SafeAreaView>
      </ScreenBackground>
    );
  }

  const save = async (deadline: ISODate | null) => {
    setSaving(true);
    setError(null);
    try {
      await updateProject(project.project_id, { deadline_date: deadline });
      haptics.success();
      router.back();
    } catch (cause) {
      haptics.error();
      setError(describeApiError(cause));
      setSaving(false);
    }
  };

  const said = project.project_details?.deadline;
  const past = date < todayISO();

  return (
    <ScreenBackground glow="top">
      <SafeAreaView style={styles.flex} edges={["top", "bottom"]}>
        <ScreenTopBar title="Deadline" onBack={() => router.back()} backIcon="close" backLabel="Cancel" />
        <ScrollView contentContainerStyle={styles.content}>
          <AppText variant="bodyMedium" tone="secondary">
            {said ? `You told Veya “${said}”. ` : ""}Pick the day it&apos;s due and Veya will plan the phases up to it.
          </AppText>
          <GlassCard style={styles.calendar}>
            <MonthCalendar month={month} onMonthChange={setMonth} selectedDate={date} onSelectDate={setDate} />
          </GlassCard>
          <AppText variant="h4" align="center">
            {formatLongDate(date)}
          </AppText>
          {past ? (
            <AppText variant="bodySmall" tone="warning" align="center">
              That date has already passed.
            </AppText>
          ) : null}
          {error ? <FormMessage tone="error" message={error} /> : null}
        </ScrollView>
        <View style={styles.actions}>
          <Button label="Save deadline" icon="check" loading={saving} onPress={() => void save(date)} />
          {project.deadline_date ? (
            <Button label="Remove deadline" variant="ghost" disabled={saving} onPress={() => void save(null)} />
          ) : null}
        </View>
      </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: screenGutter, paddingTop: spacing[2], gap: spacing[4] },
  calendar: { padding: spacing[3] },
  actions: { paddingHorizontal: screenGutter, paddingBottom: spacing[2], gap: spacing[2] },
});
