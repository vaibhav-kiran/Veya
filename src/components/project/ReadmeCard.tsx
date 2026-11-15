import { useState } from "react";
import { Platform, ScrollView, StyleSheet, View } from "react-native";
import Animated from "react-native-reanimated";

import { haptics } from "@/lib/haptics";
import { fadeSoft } from "@/lib/softMotion";
import { saveReadme } from "@/lib/saveReadme";
import { describeApiError, projectsApi } from "@/lib/veyaApi";
import { colors, fontFamilies, radii, spacing, themed } from "@/theme";

import { GROUP_BG, HAIRLINE } from "../ui/Grouped";
import { AppText } from "../AppText";
import { Button } from "../Button";
import { Icon } from "../Icon";
import { TextLink } from "../TextLink";


type ReadmeCardProps = {
  projectId: string;
  markdown: string;
  filename: string;
};

/** The README file: name and size, an optional preview of the Markdown, and share / download through the backend. */
export function ReadmeCard({ projectId, markdown, filename }: ReadmeCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lines = markdown.split("\n");
  const sectionCount = lines.filter((line) => /^##\s/.test(line)).length;
  const sizeKb = Math.max(1, Math.round(markdown.length / 1024));

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const file = await projectsApi.downloadReadme(projectId);
      await saveReadme(filename, file);
      haptics.success();
    } catch (cause) {
      setError(describeApiError(cause));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Animated.View style={styles.card}>
      <View style={styles.fileRow}>
        <View style={styles.fileIcon}>
          <Icon name="document" size={16} color={colors.text.secondary} />
        </View>
        <View style={styles.fileText}>
          <AppText variant="bodyMedium" numberOfLines={1} style={styles.fileName}>
            {filename}
          </AppText>
          <AppText variant="caption" tone="muted">
            {sectionCount ? `${sectionCount} sections · ` : ""}
            {sizeKb} KB · the file Veya changes when you use the orb
          </AppText>
        </View>
      </View>
      {expanded ? (
        <Animated.View entering={fadeSoft}>
          <ScrollView style={styles.preview} nestedScrollEnabled showsVerticalScrollIndicator>
            <AppText selectable style={styles.code}>
              {markdown}
            </AppText>
          </ScrollView>
        </Animated.View>
      ) : null}
      <TextLink label={expanded ? "Hide the file" : "Preview the file"} onPress={() => setExpanded((value) => !value)} />
      {error ? (
        <AppText variant="bodySmall" tone="error" accessibilityRole="alert">
          {error}
        </AppText>
      ) : null}
      <Button
        label={Platform.OS === "web" ? "Download README" : "Share README"}
        icon={Platform.OS === "web" ? "save" : "share"}
        iconPosition="left"
        variant="secondary"
        size="small"
        loading={saving}
        onPress={() => void save()}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing[3],
    padding: spacing[4],
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: HAIRLINE,
    backgroundColor: GROUP_BG,
  },
  fileRow: { flexDirection: "row", alignItems: "center", gap: spacing[3] },
  fileIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: colors.overlay.lavenderSoft },
  fileText: { flex: 1, gap: 2 },
  fileName: { fontFamily: fontFamilies.medium },
  preview: { maxHeight: 360, borderRadius: radii.md, padding: spacing[3], backgroundColor: themed("rgba(8, 7, 14, 0.85)") },
  code: {
    fontFamily: Platform.select({ ios: "Courier", default: "monospace" }),
    fontSize: 12,
    lineHeight: 17,
    color: colors.text.secondary,
  },
});
