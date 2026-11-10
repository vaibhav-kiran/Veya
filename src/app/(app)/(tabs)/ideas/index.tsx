import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { FilterChips } from "@/components/FilterChips";
import { IconButton } from "@/components/IconButton";
import { AppText } from "@/components/AppText";
import { IdeaListItem } from "@/components/IdeaListItem";
import { ProjectListItem } from "@/components/ProjectListItem";
import { TextLink } from "@/components/TextLink";
import { ScreenBackground } from "@/components/ScreenBackground";
import { ScreenHeader } from "@/components/ScreenHeader";
import { useProjectsStore } from "@/stores/projectsStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { colors, screenGutter, spacing } from "@/theme";
import type { Idea, IdeaStatus } from "@/types/models";

type Filter = "all" | IdeaStatus;

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "new", label: "New" },
  { value: "reviewing", label: "Reviewing" },
  { value: "selected", label: "Selected" },
  { value: "converted", label: "Projects" },
];

/** "Your Ideas" tab — every saved idea, filterable by status. */
export default function IdeasListScreen() {
  const router = useRouter();
  const ideasById = useWorkspaceStore((state) => state.ideas);
  const [filter, setFilter] = useState<Filter>("all");
  const projects = useProjectsStore((state) => state.summaries);
  const listState = useProjectsStore((state) => state.listState);
  const listError = useProjectsStore((state) => state.listError);
  const refreshProjects = useProjectsStore((state) => state.refresh);

  // Projects live on the backend; refresh whenever the tab is shown.
  useFocusEffect(
    useCallback(() => {
      void refreshProjects();
    }, [refreshProjects]),
  );

  const ideas = Object.values(ideasById).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const visible = filter === "all" ? ideas : ideas.filter((idea) => idea.status === filter);
  const counts = ideas.reduce<Record<string, number>>((acc, idea) => ({ ...acc, [idea.status]: (acc[idea.status] ?? 0) + 1 }), {});

  const newIdea = () => router.push("/idea-editor");

  return (
    <ScreenBackground glow="top">
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <FlatList<Idea>
          data={visible}
          keyExtractor={(idea) => idea.id}
          contentContainerStyle={styles.content}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListHeaderComponent={
            <View style={styles.header}>
              <ScreenHeader
                eyebrow="Your ideas"
                title="Revisit & refine."
                subtitle="Every thought you capture lands here, ready to review."
                accessory={<IconButton icon="plus" variant="accent" accessibilityLabel="Write down a new idea" onPress={newIdea} />}
              />
              {ideas.length > 0 ? (
                <FilterChips
                  options={FILTERS.map((option) => ({
                    ...option,
                    count: option.value === "all" ? ideas.length : (counts[option.value] ?? 0),
                  }))}
                  value={filter}
                  onChange={setFilter}
                />
              ) : null}
              {projects.length > 0 || listState === "loading" || listError ? (
                <View style={styles.projects}>
                  <View style={styles.projectsHeader}>
                    <AppText variant="eyebrow" tone="secondary">
                      Projects
                    </AppText>
                    {listState === "loading" ? <ActivityIndicator size="small" color={colors.veya.lavender} /> : null}
                  </View>
                  {listError ? (
                    <View style={styles.projectsError}>
                      <AppText variant="bodySmall" tone="secondary" accessibilityRole="alert">
                        {listError}
                      </AppText>
                      <TextLink label="Try again" onPress={() => void refreshProjects()} />
                    </View>
                  ) : null}
                  {projects.map((project) => (
                    <ProjectListItem
                      key={project.project_id}
                      project={project}
                      onPress={() => router.push({ pathname: "/project/[id]", params: { id: project.project_id } })}
                    />
                  ))}
                  {ideas.length > 0 ? (
                    <AppText variant="eyebrow" tone="secondary" style={styles.ideasLabel}>
                      Ideas
                    </AppText>
                  ) : null}
                </View>
              ) : null}
            </View>
          }
          ListEmptyComponent={
            ideas.length === 0 && projects.length > 0 ? undefined : ideas.length === 0 ? (
              <EmptyState
                icon="idea"
                title="No ideas yet"
                message="Start a conversation with Veya, or write a thought down. Saved ideas appear here for review."
                action={
                  <View style={styles.emptyActions}>
                    <Button label="Talk to Veya" icon="mic" iconPosition="left" onPress={() => router.navigate("/talk")} />
                    <Button label="Write it down" variant="secondary" icon="edit" iconPosition="left" onPress={newIdea} />
                  </View>
                }
              />
            ) : (
              <EmptyState icon="list" title="Nothing here" message="No ideas match this filter yet." />
            )
          }
          renderItem={({ item }) => (
            <IdeaListItem idea={item} onPress={() => router.push({ pathname: "/ideas/[id]", params: { id: item.id } })} />
          )}
          showsVerticalScrollIndicator={false}
        />
      </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { paddingHorizontal: screenGutter, paddingBottom: spacing[8] },
  header: { gap: spacing[5], paddingTop: spacing[2], paddingBottom: spacing[5] },
  separator: { height: spacing[3] },
  emptyActions: { gap: spacing[3] },
  projects: { gap: spacing[3] },
  projectsHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  projectsError: { gap: spacing[1] },
  ideasLabel: { marginTop: spacing[3] },
});
