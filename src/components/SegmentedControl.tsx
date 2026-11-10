import { Pressable, StyleSheet, View } from "react-native";

import { haptics } from "@/lib/haptics";
import { colors, fontFamilies, radii, spacing, themed } from "@/theme";

import { AppText } from "./AppText";

type Segment<T extends string> = { value: T; label: string };

type SegmentedControlProps<T extends string> = {
  segments: readonly Segment<T>[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel: string;
};

/** Pill segmented control (Dark · Light · System style from the settings reference). */
export function SegmentedControl<T extends string>({ segments, value, onChange, accessibilityLabel }: SegmentedControlProps<T>) {
  return (
    <View style={styles.track} accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel}>
      {segments.map((segment) => {
        const selected = segment.value === value;
        return (
          <Pressable
            key={segment.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            onPress={() => {
              if (selected) return;
              haptics.selection();
              onChange(segment.value);
            }}
            style={[styles.segment, selected && styles.selected]}
          >
            <AppText
              variant="bodySmall"
              tone={selected ? "primary" : "secondary"}
              style={selected ? styles.selectedLabel : undefined}
            >
              {segment.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: "row",
    padding: 3,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.overlay.borderStrong,
    backgroundColor: colors.veya.surface,
  },
  segment: {
    flex: 1,
    minHeight: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.full,
    paddingHorizontal: spacing[2],
  },
  selected: { backgroundColor: themed("#2A2638"), borderWidth: 1, borderColor: colors.overlay.lavenderBorder },
  selectedLabel: { fontFamily: fontFamilies.medium },
});
