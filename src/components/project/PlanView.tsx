import { useMemo, useState } from "react";
import { Pressable, StyleSheet, View, type StyleProp, type TextStyle } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

import { haptics } from "@/lib/haptics";
import { isPlaceholderValue, parseInline, parsePlan, type PlanBlock, type PlanSection } from "@/lib/planMarkdown";
import { colors, fontFamilies, gradients, radii, spacing, themed } from "@/theme";

import { AppText } from "../AppText";
import { Icon, type IconName } from "../Icon";

/** Sections open on first view; the rest show a one-line preview until tapped. */
const INITIALLY_OPEN = 3;
/** Short items in these sections read better as chips than as a list. */
const CHIP_SECTION = /(user|audience|feature|stakeholder|tag|skill)/i;
const CHIP_MAX_LENGTH = 40;

const SECTION_ICONS: { match: RegExp; icon: IconName }[] = [
  { match: /problem|pain|need/i, icon: "target" },
  { match: /solution|approach|overview|idea|concept/i, icon: "idea" },
  { match: /user|audience|stakeholder/i, icon: "people" },
  { match: /feature|scope|mvp/i, icon: "sparkle" },
  { match: /workflow|flow|process|step|implementation|plan/i, icon: "list" },
  { match: /architecture|design|system/i, icon: "build" },
  { match: /tech|stack|tool|framework/i, icon: "settings" },
  { match: /timeline|schedule|milestone|deadline/i, icon: "calendar" },
  { match: /constraint|requirement|budget/i, icon: "flag" },
  { match: /challenge|risk|limitation/i, icon: "warning" },
  { match: /hackathon|readiness|demo|pitch|launch|next/i, icon: "rocket" },
  { match: /dataset|data|model|ai|ml/i, icon: "brain" },
];

function iconFor(title: string): IconName {
  return SECTION_ICONS.find((entry) => entry.match.test(title))?.icon ?? "document";
}

/** Text with **bold** segments in the app's semibold weight. */
function RichText({ text, style, tone = "primary" }: { text: string; style?: StyleProp<TextStyle>; tone?: "primary" | "secondary" | "muted" }) {
  return (
    <AppText variant="bodyMedium" tone={tone} style={style} selectable>
      {parseInline(text).map((segment, index) => (
        <AppText key={index} variant="bodyMedium" tone={segment.bold ? "primary" : tone} style={segment.bold ? styles.bold : undefined}>
          {segment.text}
        </AppText>
      ))}
    </AppText>
  );
}

function Block({ block, sectionTitle }: { block: PlanBlock; sectionTitle: string }) {
  switch (block.kind) {
    case "paragraph":
      return <RichText text={block.text} style={styles.paragraph} />;

    case "bullets": {
      const asChips = CHIP_SECTION.test(sectionTitle) && block.items.every((item) => item.length <= CHIP_MAX_LENGTH);
      if (asChips) {
        return (
          <View style={styles.chips}>
            {block.items.map((item, index) => (
              <View key={index} style={styles.chip}>
                <AppText style={styles.chipText}>{item.replace(/\*\*/g, "")}</AppText>
              </View>
            ))}
          </View>
        );
      }
      return (
        <View style={styles.list}>
          {block.items.map((item, index) => (
            <View key={index} style={styles.bulletRow}>
              <View style={styles.bulletDot} />
              <RichText text={item} style={styles.flex} />
            </View>
          ))}
        </View>
      );
    }

    case "steps":
      return (
        <View>
          {block.items.map((item, index) => {
            const last = index === block.items.length - 1;
            return (
              <View key={index} style={styles.stepRow}>
                <View style={styles.stepRail}>
                  <View style={styles.stepBadge}>
                    <AppText style={styles.stepNumber}>{index + 1}</AppText>
                  </View>
                  {last ? null : <View style={styles.stepLine} />}
                </View>
                <RichText text={item} style={[styles.flex, !last && styles.stepText]} />
              </View>
            );
          })}
        </View>
      );

    case "facts":
      return (
        <View style={styles.facts}>
          {block.items.map((fact, index) => {
            const placeholder = isPlaceholderValue(fact.value);
            return (
              <View key={index} style={[styles.factRow, index > 0 && styles.factDivider]}>
                <AppText style={styles.factLabel}>{fact.label}</AppText>
                <RichText text={fact.value} tone={placeholder ? "muted" : "primary"} style={styles.factValue} />
              </View>
            );
          })}
        </View>
      );
  }
}

/** One-line preview shown while a section is collapsed. */
function previewOf(section: PlanSection): string {
  const first = section.blocks[0];
  if (!first) return "";
  if (first.kind === "paragraph") return first.text.replace(/\*\*/g, "");
  if (first.kind === "facts") return first.items.map((fact) => fact.value).join(" · ");
  return first.items.map((item) => item.replace(/\*\*/g, "")).join(" · ");
}

function SectionCard({ section, index, initiallyOpen }: { section: PlanSection; index: number; initiallyOpen: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  const icon = iconFor(section.title);
  return (
    <View style={styles.card}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={section.title}
        accessibilityState={{ expanded: open }}
        onPress={() => {
          haptics.selection();
          setOpen((value) => !value);
        }}
        style={styles.cardHeader}
      >
        <View style={styles.badge}>
          <AppText style={styles.badgeText}>{section.number ?? index + 1}</AppText>
        </View>
        <View style={styles.headerText}>
          <View style={styles.titleRow}>
            <Icon name={icon} size={14} color={colors.veya.lavender} />
            <AppText variant="h4" style={styles.flex} numberOfLines={2}>
              {section.title}
            </AppText>
          </View>
          {!open ? (
            <AppText variant="bodySmall" tone="secondary" numberOfLines={1}>
              {previewOf(section)}
            </AppText>
          ) : null}
        </View>
        <Icon name="chevronDown" size={14} color={colors.text.secondary} style={open ? styles.chevronOpen : undefined} />
      </Pressable>
      {open ? (
        <Animated.View entering={FadeIn.duration(180)} style={styles.cardBody}>
          {section.blocks.map((block, blockIndex) => (
            <Block key={blockIndex} block={block} sectionTitle={section.title} />
          ))}
        </Animated.View>
      ) : null}
    </View>
  );
}

type PlanViewProps = {
  markdown: string;
  projectTitle: string;
};

/** Veya's generated plan, laid out as themed section cards instead of raw Markdown. */
export function PlanView({ markdown, projectTitle }: PlanViewProps) {
  const plan = useMemo(() => parsePlan(markdown, projectTitle), [markdown, projectTitle]);

  // Not structured as sections (e.g. a short answer): show it as clean text.
  if (plan.sections.length === 0) {
    return (
      <View style={[styles.card, styles.cardBody, styles.plain]}>
        {plan.intro.map((block, index) => (
          <Block key={index} block={block} sectionTitle="" />
        ))}
      </View>
    );
  }

  return (
    <View style={styles.plan}>
      <View style={styles.hero}>
        <View style={styles.heroIcon}>
          <Icon name="sparkle" size={18} color={colors.text.inverse} />
        </View>
        <View style={styles.flex}>
          <AppText variant="h4">Your project blueprint</AppText>
          <AppText variant="bodySmall" tone="secondary">
            {plan.sections.length} parts, from the problem to a demo-ready build
          </AppText>
        </View>
      </View>
      {plan.intro.length ? (
        <View style={styles.intro}>
          {plan.intro.map((block, index) => (
            <Block key={index} block={block} sectionTitle="" />
          ))}
        </View>
      ) : null}
      {plan.sections.map((section, index) => (
        <SectionCard key={`${section.title}-${index}`} section={section} index={index} initiallyOpen={index < INITIALLY_OPEN} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  bold: { fontFamily: fontFamilies.semibold },
  plan: { gap: spacing[3] },
  hero: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    padding: spacing[4],
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: themed("rgba(196, 181, 253, 0.28)"),
    backgroundImage: themed("linear-gradient(135deg, rgba(124, 58, 237, 0.28) 0%, rgba(30, 27, 75, 0.55) 100%)"),
  },
  heroIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundImage: gradients.primaryButton,
  },
  intro: { gap: spacing[2], paddingHorizontal: spacing[1] },
  card: {
    borderRadius: radii.lg + 2,
    borderWidth: 1,
    borderColor: themed("rgba(196, 181, 253, 0.14)"),
    backgroundColor: colors.veya.surface,
  },
  plain: { paddingTop: spacing[4] },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: spacing[3], padding: spacing[4], minHeight: 60 },
  badge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.overlay.lavenderSoft,
    borderWidth: 1,
    borderColor: themed("rgba(196, 181, 253, 0.35)"),
  },
  badgeText: { fontFamily: fontFamilies.semibold, fontSize: 13, lineHeight: 16, color: colors.veya.lavender },
  headerText: { flex: 1, gap: 2 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  chevronOpen: { transform: [{ rotate: "180deg" }] },
  cardBody: { paddingHorizontal: spacing[4], paddingBottom: spacing[4], gap: spacing[3] },
  paragraph: { lineHeight: 22 },
  list: { gap: spacing[2] },
  bulletRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing[3] },
  bulletDot: { width: 6, height: 6, borderRadius: 3, marginTop: 8, backgroundColor: colors.veya.violet },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing[2] },
  chip: {
    paddingHorizontal: spacing[3],
    paddingVertical: 6,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: themed("rgba(196, 181, 253, 0.3)"),
    backgroundColor: themed("rgba(124, 58, 237, 0.14)"),
  },
  chipText: { fontFamily: fontFamilies.medium, fontSize: 13, lineHeight: 18, color: colors.veya.lavender },
  stepRow: { flexDirection: "row", gap: spacing[3] },
  stepRail: { alignItems: "center", width: 26 },
  stepBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundImage: gradients.primaryButton,
  },
  stepNumber: { fontFamily: fontFamilies.semibold, fontSize: 12, lineHeight: 15, color: colors.text.inverse },
  stepLine: { flex: 1, width: 2, marginVertical: 4, borderRadius: 1, backgroundColor: themed("rgba(196, 181, 253, 0.25)") },
  stepText: { paddingBottom: spacing[4] },
  facts: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.overlay.borderStrong,
    backgroundColor: themed("rgba(22, 20, 36, 0.6)"),
  },
  factRow: { flexDirection: "row", gap: spacing[3], paddingHorizontal: spacing[3], paddingVertical: spacing[3] },
  factDivider: { borderTopWidth: 1, borderTopColor: colors.overlay.borderStrong },
  factLabel: {
    width: "36%",
    fontFamily: fontFamilies.semibold,
    fontSize: 12,
    lineHeight: 20,
    letterSpacing: 0.3,
    color: colors.veya.lavender,
  },
  factValue: { flex: 1 },
});
