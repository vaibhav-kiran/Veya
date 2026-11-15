import * as WebBrowser from "expo-web-browser";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { haptics } from "@/lib/haptics";
import { colors, fontFamilies, radii, spacing, themed } from "@/theme";
import type { IdeaCheck, IdeaChoice, SimilarProject } from "@/types/api";

import { AppText } from "./AppText";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { IconButton } from "./IconButton";
import { Chip } from "./StatusChip";

type ChipTone = Parameters<typeof Chip>[0]["tone"];

const LABEL_TONE: Record<IdeaCheck["label"], ChipTone> = {
  significant_existing_overlap: "warning",
  potentially_differentiated: "info",
  strongly_differentiated: "success",
  insufficient_evidence: "neutral",
};

const FEASIBILITY: Record<IdeaCheck["feasibility"]["verdict"], { label: string; tone: ChipTone }> = {
  feasible: { label: "Fits your time", tone: "success" },
  stretch: { label: "A stretch", tone: "warning" },
  not_feasible: { label: "Too big for your time", tone: "error" },
};

function sourceLine(project: SimilarProject): string {
  if (project.source === "devpost") return project.winner ? "Devpost · won a hackathon prize" : "Devpost hackathon project";
  return project.stars ? `GitHub · ${project.stars.toLocaleString()} stars` : "GitHub";
}

function SimilarProjectRow({ project }: { project: SimilarProject }) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${project.title}, ${sourceLine(project)}. Opens in the browser.`}
      onPress={() => {
        haptics.selection();
        void WebBrowser.openBrowserAsync(project.url);
      }}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={styles.rowIcon}>
        <Icon name={project.winner ? "trophy" : project.source === "devpost" ? "flag" : "folder"} size={15} color={colors.veya.lavender} />
      </View>
      <View style={styles.rowText}>
        <AppText variant="bodyMedium" numberOfLines={1} style={styles.rowTitle}>
          {project.title}
        </AppText>
        <AppText variant="caption" tone="muted">
          {sourceLine(project)}
        </AppText>
        {project.description ? (
          <AppText variant="bodySmall" tone="secondary" numberOfLines={2}>
            {project.description}
          </AppText>
        ) : null}
      </View>
      <Icon name="share" size={14} color={colors.text.muted} />
    </Pressable>
  );
}

type IdeaCheckSheetProps = {
  check: IdeaCheck;
  visible: boolean;
  onClose: () => void;
  /** Build the project with this choice. Without it the sheet only shows the check (idea pages). */
  onChoose?: (choice: IdeaChoice) => void;
  /** Heading, e.g. the idea's title on an idea page. */
  title?: string;
  /** A request is running: building is not possible right now. */
  disabled?: boolean;
};

/**
 * Idea Check, shown after the summary and before the plan: what already
 * exists (real GitHub / Devpost results), how to stand out, and whether the
 * student can build it in time. Every option builds the project.
 */
export function IdeaCheckSheet({ check, visible, onClose, onChoose, title = "Before we build", disabled = false }: IdeaCheckSheetProps) {
  const insets = useSafeAreaInsets();
  const feasibility = FEASIBILITY[check.feasibility.verdict];

  const choose = (choice: IdeaChoice) => {
    haptics.success();
    onClose();
    onChoose?.(choice);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel="Close idea check" onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing[4]) }]} accessibilityViewIsModal>
          <View style={styles.header}>
            <View style={styles.headerText}>
              <AppText variant="eyebrow" tone="accent">
                Idea check
              </AppText>
              <AppText variant="h3" accessibilityRole="header" numberOfLines={2}>
                {title}
              </AppText>
            </View>
            <IconButton icon="close" variant="plain" size={36} accessibilityLabel="Close idea check" onPress={onClose} />
          </View>

          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={false}>
            <View style={styles.section}>
              <Chip label={check.label_text} tone={LABEL_TONE[check.label]} />
              {check.explanation ? (
                <AppText variant="bodyMedium" tone="secondary">
                  {check.explanation}
                </AppText>
              ) : null}
            </View>

            <View style={styles.section}>
              <AppText variant="h4">Similar projects</AppText>
              {check.similar_projects.length ? (
                check.similar_projects.map((project) => <SimilarProjectRow key={project.url} project={project} />)
              ) : (
                <AppText variant="bodySmall" tone="secondary">
                  No close matches on GitHub or Devpost. That doesn&apos;t prove nothing similar exists.
                </AppText>
              )}
              {check.warnings.map((warning) => (
                <AppText key={warning} variant="caption" tone="muted">
                  {warning}
                </AppText>
              ))}
            </View>

            {check.angles.length ? (
              <View style={styles.section}>
                <AppText variant="h4">Ways to stand out</AppText>
                {check.angles.map((angle, index) => (
                  <View key={angle.title} style={styles.card}>
                    <AppText variant="bodyMedium" style={styles.rowTitle}>
                      {index + 1}. {angle.title}
                    </AppText>
                    {angle.description ? <AppText variant="bodySmall">{angle.description}</AppText> : null}
                    {angle.why ? (
                      <AppText variant="bodySmall" tone="secondary">
                        {angle.why}
                      </AppText>
                    ) : null}
                    {onChoose ? <Button
                      label="Build with this"
                      variant="secondary"
                      size="small"
                      icon="build"
                      iconPosition="left"
                      disabled={disabled}
                      onPress={() => choose(`angle:${index}` as IdeaChoice)}
                    /> : null}
                  </View>
                ))}
              </View>
            ) : null}

            <View style={styles.section}>
              <AppText variant="h4">Can you build it in time?</AppText>
              <Chip label={feasibility.label} tone={feasibility.tone} />
              {check.feasibility.reason ? <AppText variant="bodySmall" tone="secondary">{check.feasibility.reason}</AppText> : null}
              {check.feasibility.smaller_version ? (
                <View style={styles.card}>
                  <AppText variant="bodyMedium" style={styles.rowTitle}>
                    Smaller version
                  </AppText>
                  <AppText variant="bodySmall">{check.feasibility.smaller_version}</AppText>
                  {onChoose ? <Button
                    label="Build the smaller version"
                    variant="secondary"
                    size="small"
                    icon="build"
                    iconPosition="left"
                    disabled={disabled}
                    onPress={() => choose("smaller")}
                  /> : null}
                </View>
              ) : null}
            </View>

            {check.hackathon_fit ? (
              <View style={styles.section}>
                <AppText variant="h4">Hackathon fit</AppText>
                <AppText variant="bodySmall" tone="secondary">
                  {check.hackathon_fit}
                </AppText>
              </View>
            ) : null}
          </ScrollView>

          {onChoose ? (
            <Button label="Build it as it is" icon="build" iconPosition="left" disabled={disabled} onPress={() => choose("as_is")} />
          ) : (
            <Button label="Close" variant="secondary" onPress={onClose} />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0, 0, 0, 0.55)" },
  sheet: {
    maxHeight: "88%",
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    gap: spacing[3],
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.overlay.borderStrong,
    backgroundColor: colors.veya.surface,
  },
  header: { flexDirection: "row", alignItems: "center", gap: spacing[2] },
  headerText: { flex: 1 },
  body: { flexGrow: 0 },
  bodyContent: { gap: spacing[5], paddingBottom: spacing[2] },
  section: { gap: spacing[2], alignItems: "flex-start" },
  row: {
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    padding: spacing[3],
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: themed("rgba(196, 181, 253, 0.14)"),
    backgroundColor: themed("rgba(22, 20, 36, 0.8)"),
  },
  rowPressed: { borderColor: colors.overlay.lavenderBorder },
  rowIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.overlay.lavenderSoft,
  },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontFamily: fontFamilies.medium },
  card: {
    alignSelf: "stretch",
    gap: spacing[2],
    padding: spacing[3],
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: themed("rgba(196, 181, 253, 0.14)"),
    backgroundColor: themed("rgba(22, 20, 36, 0.8)"),
  },
});
