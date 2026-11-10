import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { haptics } from "@/lib/haptics";
import { colors, spacing } from "@/theme";

import { AppText, type TextTone } from "./AppText";
import { Icon, type IconName } from "./Icon";

export function SettingsSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <AppText variant="eyebrow" tone="secondary" accessibilityRole="header">
        {title}
      </AppText>
      <View style={styles.group}>{children}</View>
    </View>
  );
}

type SettingsRowProps = {
  label: string;
  value?: string;
  onPress?: () => void;
  tone?: TextTone;
  accessibilityHint?: string;
  /** Hide the trailing chevron (e.g. for destructive actions). */
  showChevron?: boolean;
  /** Optional icon tile on the left. */
  icon?: IconName;
  /** Tint for the icon tile (defaults to lavender; red for destructive rows). */
  iconColor?: string;
};

/** Label left, current value + chevron right — every row says what tapping it does. */
export function SettingsRow({
  label,
  value,
  onPress,
  tone = "primary",
  accessibilityHint,
  showChevron = true,
  icon,
  iconColor = colors.veya.lavender,
}: SettingsRowProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}, ${value}` : label}
      accessibilityHint={accessibilityHint}
      disabled={!onPress}
      onPress={() => {
        haptics.selection();
        onPress?.();
      }}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.leading}>
        {icon ? (
          <View style={[styles.iconTile, { backgroundColor: `${iconColor}1F` }]}>
            <Icon name={icon} size={15} color={iconColor} />
          </View>
        ) : null}
        <AppText variant="bodyLarge" tone={tone} style={styles.label}>
          {label}
        </AppText>
      </View>
      <View style={styles.trailing}>
        {value ? (
          <AppText variant="bodyMedium" tone="secondary" numberOfLines={1}>
            {value}
          </AppText>
        ) : null}
        {onPress && showChevron ? <Icon name="chevronRight" size={14} color={colors.text.secondary} /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing[2] },
  group: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.veya.border,
    backgroundColor: colors.veya.surface,
    overflow: "hidden",
  },
  row: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.veya.border,
  },
  pressed: { backgroundColor: colors.overlay.lavenderSoft },
  leading: { flexDirection: "row", alignItems: "center", gap: spacing[3], flexShrink: 1 },
  iconTile: { width: 30, height: 30, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  label: { flexShrink: 1 },
  trailing: { flexDirection: "row", alignItems: "center", gap: spacing[2], flexShrink: 1 },
});
