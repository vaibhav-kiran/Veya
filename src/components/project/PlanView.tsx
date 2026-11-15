import { useMemo, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, View, type StyleProp, type TextStyle } from "react-native";
import Animated from "react-native-reanimated";

import { haptics } from "@/lib/haptics";
import { fadeSoft } from "@/lib/softMotion";
import { isPlaceholderValue, parseInline, parsePlan, type PlanBlock, type PlanSection } from "@/lib/planMarkdown";
import { colors, fontFamilies, radii, spacing, themed } from "@/theme";

import { AppText } from "../AppText";
import { GROUP_BG, HAIRLINE } from "../ui/Grouped";
import { Icon } from "../Icon";

/** Sections open on first view; the rest show a one-line preview until tapped. */
const INITIALLY_OPEN = 3;
/** Short items in these sections read better as chips than as a list. */
const CHIP_SECTION = /(user|audience|feature|stakeholder|tag|skill)/i;
const CHIP_MAX_LENGTH = 40;

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
                  <AppText style={styles.stepNumber}>{String(index + 1).padStart(2, "0")}</AppText>
                  {last ? null : <View style={styles.stepLine} />}
                </View>
                <RichText text={item} style={[styles.flex, !last && styles.stepText]} />
              </View>
            );
          })}
        </View>
      );

    case "code":
      return (
        <View style={styles.code}>
          {block.language ? <AppText style={styles.codeLanguage}>{block.language}</AppText> : null}
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <AppText selectable style={styles.codeText}>
              {block.text}
            </AppText>
          </ScrollView>
        </View>
      );

    case "table":
      // Phones are too narrow for wide tables: each row becomes a small card,
      // its first cell as the title and the others as "header: value" lines.
      return (
        <View style={styles.list}>
          {block.rows.map((row, rowIndex) => (
            <View key={rowIndex} style={styles.facts}>
              <View style={styles.tableTitle}>
                <RichText text={row[0] ?? ""} style={styles.bold} />
              </View>
              {block.headers.slice(1).map((header, cellIndex) =>
                row[cellIndex + 1] ? (
                  <View key={cellIndex} style={[styles.factRow, styles.factDivider]}>
                    <AppText style={styles.factLabel}>{header}</AppText>
                    <RichText text={row[cellIndex + 1]} style={styles.factValue} />
                  </View>
                ) : null,
              )}
            </View>
          ))}
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
  if (first.kind === "code") return first.text.split("\n")[0];
  if (first.kind === "table") return first.rows.map((row) => row[0]).join(" · ");
  return first.items.map((item) => item.replace(/\*\*/g, "")).join(" · ");
}

function SectionCard({ section, index, initiallyOpen }: { section: PlanSection; index: number; initiallyOpen: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  const number = section.number ?? String(index + 1);
  return (
    <View>
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
        <AppText style={styles.number}>{/^\d+$/.test(number) ? number.padStart(2, "0") : number}</AppText>
        <View style={styles.headerText}>
          <AppText variant="bodyMedium" style={styles.sectionTitle} numberOfLines={2}>
            {section.title}
          </AppText>
          {!open ? (
            <AppText variant="bodySmall" tone="muted" numberOfLines={1}>
              {previewOf(section)}
            </AppText>
          ) : null}
        </View>
        <Icon name="chevronDown" size={13} color={colors.text.muted} style={open ? styles.chevronOpen : undefined} />
      </Pressable>
      {open ? (
        <Animated.View entering={fadeSoft} style={styles.cardBody}>
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
  /** Heading card text; defaults to the blueprint wording. */
  heroTitle?: string;
  heroSubtitle?: string;
  /** How many sections start open. */
  openSections?: number;
};

/** Veya's generated plan, laid out as themed section cards instead of raw Markdown. */
export function PlanView({ markdown, projectTitle, heroTitle, heroSubtitle, openSections = INITIALLY_OPEN }: PlanViewProps) {
  const plan = useMemo(() => parsePlan(markdown, projectTitle), [markdown, projectTitle]);

  // Not structured as sections (e.g. a short answer): show it as clean text.
  if (plan.sections.length === 0) {
    return (
      <View style={[styles.group, styles.cardBody, styles.plain]}>
        {plan.intro.map((block, index) => (
          <Block key={index} block={block} sectionTitle="" />
        ))}
      </View>
    );
  }

  return (
    <View style={styles.plan}>
      <View style={styles.hero}>
        <AppText variant="h4" style={styles.sectionTitle}>
          {heroTitle ?? "Your project blueprint"}
        </AppText>
        <AppText variant="bodySmall" tone="muted">
          {heroSubtitle ?? `${plan.sections.length} parts, from the problem to a demo-ready build`}
        </AppText>
      </View>
      {plan.intro.length ? (
        <View style={styles.intro}>
          {plan.intro.map((block, index) => (
            <Block key={index} block={block} sectionTitle="" />
          ))}
        </View>
      ) : null}
      <View style={styles.group}>
        {plan.sections.map((section, index) => (
          <View key={`${section.title}-${index}`}>
            {index > 0 ? <View style={styles.divider} /> : null}
            <SectionCard section={section} index={index} initiallyOpen={index < openSections} />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: HAIRLINE, backgroundColor: GROUP_BG, overflow: "hidden" },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: HAIRLINE, marginLeft: spacing[4] },
  number: { width: 26, fontFamily: fontFamilies.semibold, fontSize: 12, color: colors.text.muted, fontVariant: ["tabular-nums"] },
  sectionTitle: { fontFamily: fontFamilies.medium, color: colors.text.primary },
  flex: { flex: 1 },
  bold: { fontFamily: fontFamilies.semibold },
  plan: { gap: spacing[3] },
  hero: { gap: 2, paddingHorizontal: spacing[1], paddingBottom: spacing[1] },
  intro: { gap: spacing[2], paddingHorizontal: spacing[1] },
  card: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: HAIRLINE, backgroundColor: GROUP_BG },
  plain: { paddingTop: spacing[4] },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: spacing[3], paddingHorizontal: spacing[4], paddingVertical: spacing[3], minHeight: 56 },
  headerText: { flex: 1, gap: 2 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  chevronOpen: { transform: [{ rotate: "180deg" }] },
  cardBody: { paddingHorizontal: spacing[4], paddingBottom: spacing[4], gap: spacing[3] },
  paragraph: { lineHeight: 22 },
  list: { gap: spacing[2] },
  bulletRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing[3] },
  bulletDot: { width: 3, height: 3, borderRadius: 2, marginTop: 10, backgroundColor: colors.text.muted },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing[2] },
  chip: { paddingHorizontal: spacing[3], paddingVertical: 5, borderRadius: radii.full, borderWidth: StyleSheet.hairlineWidth, borderColor: HAIRLINE },
  chipText: { fontFamily: fontFamilies.medium, fontSize: 13, lineHeight: 18, color: colors.text.secondary },
  stepRow: { flexDirection: "row", gap: spacing[3] },
  stepRail: { alignItems: "center", width: 22 },
  stepNumber: { fontFamily: fontFamilies.semibold, fontSize: 12, lineHeight: 22, color: colors.text.muted, fontVariant: ["tabular-nums"] },
  stepLine: { flex: 1, width: StyleSheet.hairlineWidth, marginVertical: 4, backgroundColor: HAIRLINE },
  stepText: { paddingBottom: spacing[4] },
  facts: { borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: HAIRLINE },
  factRow: { flexDirection: "row", gap: spacing[3], paddingHorizontal: spacing[3], paddingVertical: spacing[3] },
  factDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: HAIRLINE },
  factLabel: { width: "36%", fontFamily: fontFamilies.medium, fontSize: 12, lineHeight: 20, color: colors.text.muted },
  factValue: { flex: 1 },
  tableTitle: { paddingHorizontal: spacing[3], paddingVertical: spacing[2] },
  code: {
    gap: spacing[1],
    padding: spacing[3],
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.overlay.borderStrong,
    backgroundColor: themed("rgba(8, 7, 14, 0.85)"),
  },
  codeLanguage: { fontFamily: fontFamilies.semibold, fontSize: 11, lineHeight: 14, letterSpacing: 0.4, color: colors.text.muted },
  codeText: {
    fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }),
    fontSize: 12,
    lineHeight: 18,
    color: colors.text.secondary,
  },
});
