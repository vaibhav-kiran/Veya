import * as WebBrowser from "expo-web-browser";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { FormMessage } from "@/components/FormMessage";
import { Icon, type IconName } from "@/components/Icon";
import { Chip } from "@/components/StatusChip";
import { TextField } from "@/components/TextField";
import { haptics } from "@/lib/haptics";
import { useInnovatorStore } from "@/stores/innovatorStore";
import { colors, fontFamilies, radii, spacing, themed } from "@/theme";
import type { EvaluatedIdea, EvidenceRef } from "@/types/innovator";

const VERDICT: Record<string, { label: string; tone: "success" | "warning" | "error" }> = {
  feasible: { label: "Feasible", tone: "success" },
  stretch: { label: "Stretch", tone: "warning" },
  not_feasible: { label: "Not feasible", tone: "error" },
};

const SIMILARITY_TONE: Record<string, "success" | "info" | "warning" | "neutral"> = {
  strongly_differentiated: "success",
  potentially_differentiated: "info",
  significant_existing_overlap: "warning",
  insufficient_evidence: "neutral",
};

const SIMILARITY_SHORT: Record<string, string> = {
  strongly_differentiated: "Differentiated",
  potentially_differentiated: "Possibly new angle",
  significant_existing_overlap: "Overlaps existing work",
  insufficient_evidence: "Novelty unclear",
};

const SOURCE_ICON: Record<string, IconName> = {
  academic_paper: "document",
  github_repository: "build",
  github_issue: "chat",
  dataset: "folder",
  news_article: "language",
};

const pretty = (text: string) => text.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

function Section({ icon, title, children }: { icon: IconName; title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Icon name={icon} size={13} color={colors.veya.lavender} />
        <AppText variant="eyebrow" tone="secondary">
          {title}
        </AppText>
      </View>
      {children}
    </View>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <View style={styles.bullets}>
      {items.map((item, index) => (
        <AppText key={`${index}-${item}`} variant="bodySmall" tone="secondary">
          •  {item}
        </AppText>
      ))}
    </View>
  );
}

function SourceRow({ source }: { source: EvidenceRef }) {
  const year = source.published_date?.slice(0, 4);
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`Open source: ${source.title}`}
      onPress={() => void WebBrowser.openBrowserAsync(source.url)}
      style={({ pressed }) => [styles.source, pressed && styles.pressed]}
    >
      <Icon name={SOURCE_ICON[source.source_type] ?? "share"} size={14} color={colors.text.secondary} />
      <View style={styles.sourceText}>
        <AppText variant="bodySmall" numberOfLines={2}>
          {source.title}
        </AppText>
        <AppText variant="caption" tone="muted">
          {pretty(source.source_type)}
          {year ? ` · ${year}` : ""}
        </AppText>
      </View>
      <Icon name="share" size={13} color={colors.text.muted} />
    </Pressable>
  );
}

/** One recommended idea: the gist up front, the evidence and scoring one tap away. */
/** `rank` 0 = a near-miss shown because nothing passed every check. */
export function IdeaResultCard({ evaluated, rank }: { evaluated: EvaluatedIdea; rank: number }) {
  const router = useRouter();
  const { idea, feasibility, similarity } = evaluated;
  const refining = useInnovatorStore((state) => Boolean(state.refining[idea.idea_id]));
  const refineError = useInnovatorStore((state) => state.refineErrors[idea.idea_id] ?? null);
  const savedId = useInnovatorStore((state) => state.saved[idea.idea_id]);
  const refine = useInnovatorStore((state) => state.refine);
  const saveToIdeas = useInnovatorStore((state) => state.saveToIdeas);

  const [open, setOpen] = useState(false);
  const [refineOpen, setRefineOpen] = useState(false);
  const [feedback, setFeedback] = useState("");

  const verdict = feasibility ? VERDICT[feasibility.verdict] : undefined;
  const sources = [...idea.supporting_evidence, ...(similarity?.closest_matches.map((match) => match.evidence) ?? [])].filter(
    (source, index, all) => all.findIndex((other) => other.evidence_id === source.evidence_id) === index,
  );

  const submitRefine = async () => {
    if (feedback.trim().length < 3) return;
    haptics.selection();
    if (await refine(idea.idea_id, feedback)) {
      setFeedback("");
      setRefineOpen(false);
      haptics.success();
    }
  };

  const save = () => {
    haptics.success();
    const id = saveToIdeas(evaluated);
    router.push({ pathname: "/ideas/[id]", params: { id } });
  };

  return (
    <View style={styles.card}>
      <View style={styles.top}>
        <View style={styles.rank}>
          {rank > 0 ? <AppText style={styles.rankText}>{rank}</AppText> : <Icon name="warning" size={14} color={colors.semantic.warning} />}
        </View>
        <View style={styles.titleWrap}>
          <AppText variant="h3">{idea.title}</AppText>
          {idea.revision > 0 ? (
            <AppText variant="caption" tone="muted">
              Refined {idea.revision}×
            </AppText>
          ) : null}
        </View>
        {evaluated.score !== null ? (
          <View style={styles.score} accessible accessibilityLabel={`Score ${Math.round(evaluated.score)} out of 100`}>
            <AppText style={styles.scoreValue}>{Math.round(evaluated.score)}</AppText>
            <AppText variant="caption" tone="muted">
              / 100
            </AppText>
          </View>
        ) : null}
      </View>

      <View style={styles.chips}>
        {verdict ? <Chip label={verdict.label} tone={verdict.tone} /> : null}
        {similarity ? <Chip label={SIMILARITY_SHORT[similarity.label] ?? similarity.label_text} tone={SIMILARITY_TONE[similarity.label] ?? "neutral"} /> : null}
        {sources.length ? <Chip label={`${sources.length} sources`} tone="accent" /> : null}
      </View>

      {rank === 0 && evaluated.rejection_reason ? (
        <View style={styles.nearMiss}>
          <AppText variant="bodySmall" tone="warning">
            {evaluated.rejection_reason}
          </AppText>
          {evaluated.critique?.issues.length ? <Bullets items={evaluated.critique.issues.slice(0, 4)} /> : null}
          <AppText variant="caption" tone="muted">
            Refine it with what you know, and Veya will check it again.
          </AppText>
        </View>
      ) : null}

      <Section icon="target" title="Problem">
        <AppText variant="bodyMedium" tone="secondary">
          {idea.problem_statement}
        </AppText>
      </Section>

      <Section icon="idea" title="The idea">
        <AppText variant="bodyMedium">{idea.proposed_solution}</AppText>
      </Section>

      {idea.differentiator ? (
        <Section icon="sparkle" title="What's different">
          <AppText variant="bodyMedium" tone="secondary">
            {idea.differentiator}
          </AppText>
        </Section>
      ) : null}

      {feasibility?.minimum_credible_demo ? (
        <Section icon="rocket" title="Smallest demo that proves it">
          <AppText variant="bodyMedium" tone="secondary">
            {feasibility.minimum_credible_demo}
          </AppText>
        </Section>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => {
          haptics.selection();
          setOpen((value) => !value);
        }}
        style={styles.toggle}
      >
        <AppText variant="bodySmall" tone="accent" style={styles.toggleText}>
          {open ? "Hide details" : "Evidence, scoring and plan"}
        </AppText>
        <Icon name="chevronDown" size={14} color={colors.veya.lavender} style={open && styles.flip} />
      </Pressable>

      {open ? (
        <View style={styles.details}>
          {idea.identified_gap ? (
            <Section icon="flag" title="Gap it fills">
              <AppText variant="bodySmall" tone="secondary">
                {idea.identified_gap}
              </AppText>
            </Section>
          ) : null}

          {evaluated.selection_reason ? (
            <Section icon="checkCircle" title="Why it was picked">
              <AppText variant="bodySmall" tone="secondary">
                {evaluated.selection_reason}
              </AppText>
            </Section>
          ) : null}

          <Section icon="build" title="Build plan">
            <Bullets
              items={[
                idea.required_technologies.length ? `Tech: ${idea.required_technologies.join(", ")}` : "",
                idea.hardware_requirements.length ? `Hardware: ${idea.hardware_requirements.join(", ")}` : "",
                idea.estimated_budget ? `Budget: ${idea.estimated_budget}` : "",
                idea.estimated_timeline ? `Timeline: ${idea.estimated_timeline}` : "",
                feasibility?.skills_to_learn.length ? `Learn: ${feasibility.skills_to_learn.join(", ")}` : "",
                feasibility?.exclude_from_prototype.length ? `Leave out for now: ${feasibility.exclude_from_prototype.join(", ")}` : "",
              ].filter(Boolean)}
            />
          </Section>

          {idea.risks.length || feasibility?.blockers.length ? (
            <Section icon="warning" title="Risks">
              <Bullets items={[...(feasibility?.blockers ?? []), ...idea.risks]} />
            </Section>
          ) : null}

          {similarity?.explanation ? (
            <Section icon="people" title="Compared with existing work">
              <AppText variant="bodySmall" tone="secondary">
                {similarity.explanation}
              </AppText>
            </Section>
          ) : null}

          {evaluated.score_breakdown.length ? (
            <Section icon="star" title="How the score adds up">
              <View style={styles.bars}>
                {evaluated.score_breakdown.map((row) => (
                  <View key={row.criterion} style={styles.barRow} accessible accessibilityLabel={`${pretty(row.criterion)}: ${row.score_0_10.toFixed(1)} of 10`}>
                    <AppText variant="caption" tone="secondary" style={styles.barLabel} numberOfLines={1}>
                      {pretty(row.criterion)}
                    </AppText>
                    <View style={styles.barTrack}>
                      <View style={[styles.barFill, { width: `${Math.max(4, row.score_0_10 * 10)}%` }]} />
                    </View>
                    <AppText variant="caption" tone="muted" style={styles.barValue}>
                      {row.score_0_10.toFixed(1)}
                    </AppText>
                  </View>
                ))}
              </View>
            </Section>
          ) : null}

          {sources.length ? (
            <Section icon="document" title="Sources">
              <View style={styles.sources}>
                {sources.map((source) => (
                  <SourceRow key={source.evidence_id} source={source} />
                ))}
              </View>
            </Section>
          ) : null}
        </View>
      ) : null}

      {refineOpen ? (
        <View style={styles.refine}>
          <TextField
            label="What should change?"
            placeholder="e.g. make it cheaper, no camera, use only Python"
            value={feedback}
            onChangeText={setFeedback}
            multiline
            maxLength={2000}
            editable={!refining}
          />
          {refining ? (
            <AppText variant="caption" tone="muted">
              Rewriting and re-checking the idea. This can take a couple of minutes.
            </AppText>
          ) : null}
          <View style={styles.actions}>
            <Button label="Cancel" variant="ghost" size="small" onPress={() => setRefineOpen(false)} disabled={refining} style={styles.action} />
            <Button
              label="Refine"
              size="small"
              icon="sparkle"
              onPress={() => void submitRefine()}
              loading={refining}
              disabled={feedback.trim().length < 3}
              style={styles.action}
            />
          </View>
        </View>
      ) : null}
      <FormMessage message={refineError} />

      {!refineOpen ? (
        <View style={styles.actions}>
          <Button label="Refine" variant="ghost" size="small" icon="edit" onPress={() => setRefineOpen(true)} style={styles.action} />
          <Button
            label={savedId ? "Open in Ideas" : "Save to Ideas"}
            size="small"
            icon={savedId ? "arrowRight" : "save"}
            onPress={save}
            style={styles.action}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing[4],
    padding: spacing[4],
    borderRadius: radii.xl - 4,
    borderWidth: 1,
    borderColor: themed("rgba(196, 181, 253, 0.2)"),
    backgroundImage: themed("linear-gradient(165deg, rgba(124, 58, 237, 0.16) 0%, rgba(15, 14, 23, 0.92) 55%)"),
  },
  top: { flexDirection: "row", alignItems: "flex-start", gap: spacing[3] },
  rank: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.overlay.lavenderSoft,
    borderWidth: 1,
    borderColor: colors.overlay.lavenderBorder,
  },
  rankText: { fontFamily: fontFamilies.bold, fontSize: 14, color: colors.veya.lavender },
  titleWrap: { flex: 1, gap: 2 },
  score: { alignItems: "flex-end" },
  scoreValue: { fontFamily: fontFamilies.bold, fontSize: 22, lineHeight: 26, color: colors.veya.lavender },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing[2] },
  section: { gap: spacing[1] + 2 },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  bullets: { gap: 4 },
  toggle: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", minHeight: 32 },
  toggleText: { fontFamily: fontFamilies.semibold },
  flip: { transform: [{ rotate: "180deg" }] },
  details: { gap: spacing[4], paddingTop: spacing[1], borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.overlay.borderStrong },
  bars: { gap: spacing[2] },
  barRow: { flexDirection: "row", alignItems: "center", gap: spacing[2] },
  barLabel: { width: 112 },
  barTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.overlay.lavenderSoft, overflow: "hidden" },
  barFill: { height: 6, borderRadius: 3, backgroundColor: colors.veya.violet },
  barValue: { width: 28, textAlign: "right" },
  sources: { gap: spacing[2] },
  nearMiss: {
    gap: spacing[2],
    padding: spacing[3],
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: "rgba(255, 200, 0, 0.3)",
    backgroundColor: "rgba(255, 200, 0, 0.06)",
  },
  source: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    padding: spacing[3],
    borderRadius: radii.md,
    backgroundColor: colors.overlay.surfaceGlass,
    borderWidth: 1,
    borderColor: colors.overlay.borderStrong,
  },
  sourceText: { flex: 1, gap: 2 },
  pressed: { opacity: 0.7 },
  refine: { gap: spacing[3] },
  actions: { flexDirection: "row", gap: spacing[3] },
  action: { flex: 1 },
});
