import { Pressable, StyleSheet, View } from "react-native";

import { haptics } from "@/lib/haptics";
import { colors, spacing } from "@/theme";

import { AppText } from "./AppText";
import { Icon } from "./Icon";

type CheckboxProps = { label: string; checked: boolean; onChange: (checked: boolean) => void };

export function Checkbox({ label, checked, onChange }: CheckboxProps) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      onPress={() => {
        haptics.selection();
        onChange(!checked);
      }}
      hitSlop={8}
      style={styles.row}
    >
      <View style={[styles.box, checked && styles.boxChecked]}>
        {checked ? <Icon name="check" size={12} color={colors.text.primary} weight="semibold" /> : null}
      </View>
      <AppText variant="bodySmall" tone="secondary">
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing[2], minHeight: 32 },
  box: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: colors.overlay.borderStrong,
    backgroundColor: colors.overlay.surfaceRaised,
    alignItems: "center",
    justifyContent: "center",
  },
  boxChecked: { backgroundColor: colors.veya.purple, borderColor: colors.veya.violet },
});
