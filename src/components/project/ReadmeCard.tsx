import { useState } from "react";
import { Platform, StyleSheet, View } from "react-native";

import { haptics } from "@/lib/haptics";
import { saveReadme } from "@/lib/saveReadme";
import { describeApiError, projectsApi } from "@/lib/veyaApi";
import { colors, radii, spacing, themed } from "@/theme";

import { AppText } from "../AppText";
import { Button } from "../Button";
import { TextLink } from "../TextLink";

const PREVIEW_LINES = 14;

type ReadmeCardProps = {
  projectId: string;
  markdown: string;
  filename: string;
};

/** README preview (Markdown source) with share / download through the backend's README endpoint. */
export function ReadmeCard({ projectId, markdown, filename }: ReadmeCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lines = markdown.split("\n");
  const long = lines.length > PREVIEW_LINES;
  const shown = expanded || !long ? markdown : `${lines.slice(0, PREVIEW_LINES).join("\n")}\n…`;

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
    <View style={styles.card}>
      <AppText selectable style={styles.code}>
        {shown}
      </AppText>
      {long ? <TextLink label={expanded ? "Show less" : "Show the full README"} onPress={() => setExpanded((value) => !value)} /> : null}
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
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing[3],
    padding: spacing[4],
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.overlay.borderStrong,
    backgroundColor: themed("rgba(20, 18, 34, 0.7)"),
  },
  code: {
    fontFamily: Platform.select({ ios: "Courier", default: "monospace" }),
    fontSize: 12,
    lineHeight: 17,
    color: colors.text.secondary,
  },
});
