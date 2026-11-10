import { Pressable, ScrollView, StyleSheet } from "react-native";

import { haptics } from "@/lib/haptics";
import { colors, fontFamilies, radii, spacing, themed } from "@/theme";

import { AppText } from "./AppText";

type FilterChipsProps<T extends string> = {
  options: readonly { value: T; label: string; count?: number }[];
  value: T;
  onChange: (value: T) => void;
};

export function FilterChips<T extends string>({ options, value, onChange }: FilterChipsProps<T>) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} accessibilityRole="tablist">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={option.count !== undefined ? `${option.label}, ${option.count}` : option.label}
            onPress={() => {
              if (selected) return;
              haptics.selection();
              onChange(option.value);
            }}
            style={[styles.chip, selected && styles.selected]}
          >
            <AppText variant="bodySmall" tone={selected ? "primary" : "secondary"} style={selected && styles.selectedLabel}>
              {option.label}
              {option.count !== undefined ? `  ${option.count}` : ""}
            </AppText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing[2] },
  chip: {
    minHeight: 36,
    justifyContent: "center",
    paddingHorizontal: spacing[4],
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.overlay.borderStrong,
    backgroundColor: colors.veya.surface,
  },
  selected: { borderColor: colors.overlay.lavenderBorder, backgroundColor: themed("rgba(124, 58, 237, 0.22)") },
  selectedLabel: { fontFamily: fontFamilies.medium },
});
