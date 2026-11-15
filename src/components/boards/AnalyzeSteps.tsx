import { useEffect, useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import Animated, { Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";

import { haptics } from "@/lib/haptics";
import { enterSoft, fadeSoft } from "@/lib/softMotion";
import { colors, fontFamilies, spacing } from "@/theme";
import type { BoardRating, IdeaCheck, ImprovePlan } from "@/types/api";

import { AppText } from "../AppText";
import { Icon, type IconName } from "../Icon";
import { Group, NEUTRAL, RADIUS, Row, TABULAR } from "../ui/Grouped";

// The Analyze page stays in plain greys (not tinted by the theme).
const HAIRLINE = NEUTRAL.hairline;
const GROUP_BG = NEUTRAL.background;

/**
 * The Analyze page's building blocks, in a quiet, native style: grouped
 * lists with hairline dividers, one accent colour (the folder's) used
 * sparingly, tabular numbers, and no decoration that doesn't carry meaning.
 */

/** New content fades in (no bounce). */
export const STEP_ENTER = enterSoft;

export { Group, NeutralGroups, Row, SectionHeader } from "../ui/Grouped";
export const ANALYZE_HAIRLINE = NEUTRAL.hairline;

/** Thin step progress: one segment per step, filled when it's done. */
export function StepProgress({ steps, done, color }: { steps: string[]; done: number; color: string }) {
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={`Step ${Math.min(done + 1, steps.length)} of ${steps.length}`}>
      <View style={styles.progress}>
        {steps.map((step, index) => (
          <View key={step} style={[styles.progressSegment, { backgroundColor: index < done ? color : HAIRLINE }]} />
        ))}
      </View>
      <View style={styles.progressLabels}>
        {steps.map((step, index) => (
          <AppText
            key={step}
            variant="caption"
            numberOfLines={1}
            style={[styles.progressLabel, index === done && { color: colors.text.primary }]}
          >
            {step}
          </AppText>
        ))}
      </View>
    </View>
  );
}

/** The next action, pinned above the home indicator. */
export function ActionBar({
  label,
  caption,
  icon,
  color,
  onPress,
  busy = false,
  disabled = false,
  bottomInset,
}: {
  label: string;
  caption?: string;
  icon?: IconName;
  color: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  bottomInset: number;
}) {
  const off = busy || disabled;
  return (
    <View style={[styles.actionBar, { paddingBottom: Math.max(bottomInset, spacing[3]) }]}>
      {caption ? (
        <AppText variant="caption" tone="muted" align="center" numberOfLines={1}>
          {caption}
        </AppText>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: off, busy }}
        accessibilityLabel={label}
        disabled={off}
        onPress={() => {
          haptics.light();
          onPress();
        }}
        style={({ pressed }) => [styles.action, { backgroundColor: color, opacity: off ? 0.45 : pressed ? 0.85 : 1 }]}
      >
        {busy ? <ActivityIndicator size="small" color={colors.text.inverse} /> : icon ? <Icon name={icon} size={16} color={colors.text.inverse} /> : null}
        <AppText variant="button" style={styles.actionLabel} numberOfLines={1}>
          {label}
        </AppText>
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Working state
// ---------------------------------------------------------------------------

/**
 * "Cooking" while Veya works: a calm pulsing dot, the current line (it fades
 * to the next every few seconds), the seconds so far, and a hairline that
 * keeps moving so it never looks stuck.
 */
export function Cooking({ lines, color }: { lines: string[]; color: string }) {
  const pulse = useSharedValue(0);
  const sweep = useSharedValue(0);
  const trackWidth = useSharedValue(0);
  const [line, setLine] = useState(0);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    pulse.set(withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.sin) }), -1, true, undefined, ReduceMotion.System));
    sweep.set(withRepeat(withTiming(1, { duration: 1300, easing: Easing.inOut(Easing.cubic) }), -1, false, undefined, ReduceMotion.System));
  }, [pulse, sweep]);
  useEffect(() => {
    const lineTimer = setInterval(() => setLine((current) => (current + 1) % lines.length), 3200);
    const clock = setInterval(() => setSeconds((current) => current + 1), 1000);
    return () => {
      clearInterval(lineTimer);
      clearInterval(clock);
    };
  }, [lines.length]);

  const dot = useAnimatedStyle(() => ({ opacity: 0.35 + 0.65 * pulse.get() }));
  const bar = useAnimatedStyle(() => ({ transform: [{ translateX: trackWidth.get() * (-0.35 + 1.35 * sweep.get()) }] }));

  return (
    <Animated.View entering={STEP_ENTER} style={styles.group} accessibilityLiveRegion="polite" accessibilityLabel={`Cooking. ${lines[line]}`}>
      <View style={styles.row}>
        <Animated.View style={[styles.cookingDot, { backgroundColor: color }, dot]} />
        <View style={styles.rowText}>
          <AppText variant="bodyMedium" style={styles.rowTitle}>
            Cooking
          </AppText>
          <Animated.View key={line} entering={fadeSoft}>
            <AppText variant="bodySmall" tone="muted" numberOfLines={1}>
              {lines[line]}
            </AppText>
          </Animated.View>
        </View>
        <AppText variant="bodySmall" tone="muted" style={TABULAR}>
          {seconds}s
        </AppText>
      </View>
      <View style={styles.track} onLayout={(event) => trackWidth.set(event.nativeEvent.layout.width)}>
        <Animated.View style={[styles.trackFill, { backgroundColor: color }, bar]} />
      </View>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

/** An idea or a saved project in an analysis. */
export type BoardItem = {
  key: `idea:${string}` | `project:${string}`;
  kind: "idea" | "project";
  title: string;
  /** "What it is": labelled lines (overview, problem, solution...). Empty while a project loads. */
  summary: { label: string; text: string }[];
  updatedAt: string;
};

/**
 * Why the strongest project wins, in a few lines: the reason, its strengths,
 * and how the others ranked. The full details live on each project's page.
 */
export function WhyCard({ rating, titles, color }: { rating: BoardRating; titles: Record<string, string>; color: string }) {
  const ranked = rating.ratings.filter((item) => titles[item.idea_id]);
  const winner = ranked.find((item) => item.idea_id === rating.best_idea_id) ?? ranked[0];
  if (!winner) return null;
  const runnerUp = ranked.find((item) => item.idea_id !== winner.idea_id);

  return (
    <Animated.View entering={STEP_ENTER} style={styles.group}>
      <View style={styles.winner}>
        <View style={styles.winnerHead}>
          <View style={[styles.dot, { backgroundColor: color }]} />
          <AppText variant="caption" style={styles.sectionTitle}>
            Strongest
          </AppText>
        </View>
        <View style={styles.winnerTitle}>
          <AppText variant="h4" style={[styles.rowTitle, styles.rowText]} numberOfLines={2}>
            {titles[winner.idea_id]}
          </AppText>
          <AppText variant="h4" style={[TABULAR, styles.rowTitle, { color }]}>
            {winner.total}
          </AppText>
        </View>
        {rating.best_reason ? (
          <AppText variant="bodySmall" tone="secondary">
            {rating.best_reason}
          </AppText>
        ) : null}
        {winner.strengths.slice(0, 3).map((strength) => (
          <View key={strength} style={styles.point}>
            <View style={styles.pointMark} />
            <AppText variant="bodySmall" tone="secondary" style={styles.rowText}>
              {strength}
            </AppText>
          </View>
        ))}
        {runnerUp ? (
          <AppText variant="caption" tone="muted" style={styles.meta}>
            {winner.total - runnerUp.total > 0 ? `${winner.total - runnerUp.total} points ahead of ${titles[runnerUp.idea_id]}` : `Level with ${titles[runnerUp.idea_id]}`}
          </AppText>
        ) : null}
      </View>
      {ranked.length > 1
        ? ranked.map((item, index) => (
            <View key={item.idea_id}>
              <View style={styles.divider} />
              <View style={styles.rankRow}>
                <AppText variant="bodySmall" style={[styles.changeNumber, TABULAR, { color: item.idea_id === winner.idea_id ? color : colors.text.muted }]}>
                  {String(index + 1).padStart(2, "0")}
                </AppText>
                <AppText variant="bodyMedium" numberOfLines={1} style={[styles.rowText, item.idea_id === winner.idea_id ? styles.rowTitle : styles.rankTitle]}>
                  {titles[item.idea_id]}
                </AppText>
                <AppText variant="bodyMedium" style={[TABULAR, item.idea_id === winner.idea_id ? { color } : styles.rankTitle]}>
                  {item.total}
                </AppText>
              </View>
            </View>
          ))
        : null}
    </Animated.View>
  );
}

const CHECK_DOT = {
  significant_existing_overlap: colors.semantic.warning,
  potentially_differentiated: colors.semantic.info,
  strongly_differentiated: colors.semantic.success,
  insufficient_evidence: colors.text.muted,
} as const;

/** For each project: how close it is to what already exists, and the closest matches. */
export function ChecksCard({
  rows,
  onOpen,
}: {
  rows: { key: string; title: string; check: IdeaCheck | undefined; error?: string }[];
  color: string;
  onOpen: (key: string) => void;
}) {
  return (
    <Group>
      {rows.map((row) => {
        const closest = row.check?.similar_projects.slice(0, 2).map((project) => project.title).join(", ");
        const subtitle = row.check ? `${row.check.label_text}${closest ? ` · ${closest}` : ""}` : (row.error ?? "Not checked");
        return (
          <Row
            key={row.key}
            title={row.title}
            subtitle={subtitle}
            onPress={row.check ? () => onOpen(row.key) : undefined}
            leading={<View style={[styles.dot, { backgroundColor: row.check ? CHECK_DOT[row.check.label] : HAIRLINE }]} />}
            trailing={row.check ? <Icon name="chevronRight" size={13} color={colors.text.muted} /> : undefined}
          />
        );
      })}
    </Group>
  );
}

/** The changes, numbered, with what each one helps and which existing project it beats. */
export function ImprovementCard({ plan, color, footer }: { plan: ImprovePlan; title: string; color: string; footer?: ReactNode }) {
  return (
    <Animated.View entering={STEP_ENTER} style={styles.group}>
      {plan.summary ? (
        <View style={styles.summary}>
          <AppText variant="bodyMedium" tone="secondary">
            {plan.summary}
          </AppText>
        </View>
      ) : null}
      {plan.changes.map((change, index) => (
        <View key={change.title}>
          <View style={styles.divider} />
          <View style={styles.change}>
            <AppText variant="bodySmall" style={[styles.changeNumber, TABULAR, { color }]}>
              {String(index + 1).padStart(2, "0")}
            </AppText>
            <View style={styles.rowText}>
              <AppText variant="bodyMedium" style={styles.rowTitle}>
                {change.title}
              </AppText>
              {change.detail ? (
                <AppText variant="bodySmall" tone="secondary">
                  {change.detail}
                </AppText>
              ) : null}
              {change.helps_with || change.beats ? (
                <AppText variant="caption" tone="muted" style={styles.meta}>
                  {[change.helps_with, change.beats ? `Ahead of ${change.beats}` : ""].filter(Boolean).join("  ·  ")}
                </AppText>
              ) : null}
            </View>
          </View>
        </View>
      ))}
      {footer ? (
        <>
          <View style={styles.divider} />
          <View style={styles.footerRow}>{footer}</View>
        </>
      ) : null}
    </Animated.View>
  );
}

/** A project after its plan was changed: tap to open it. */
export function DoneCard({
  title,
  summary,
  changedSections,
  color,
  onOpen,
}: {
  title: string;
  summary: string;
  changedSections: string[];
  color: string;
  onOpen: () => void;
}) {
  return (
    <Group>
      <Row
        title={title}
        subtitle={changedSections.length ? `Updated ${changedSections.join(", ")}` : summary}
        numberOfLines={2}
        onPress={onOpen}
        accessibilityLabel={`Done changing ${title}. Opens the project.`}
        leading={
          <View style={[styles.doneIcon, { backgroundColor: color }]}>
            <Icon name="check" size={12} color={colors.text.inverse} weight="semibold" />
          </View>
        }
        trailing={
          <View style={styles.trailing}>
            <AppText variant="bodySmall" tone="muted">
              Open
            </AppText>
            <Icon name="chevronRight" size={13} color={colors.text.muted} />
          </View>
        }
      />
    </Group>
  );
}

const styles = StyleSheet.create({
  sectionHeader: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingHorizontal: spacing[1],
    marginTop: spacing[6],
    marginBottom: spacing[2],
  },
  sectionTitle: { fontFamily: fontFamilies.medium, letterSpacing: 0.4, textTransform: "uppercase", color: colors.text.muted },
  sectionAction: { fontFamily: fontFamilies.medium, color: colors.text.secondary },
  group: { borderRadius: RADIUS, backgroundColor: GROUP_BG, borderWidth: StyleSheet.hairlineWidth, borderColor: HAIRLINE, overflow: "hidden" },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: HAIRLINE, marginLeft: spacing[4] },
  row: { flexDirection: "row", alignItems: "center", gap: spacing[3], minHeight: 56, paddingHorizontal: spacing[4], paddingVertical: spacing[3] },
  rowPressed: { backgroundColor: "rgba(255, 255, 255, 0.04)" },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontFamily: fontFamilies.medium, color: colors.text.primary },
  trailing: { flexDirection: "row", alignItems: "center", gap: 4 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  progress: { flexDirection: "row", gap: 4 },
  progressSegment: { flex: 1, height: 3, borderRadius: 2 },
  progressLabels: { flexDirection: "row", gap: 4, marginTop: spacing[2] },
  progressLabel: { flex: 1, color: colors.text.muted, fontFamily: fontFamilies.medium },
  actionBar: {
    gap: spacing[2],
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: HAIRLINE,
    backgroundColor: colors.veya.background,
  },
  action: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing[2], minHeight: 50, borderRadius: 12 },
  actionLabel: { color: colors.text.inverse },
  cookingDot: { width: 8, height: 8, borderRadius: 4 },
  track: { height: 2, overflow: "hidden", backgroundColor: HAIRLINE },
  trackFill: { width: "35%", height: 2 },
  winner: { gap: 4, padding: spacing[4] },
  winnerHead: { flexDirection: "row", alignItems: "center", gap: spacing[2] },
  winnerTitle: { flexDirection: "row", alignItems: "baseline", gap: spacing[3] },
  point: { flexDirection: "row", gap: spacing[3], alignItems: "flex-start" },
  pointMark: { width: 3, height: 3, borderRadius: 2, marginTop: 9, backgroundColor: colors.text.muted },
  rankRow: { flexDirection: "row", alignItems: "center", gap: spacing[3], paddingHorizontal: spacing[4], minHeight: 44 },
  rankTitle: { color: colors.text.secondary },
  summary: { padding: spacing[4] },
  change: { flexDirection: "row", gap: spacing[3], alignItems: "flex-start", padding: spacing[4] },
  changeNumber: { fontFamily: fontFamilies.semibold, width: 22, paddingTop: 1 },
  meta: { marginTop: 2 },
  footerRow: { paddingHorizontal: spacing[4], paddingVertical: spacing[3] },
  doneIcon: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
});
