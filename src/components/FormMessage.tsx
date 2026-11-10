import { StyleSheet, View } from "react-native";

import { colors, radii, spacing, themed } from "@/theme";

import { AppText } from "./AppText";
import { Icon } from "./Icon";

type FormMessageProps = { message: string | null; tone?: "error" | "info" };

/** Inline banner for form-level errors/notices, announced to screen readers. */
export function FormMessage({ message, tone = "error" }: FormMessageProps) {
  if (!message) return null;
  const isError = tone === "error";
  return (
    <View
      accessibilityRole={isError ? "alert" : "text"}
      accessibilityLiveRegion="polite"
      style={[styles.banner, isError ? styles.error : styles.info]}
    >
      <Icon name={isError ? "warning" : "mail"} size={16} color={isError ? colors.semantic.error : colors.veya.lavender} />
      <AppText variant="bodySmall" tone={isError ? "error" : "accent"} style={styles.text}>
        {message}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { flexDirection: "row", alignItems: "flex-start", gap: spacing[2], padding: spacing[3], borderRadius: radii.md, borderWidth: 1 },
  error: { backgroundColor: colors.overlay.errorSoft, borderColor: "rgba(255, 77, 79, 0.3)" },
  info: { backgroundColor: colors.overlay.lavenderSoft, borderColor: themed("rgba(196, 181, 253, 0.3)") },
  text: { flex: 1 },
});
