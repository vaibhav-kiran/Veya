import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { FilterChips } from "@/components/FilterChips";
import { FormMessage } from "@/components/FormMessage";
import { GlassCard } from "@/components/GlassCard";
import { Icon, type IconName } from "@/components/Icon";
import { IdeaResultCard } from "@/components/innovator/IdeaResultCard";
import { ScreenBackground } from "@/components/ScreenBackground";
import { ScreenHeader } from "@/components/ScreenHeader";
import { TextField } from "@/components/TextField";
import { haptics } from "@/lib/haptics";
import { canStart, isResearching, useInnovatorStore } from "@/stores/innovatorStore";
import { colors, fontFamilies, radii, screenGutter, spacing, themed } from "@/theme";
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
const STAGES: { key: string; label: string; icon: IconName }[] = [
  { key: "planning", label: "Planning the research", icon: "list" },
  { key: "problem_discovery", label: "Finding real problems", icon: "target" },
  { key: "solution_research", label: "Checking what already exists", icon: "build" },
  { key: "gap_analysis", label: "Testing the gaps", icon: "flag" },
  { key: "candidate_generation", label: "Drafting ideas", icon: "idea" },
  { key: "feasibility", label: "Checking it fits your budget and time", icon: "clock" },
  { key: "similarity", label: "Comparing with similar work", icon: "people" },
  { key: "critic", label: "Letting a critic tear them apart", icon: "warning" },
  { key: "ranking", label: "Ranking", icon: "star" },
];

function ProfileForm() {
  const form = useInnovatorStore((state) => state.form);
  const setForm = useInnovatorStore((state) => state.setForm);
  const start = useInnovatorStore((state) => state.start);
  const starting = useInnovatorStore((state) => state.starting);
  const error = useInnovatorStore((state) => state.error);
  const ready = canStart(form);

  return (
    <GlassCard style={styles.formCard}>
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
        <AppText variant="bodySmall" tone="secondary" style={styles.typeLabel}>
          Kind of project
        </AppText>
        <FilterChips
          options={PROJECT_TYPES}
          value={form.projectType ?? "any"}
          onChange={(value) => setForm({ projectType: value === "any" ? null : value })}
        />
      </View>

      {/* Shown here too: the header message is scrolled out of view when the button is tapped. */}
      <FormMessage message={error} />
      <Button
        label="Find ideas"
        icon="sparkle"
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
    </GlassCard>
  );
}

function ResearchProgress() {
  const status = useInnovatorStore((state) => state.status);
  const newSearch = useInnovatorStore((state) => state.newSearch);
  const progress = Math.min(1, Math.max(0.03, status?.progress ?? 0));
  const current = STAGES.findIndex((stage) => stage.key === status?.stage);
  const counts = status?.counts ?? {};

  return (
    <GlassCard style={styles.progressCard}>
      <View style={styles.progressHead}>
        <View style={styles.pulse}>
          <Icon name="brain" size={22} color={colors.veya.lavender} />
        </View>
        <View style={styles.flex}>
          <AppText variant="h4">{current >= 0 ? STAGES[current].label : "Getting started"}…</AppText>
          <AppText variant="caption" tone="muted">
            {Math.round(progress * 100)}% · research keeps running if you leave
          </AppText>
        </View>
      </View>

      <View style={styles.track} accessible accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}>
        <View style={[styles.fill, { width: `${progress * 100}%` }]} />
      </View>

      <View style={styles.steps}>
        {STAGES.map((stage, index) => {
          const done = current > index;
          const active = current === index;
          return (
            <View key={stage.key} style={styles.step}>
              <Icon
                name={done ? "checkCircle" : stage.icon}
                size={15}
                color={done ? colors.semantic.success : active ? colors.veya.lavender : colors.text.muted}
              />
              <AppText variant="bodySmall" tone={active ? "primary" : done ? "secondary" : "muted"} style={active && styles.activeStep}>
                {stage.label}
              </AppText>
            </View>
          );
        })}
      </View>

      <View style={styles.counts}>
        {[
          ["Problems", counts.problems ?? 0],
          ["Existing", counts.existing_solutions ?? 0],
          ["Gaps", counts.gaps ?? 0],
          ["Ideas", counts.candidate_ideas ?? 0],
        ].map(([label, value]) => (
          <View key={label} style={styles.count}>
            <AppText style={styles.countValue}>{value}</AppText>
            <AppText variant="caption" tone="secondary">
              {label}
            </AppText>
          </View>
        ))}
      </View>

      <Button label="Cancel and start over" variant="ghost" size="small" onPress={newSearch} />
    </GlassCard>
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
      <View style={styles.summary}>
        {[
          [String(results.problems.length), "problems studied"],
          [String(results.evidence.length), "sources read"],
          [String(ideas.length), ideas.length === 1 ? "idea passed" : "ideas passed"],
        ].map(([value, label]) => (
          <View key={label} style={styles.summaryItem}>
            <AppText style={styles.summaryValue}>{value}</AppText>
            <AppText variant="caption" tone="secondary" align="center">
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
          <GlassCard style={styles.emptyCard}>
            <Icon name="target" size={22} color={colors.veya.lavender} />
            <AppText variant="h4" align="center">
              No idea passed every check
            </AppText>
            <AppText variant="bodySmall" tone="secondary" align="center">
              Veya doesn&apos;t pad the list with weak ideas.{" "}
              {nearMisses.length ? "Here are the closest ones and what held them back. Refine one, or" : "Try"} broader interests or a longer
              deadline.
            </AppText>
          </GlassCard>
          {nearMisses.map((evaluated) => (
            <IdeaResultCard key={evaluated.idea.idea_id} evaluated={evaluated} rank={0} />
          ))}
        </>
      ) : (
        ideas.map((evaluated, index) => <IdeaResultCard key={evaluated.idea.idea_id} evaluated={evaluated} rank={index + 1} />)
      )}

      {ideas.length > 0 && results.rejected_ideas.length ? (
        <GlassCard style={styles.rejected}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: showRejected }}
            onPress={() => setShowRejected((value) => !value)}
            style={styles.rejectedHead}
          >
            <AppText variant="h4" style={styles.flex}>
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
        </GlassCard>
      ) : null}

      {notes.length ? (
        <View style={styles.notes}>
          <AppText variant="eyebrow" tone="secondary">
            Worth knowing
          </AppText>
          {notes.map((note) => (
            <AppText key={note} variant="caption" tone="muted">
              •  {note}
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
    <ScreenBackground glow="top">
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <KeyboardAvoidingView style={styles.safe} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <ScreenHeader
              eyebrow="Innovator"
              title="Find an idea worth building."
              subtitle="Veya researches real problems and what already exists, then suggests ideas you can back with sources."
            />

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
  content: { paddingHorizontal: screenGutter, paddingTop: spacing[4], paddingBottom: spacing[12], gap: spacing[5] },
  formCard: { gap: spacing[4] },
  row: { flexDirection: "row", gap: spacing[3] },
  rowItem: { flex: 1 },
  typeBlock: { gap: spacing[2] },
  typeLabel: { fontFamily: fontFamilies.medium },
  progressCard: { gap: spacing[4] },
  progressHead: { flexDirection: "row", alignItems: "center", gap: spacing[3] },
  pulse: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.overlay.lavenderSoft,
    boxShadow: themed("0px 0px 24px rgba(167, 139, 250, 0.45)"),
  },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.overlay.lavenderSoft, overflow: "hidden" },
  fill: { height: 8, borderRadius: 4, backgroundImage: `linear-gradient(90deg, ${colors.veya.purple} 0%, ${colors.veya.lavender} 100%)` },
  steps: { gap: spacing[2] },
  step: { flexDirection: "row", alignItems: "center", gap: spacing[2] },
  activeStep: { fontFamily: fontFamilies.semibold },
  counts: { flexDirection: "row", gap: spacing[2] },
  count: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing[3],
    borderRadius: radii.lg,
    backgroundColor: colors.overlay.lavenderSoft,
  },
  countValue: { fontFamily: fontFamilies.bold, fontSize: 18, lineHeight: 24, color: colors.text.primary },
  results: { gap: spacing[4] },
  summary: { flexDirection: "row", gap: spacing[2] },
  summaryItem: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[1],
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: themed("rgba(196, 181, 253, 0.16)"),
    backgroundColor: colors.overlay.surfaceGlass,
  },
  summaryValue: { fontFamily: fontFamilies.bold, fontSize: 20, lineHeight: 26, color: colors.veya.lavender },
  emptyCard: { alignItems: "center", gap: spacing[2] },
  rejected: { gap: spacing[3] },
  rejectedHead: { flexDirection: "row", alignItems: "center", minHeight: 32 },
  flip: { transform: [{ rotate: "180deg" }] },
  rejectedItem: { gap: 2, paddingTop: spacing[2], borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.overlay.borderStrong },
  notes: { gap: 4 },
});
