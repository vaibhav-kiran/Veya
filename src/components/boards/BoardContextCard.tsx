import * as WebBrowser from "expo-web-browser";
import { Pressable, StyleSheet, View } from "react-native";

import { haptics } from "@/lib/haptics";
import { colors, fontFamilies, radii, spacing } from "@/theme";
import type { BoardContext } from "@/types/api";

import { AppText } from "../AppText";
import { Icon } from "../Icon";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <AppText variant="caption" style={styles.label}>
        {title}
      </AppText>
      {children}
    </View>
  );
}

function Tags({ items }: { items: string[] }) {
  return (
    <View style={styles.tags}>
      {items.map((item) => (
        <View key={item} style={styles.tag}>
          <AppText variant="bodySmall" tone="secondary">
            {item}
          </AppText>
        </View>
      ))}
    </View>
  );
}

/** What Veya found out about a page's purpose: the hackathon's themes, tracks, judging criteria, dates and sources. */
export function BoardContextCard({ context }: { context: BoardContext }) {
  const isHackathon = context.purpose === "hackathon";
  return (
    <View style={styles.card}>
      {context.summary ? <AppText variant="bodyMedium">{context.summary}</AppText> : null}
      {context.notes ? (
        <AppText variant="bodySmall" tone="secondary">
          Your notes: {context.notes}
        </AppText>
      ) : null}

      {context.themes.length ? (
        <Section title="Themes">
          <Tags items={context.themes} />
        </Section>
      ) : null}
      {context.tracks.length ? (
        <Section title="Tracks">
          <Tags items={context.tracks} />
        </Section>
      ) : null}

      <Section title={isHackathon ? "Judging criteria" : "How ideas are rated"}>
        {isHackathon ? (
          <View style={styles.status}>
            <View style={[styles.dot, { backgroundColor: context.criteria_source === "official" ? colors.semantic.success : colors.text.muted }]} />
            <AppText variant="caption" tone="muted">
              {context.criteria_source === "official" ? "From the hackathon's pages" : "Typical criteria (none published)"}
            </AppText>
          </View>
        ) : null}
        {context.judging_criteria.map((criterion) => (
          <View key={criterion.name} style={styles.criterion}>
            <View style={styles.criterionHead}>
              <AppText variant="bodyMedium" style={[styles.bold, styles.flex]}>
                {criterion.name}
              </AppText>
              {criterion.weight ? (
                <AppText variant="bodySmall" tone="muted" style={styles.tabular}>
                  {criterion.weight}%
                </AppText>
              ) : null}
            </View>
            {criterion.description ? (
              <AppText variant="bodySmall" tone="secondary">
                {criterion.description}
              </AppText>
            ) : null}
          </View>
        ))}
      </Section>

      {context.dates || context.prizes ? (
        <Section title="Dates and prizes">
          {context.dates ? (
            <AppText variant="bodySmall" tone="secondary">
              <AppText variant="bodySmall" style={styles.bold}>
                Dates{"  "}
              </AppText>
              {context.dates}
            </AppText>
          ) : null}
          {context.prizes ? (
            <AppText variant="bodySmall" tone="secondary">
              <AppText variant="bodySmall" style={styles.bold}>
                Prizes{"  "}
              </AppText>
              {context.prizes}
            </AppText>
          ) : null}
        </Section>
      ) : null}

      {context.rules.length ? (
        <Section title="Rules that matter">
          {context.rules.map((rule) => (
            <View key={rule} style={styles.rule}>
              <View style={styles.ruleMark} />
              <AppText variant="bodySmall" tone="secondary" style={styles.flex}>
                {rule}
              </AppText>
            </View>
          ))}
        </Section>
      ) : null}

      {context.sources.length ? (
        <Section title="Sources">
          {context.sources.map((source) => (
            <Pressable
              key={source.url}
              accessibilityRole="link"
              accessibilityLabel={`${source.title}. Opens in the browser.`}
              onPress={() => {
                haptics.selection();
                void WebBrowser.openBrowserAsync(source.url);
              }}
              style={styles.source}
            >
              <AppText variant="bodySmall" numberOfLines={1} style={[styles.flex, styles.bold]}>
                {source.title}
              </AppText>
              <Icon name="share" size={12} color={colors.text.muted} />
            </Pressable>
          ))}
        </Section>
      ) : null}

      {context.warnings.map((warning) => (
        <AppText key={warning} variant="caption" tone="muted">
          {warning}
        </AppText>
      ))}
    </View>
  );
}

const HAIRLINE = "rgba(255, 255, 255, 0.07)";

const styles = StyleSheet.create({
  card: {
    gap: spacing[5],
    padding: spacing[4],
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: HAIRLINE,
    backgroundColor: "rgba(255, 255, 255, 0.035)",
  },
  section: { gap: spacing[2], alignItems: "flex-start" },
  label: { fontFamily: fontFamilies.medium, letterSpacing: 0.4, textTransform: "uppercase", color: colors.text.muted },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: spacing[2] },
  tag: {
    paddingHorizontal: spacing[3],
    paddingVertical: 5,
    borderRadius: radii.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: HAIRLINE,
  },
  status: { flexDirection: "row", alignItems: "center", gap: spacing[2] },
  dot: { width: 6, height: 6, borderRadius: 3 },
  criterion: { gap: 2, alignSelf: "stretch", paddingVertical: spacing[1] },
  criterionHead: { flexDirection: "row", alignItems: "baseline", gap: spacing[2] },
  tabular: { fontVariant: ["tabular-nums"] },
  rule: { flexDirection: "row", gap: spacing[3], alignItems: "flex-start", alignSelf: "stretch" },
  ruleMark: { width: 3, height: 3, borderRadius: 2, marginTop: 9, backgroundColor: colors.text.muted },
  bold: { fontFamily: fontFamilies.medium, color: colors.text.primary },
  source: { flexDirection: "row", alignItems: "center", gap: spacing[2], alignSelf: "stretch", paddingVertical: 6 },
  flex: { flex: 1 },
});
