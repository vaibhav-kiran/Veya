import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { colors, spacing, themed } from "@/theme";

import { AppText } from "./AppText";
import { Icon, type IconName } from "./Icon";

type EmptyStateProps = {
  icon: IconName;
  title: string;
  message: string;
  action?: ReactNode;
};

export function EmptyState({ icon, title, message, action }: EmptyStateProps) {
  return (
    <View style={styles.container}>
      <View style={styles.badge}>
        <Icon name={icon} size={26} color={colors.veya.lavender} />
      </View>
      <AppText variant="h3" align="center">
        {title}
      </AppText>
      <AppText variant="bodyMedium" tone="secondary" align="center" style={styles.message}>
        {message}
      </AppText>
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: "center", paddingVertical: spacing[10], paddingHorizontal: spacing[4], gap: spacing[2] },
  badge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing[2],
    backgroundColor: colors.overlay.lavenderSoft,
    borderWidth: 1,
    borderColor: themed("rgba(196, 181, 253, 0.25)"),
    boxShadow: themed("0px 0px 28px rgba(167, 139, 250, 0.25)"),
  },
  message: { maxWidth: 300 },
  action: { marginTop: spacing[4], alignSelf: "stretch" },
});
