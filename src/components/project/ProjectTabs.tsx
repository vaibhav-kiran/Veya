import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

import { haptics } from "@/lib/haptics";
import { EASE_OUT } from "@/lib/softMotion";
import { colors, fontFamilies, spacing } from "@/theme";

import { HAIRLINE } from "../ui/Grouped";

import { AppText } from "../AppText";
import type { IconName } from "../Icon";

export type ProjectTab = { key: string; label: string; icon: IconName; badge?: string };

/** Segmented tabs with a highlight that slides to the chosen one. */
export function ProjectTabs({ tabs, value, onChange }: { tabs: ProjectTab[]; value: string; onChange: (key: string) => void }) {
  const [frames, setFrames] = useState<Record<string, { x: number; width: number }>>({});
  const x = useSharedValue(0);
  const width = useSharedValue(0);

  useEffect(() => {
    const frame = frames[value];
    if (!frame) return;
    // First layout: jump there; afterwards: slide.
    const first = width.get() === 0;
    x.set(first ? frame.x : withTiming(frame.x, { duration: 240, easing: EASE_OUT }));
    width.set(first ? frame.width : withTiming(frame.width, { duration: 240, easing: EASE_OUT }));
  }, [frames, value, x, width]);

  const highlight = useAnimatedStyle(() => ({ width: width.get(), transform: [{ translateX: x.get() }], opacity: width.get() ? 1 : 0 }));

  const onLayout = (key: string) => (event: LayoutChangeEvent) => {
    const { x: left, width: w } = event.nativeEvent.layout;
    setFrames((current) => (current[key]?.x === left && current[key]?.width === w ? current : { ...current, [key]: { x: left, width: w } }));
  };

  return (
    <View style={styles.bar} accessibilityRole="tablist">
      <Animated.View pointerEvents="none" style={[styles.highlight, highlight]} />
      {tabs.map((tab) => {
        const selected = tab.key === value;
        return (
          <Pressable
            key={tab.key}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={tab.label}
            onLayout={onLayout(tab.key)}
            onPress={() => {
              if (selected) return;
              haptics.selection();
              onChange(tab.key);
            }}
            style={styles.tab}
          >
            <AppText variant="bodySmall" numberOfLines={1} style={[styles.label, selected && styles.labelSelected]}>
              {tab.label}
            </AppText>
            {tab.badge ? (
              <AppText style={[styles.badgeText, selected && styles.badgeSelected]}>{tab.badge}</AppText>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    padding: 3,
    borderRadius: 10,
    backgroundColor: colors.overlay.surfaceRaised,
  },
  highlight: {
    position: "absolute",
    top: 3,
    bottom: 3,
    left: 0,
    borderRadius: 8,
    backgroundColor: colors.overlay.lavenderSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: HAIRLINE,
  },
  tab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, minHeight: 34, paddingHorizontal: spacing[1] },
  label: { fontFamily: fontFamilies.medium, color: colors.text.muted },
  labelSelected: { color: colors.text.primary },
  badgeText: { fontFamily: fontFamilies.medium, fontSize: 12, lineHeight: 16, color: colors.text.muted, fontVariant: ["tabular-nums"] },
  badgeSelected: { color: colors.text.secondary },
});
