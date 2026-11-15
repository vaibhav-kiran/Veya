import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { FilterChips } from "@/components/FilterChips";
import { FormMessage } from "@/components/FormMessage";
import { Icon } from "@/components/Icon";
import { IdeaResultCard } from "@/components/innovator/IdeaResultCard";
import { ModelPicker } from "@/components/ModelPicker";
import { ScreenBackground } from "@/components/ScreenBackground";
import { TextField } from "@/components/TextField";
import { GROUP_BG, Group, HAIRLINE, SectionHeader, TABULAR } from "@/components/ui/Grouped";
import { haptics } from "@/lib/haptics";
import { canStart, isResearching, useInnovatorStore } from "@/stores/innovatorStore";
import { colors, fontFamilies, screenGutter, spacing } from "@/theme";
import type { InnovatorProjectType } from "@/types/innovator";

const POLL_MS = 4000;

const PROJECT_TYPES: readonly { value: InnovatorProjectType | "any"; label: string }[] = [
  { value: "any", label: "Any" },
  { value: "hackathon", label: "Hackathon" },
  { value: "final_year_project", label: "Final year" },
  { value: "academic_mini_project", label: "Mini project" },
  { value: "research_project", label: "Research" },
  { value: "startup_concept", label: "Startup" },
  { value: "personal_learning", label: "Learning" },
];

/** What the server is doing, in words a student understands. */
const STAGES: { key: string; label: string }[] = [
  { key: "planning", label: "Planning the research" },
  { key: "problem_discovery", label: "Finding real problems" },
  { key: "solution_research", label: "Checking what already exists" },
  { key: "gap_analysis", label: "Testing the gaps" },
  { key: "candidate_generation", label: "Drafting ideas" },
  { key: "feasibility", label: "Checking it fits your budget and time" },
  { key: "similarity", label: "Comparing with similar work" },
  { key: "critic", label: "Letting a critic tear them apart" },
  { key: "ranking", label: "Ranking" },
];

function ProfileForm() {
  const form = useInnovatorStore((state) => state.form);
  const setForm = useInnovatorStore((state) => state.setForm);
  const start = useInnovatorStore((state) => state.start);
  const starting = useInnovatorStore((state) => state.starting);
  const error = useInnovatorStore((state) => state.error);
  const ready = canStart(form);

  return (
    <View style={styles.formCard}>
      <SectionHeader title="About you" />
      <TextField
        label="What are you into?"
        placeholder="e.g. agriculture, IoT, mental health"
        value={form.interests}
        onChangeText={(interests) => setForm({ interests })}
        maxLength={300}
      />
      <TextField
        label="Field of study"
        placeholder="e.g. Electronics and Communication"
        value={form.academicField}
        onChangeText={(academicField) => setForm({ academicField })}
        maxLength={200}
      />
      <TextField
        label="Year or level"
        placeholder="e.g. 3rd year B.Tech"
        value={form.academicLevel}
        onChangeText={(academicLevel) => setForm({ academicLevel })}
        maxLength={100}
      />
      <SectionHeader title="What you have" />
      <TextField
        label="Skills you have"
        placeholder="e.g. Python, Arduino, React"
        value={form.skills}
        onChangeText={(skills) => setForm({ skills })}
        maxLength={400}
      />
      <TextField
        label="Hardware you can use"
        placeholder="e.g. ESP32, Raspberry Pi, soil sensor"
        value={form.hardware}
        onChangeText={(hardware) => setForm({ hardware })}
        maxLength={400}
      />
      <View style={styles.row}>
        <View style={styles.rowItem}>
          <TextField label="Budget" placeholder="₹5000" value={form.budget} onChangeText={(budget) => setForm({ budget })} maxLength={100} />
        </View>
        <View style={styles.rowItem}>
          <TextField label="Time you have" placeholder="8 weeks" value={form.deadline} onChangeText={(deadline) => setForm({ deadline })} maxLength={100} />
        </View>
      </View>
      <TextField
        label="Team size"
        placeholder="1"
        keyboardType="number-pad"
        value={form.teamSize}
        onChangeText={(teamSize) => setForm({ teamSize: teamSize.replace(/[^0-9]/g, "").slice(0, 2) })}
      />
      <View style={styles.typeBlock}>
        <SectionHeader title="Kind of project" />
        <FilterChips
          options={PROJECT_TYPES}
          value={form.projectType ?? "any"}
          onChange={(value) => setForm({ projectType: value === "any" ? null : value })}
        />
      </View>

      {/* The research runs on this model (the same switch as Talk and Chat). */}
      <ModelPicker activeModel={null} />

      {/* Shown here too: the header message is scrolled out of view when the button is tapped. */}
      <FormMessage message={error} />
      <Button
        label="Find ideas"
        size="large"
        loading={starting}
        disabled={!ready}
        accessibilityHint="Starts researching problems and existing solutions for you"
        onPress={() => {
          haptics.selection();
          void start();
        }}
      />
      <AppText variant="caption" tone="muted" align="center">
        {ready ? "Takes about 5–10 minutes. You can leave this tab, it keeps going." : "Add an interest or your field of study to start."}
      </AppText>
    </View>
  );
}

function ResearchProgress() {
  const status = useInnovatorStore((state) => state.status);
  const newSearch = useInnovatorStore((state) => state.newSearch);
  const model = useInnovatorStore((state) => state.model);
  const progress = Math.min(1, Math.max(0.03, status?.progress ?? 0));
  const current = STAGES.findIndex((stage) => stage.key === status?.stage);
  const counts = status?.counts ?? {};

  return (
    <View style={styles.progressCard}>
      <Group>
        <View style={styles.progressHead}>
          <View style={styles.pulse} />
          <View style={styles.flex}>
            <AppText variant="bodyMedium" style={styles.strong}>
              {current >= 0 ? STAGES[current].label : "Getting started"}
            </AppText>
            <AppText variant="caption" tone="muted">
              Keeps running if you leave this tab
            </AppText>
          </View>
          <AppText variant="bodyMedium" style={[styles.strong, TABULAR]}>
            {Math.round(progress * 100)}%
          </AppText>
        </View>
        <View style={styles.track} accessible accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}>
          <View style={[styles.fill, { width: `${progress * 100}%` }]} />
        </View>
      </Group>

      <SectionHeader title="Steps" />
      <Group>
        {STAGES.map((stage, index) => {
          const done = current > index;
          const active = current === index;
          return (
            <View key={stage.key} style={styles.step}>
              {done ? (
                <Icon name="check" size={13} color={colors.text.secondary} />
              ) : (
                <View style={[styles.stepDot, active && styles.stepDotActive]} />
              )}
              <AppText variant="bodySmall" tone={active ? "primary" : done ? "secondary" : "muted"} style={active && styles.strong}>
                {stage.label}
              </AppText>
            </View>
          );
        })}
      </Group>

      <SectionHeader title="Found so far" />
      <View style={styles.stats}>
        {[
          ["Problems", counts.problems ?? 0],
          ["Existing", counts.existing_solutions ?? 0],
          ["Gaps", counts.gaps ?? 0],
          ["Ideas", counts.candidate_ideas ?? 0],
        ].map(([label, value], index) => (
          <View key={label} style={[styles.stat, index > 0 && styles.statDivider]}>
            <AppText style={[styles.statValue, TABULAR]}>{value}</AppText>
            <AppText variant="caption" tone="muted">
              {label}
            </AppText>
          </View>
        ))}
      </View>

      {model ? <ModelPicker activeModel={model} /> : null}
      <Button label="Cancel and start over" variant="ghost" size="small" onPress={newSearch} />
    </View>
  );
}

function Results() {
  const results = useInnovatorStore((state) => state.results);
  const status = useInnovatorStore((state) => state.status);
  const newSearch = useInnovatorStore((state) => state.newSearch);
  const [showRejected, setShowRejected] = useState(false);
  if (!results) return null;

  const ideas = results.recommended_ideas;
  // When nothing passes, the best-scoring near misses (not the ones the critic threw out) are still worth refining.
  const nearMisses = results.rejected_ideas
    .filter((evaluated) => evaluated.score !== null && evaluated.critique?.verdict !== "reject")
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, 2);
  const notes = [...results.assumptions, ...results.warnings];

  return (
    <View style={styles.results}>
      <View style={styles.stats}>
        {[
          [String(results.problems.length), "Problems studied"],
          [String(results.evidence.length), "Sources read"],
          [String(ideas.length), ideas.length === 1 ? "Idea passed" : "Ideas passed"],
        ].map(([value, label], index) => (
          <View key={label} style={[styles.stat, index > 0 && styles.statDivider]}>
            <AppText style={[styles.statValue, TABULAR]}>{value}</AppText>
            <AppText variant="caption" tone="muted" align="center">
              {label}
            </AppText>
          </View>
        ))}
      </View>

      {status?.status === "failed" ? (
        <FormMessage message={status.error ?? "Research stopped before it finished."} />
      ) : null}

      {ideas.length === 0 ? (
        <>
          <View style={styles.emptyCard}>
            <AppText variant="h4" align="center" style={styles.strong}>
              No idea passed every check
            </AppText>
            <AppText variant="bodySmall" tone="secondary" align="center">
              Veya doesn&apos;t pad the list with weak ideas.{" "}
              {nearMisses.length ? "Here are the closest ones and what held them back. Refine one, or" : "Try"} broader interests or a longer
              deadline.
            </AppText>
          </View>
          {nearMisses.map((evaluated) => (
            <IdeaResultCard key={evaluated.idea.idea_id} evaluated={evaluated} rank={0} />
          ))}
        </>
      ) : (
        ideas.map((evaluated, index) => <IdeaResultCard key={evaluated.idea.idea_id} evaluated={evaluated} rank={index + 1} />)
      )}

      {ideas.length > 0 && results.rejected_ideas.length ? (
        <View style={styles.rejected}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: showRejected }}
            onPress={() => setShowRejected((value) => !value)}
            style={styles.rejectedHead}
          >
            <AppText variant="bodyMedium" style={[styles.flex, styles.strong]}>
              Didn&apos;t make it ({results.rejected_ideas.length})
            </AppText>
            <Icon name="chevronDown" size={16} color={colors.text.secondary} style={showRejected && styles.flip} />
          </Pressable>
          {showRejected
            ? results.rejected_ideas.map(({ idea, rejection_reason }) => (
                <View key={idea.idea_id} style={styles.rejectedItem}>
                  <AppText variant="bodyMedium">{idea.title}</AppText>
                  {rejection_reason ? (
                    <AppText variant="caption" tone="muted">
                      {rejection_reason}
                    </AppText>
                  ) : null}
                </View>
              ))
            : null}
        </View>
      ) : null}

      {notes.length ? (
        <View style={styles.notes}>
          <SectionHeader title="Worth knowing" />
          {notes.map((note) => (
            <AppText key={note} variant="caption" tone="muted">
              {note}
            </AppText>
          ))}
        </View>
      ) : null}

      <AppText variant="caption" tone="muted" align="center">
        {results.disclaimer}
      </AppText>

      <Button label="New search" variant="secondary" icon="retry" onPress={newSearch} />
    </View>
  );
}

/** Innovator: research-backed project ideas, built from the student's own profile. */
export default function InnovatorScreen() {
  const sessionId = useInnovatorStore((state) => state.sessionId);
  const status = useInnovatorStore((state) => state.status);
  const results = useInnovatorStore((state) => state.results);
  const error = useInnovatorStore((state) => state.error);
  const researching = useInnovatorStore(isResearching);
  const refreshStatus = useInnovatorStore((state) => state.refreshStatus);

  // Poll while research runs and this tab is visible.
  useFocusEffect(
    useCallback(() => {
      if (!researching || !sessionId) return;
      void refreshStatus();
      const timer = setInterval(() => void refreshStatus(), POLL_MS);
      return () => clearInterval(timer);
    }, [researching, sessionId, refreshStatus]),
  );

  const failedEarly = status?.status === "failed" && !results?.recommended_ideas.length;
  const showForm = !sessionId || (failedEarly && !results);

  return (
    <ScreenBackground>
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <KeyboardAvoidingView style={styles.safe} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <View style={styles.header}>
              <AppText variant="bodySmall" tone="secondary">
                Innovator
              </AppText>
              <AppText style={styles.title} accessibilityRole="header">
                Find an idea worth building.
              </AppText>
              <AppText variant="bodyMedium" tone="muted">
                Veya researches real problems and what already exists, then suggests ideas you can back with sources.
              </AppText>
            </View>

            {showForm ? null : <FormMessage message={error} />}

            {showForm ? <ProfileForm /> : researching ? <ResearchProgress /> : <Results />}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  strong: { fontFamily: fontFamilies.medium, color: colors.text.primary },
  content: { paddingHorizontal: screenGutter, paddingTop: spacing[4], paddingBottom: spacing[12], gap: spacing[3] },
  header: { gap: spacing[2], marginBottom: spacing[2] },
  title: { fontFamily: fontFamilies.bold, fontSize: 30, lineHeight: 35, letterSpacing: -0.6, color: colors.text.primary },
  formCard: { gap: spacing[3] },
  row: { flexDirection: "row", gap: spacing[3] },
  rowItem: { flex: 1 },
  typeBlock: { gap: spacing[1] },
  progressCard: { gap: 0 },
  progressHead: { flexDirection: "row", alignItems: "center", gap: spacing[3], padding: spacing[4] },
  pulse: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.veya.lavender },
  track: { height: 2, backgroundColor: HAIRLINE, overflow: "hidden" },
  fill: { height: 2, backgroundColor: colors.veya.lavender },
  step: { flexDirection: "row", alignItems: "center", gap: spacing[3], paddingHorizontal: spacing[4], minHeight: 44 },
  stepDot: { width: 6, height: 6, borderRadius: 3, marginHorizontal: 3.5, backgroundColor: HAIRLINE },
  stepDotActive: { backgroundColor: colors.veya.lavender },
  stats: {
    flexDirection: "row",
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: HAIRLINE,
    backgroundColor: GROUP_BG,
  },
  stat: { flex: 1, alignItems: "center", gap: 2, paddingVertical: spacing[4], paddingHorizontal: spacing[1] },
  statDivider: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: HAIRLINE },
  statValue: { fontFamily: fontFamilies.semibold, fontSize: 20, lineHeight: 26, color: colors.text.primary },
  results: { gap: spacing[4] },
  emptyCard: {
    alignItems: "center",
    gap: spacing[2],
    padding: spacing[5],
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: HAIRLINE,
    backgroundColor: GROUP_BG,
  },
  rejected: {
    gap: spacing[3],
    padding: spacing[4],
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: HAIRLINE,
    backgroundColor: GROUP_BG,
  },
  rejectedHead: { flexDirection: "row", alignItems: "center", minHeight: 32 },
  flip: { transform: [{ rotate: "180deg" }] },
  rejectedItem: { gap: 2, paddingTop: spacing[2], borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: HAIRLINE },
  notes: { gap: 6 },
});
