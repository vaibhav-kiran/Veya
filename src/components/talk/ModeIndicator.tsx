import { StyleSheet, View } from "react-native";
import Animated, { Extrapolation, interpolate, useAnimatedStyle, useDerivedValue, type SharedValue } from "react-native-reanimated";

import { colors, fontFamilies, themed } from "@/theme";

import { Icon, type IconName } from "../Icon";

const MODES: { label: string; icon: IconName }[] = [
  { label: "Voice", icon: "mic" },
  { label: "Chat", icon: "chat" },
];
const SEGMENT_WIDTH = 86;
export const MODE_INDICATOR_HEIGHT = 48;

function ModeLabel({ index, progress, label, icon }: { index: number; progress: SharedValue<number>; label: string; icon: IconName }) {
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(Math.abs(progress.get() - index), [0, 1], [1, 0.45], Extrapolation.CLAMP),
  }));
  return (
    <Animated.View style={[styles.segment, style]}>
      <Icon name={icon} size={13} color={colors.text.primary} />
      <Animated.Text style={styles.label}>{label}</Animated.Text>
    </Animated.View>
  );
}

/**
 * Non-interactive "Voice · Chat" indicator. The highlight follows the swipe
 * position so it's always clear which side you're on; switching is by swiping.
 */
export function ModeIndicator({ scrollX, width }: { scrollX: SharedValue<number>; width: number }) {
  // 0 on the voice page, 1 on the chat page, fractional mid-swipe.
  const progress = useDerivedValue(() => (width > 0 ? Math.min(1, Math.max(0, scrollX.get() / width)) : 0));
  const pillStyle = useAnimatedStyle(() => ({ transform: [{ translateX: progress.get() * SEGMENT_WIDTH }] }));

  return (
    <View style={styles.wrap} accessible accessibilityRole="text" accessibilityLabel="Swipe between voice and chat">
      <View style={styles.track}>
        <Animated.View style={[styles.pill, pillStyle]} />
        {MODES.map((mode, index) => (
          <ModeLabel key={mode.label} index={index} progress={progress} label={mode.label} icon={mode.icon} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { height: MODE_INDICATOR_HEIGHT, alignItems: "center", justifyContent: "center" },
  track: {
    flexDirection: "row",
    padding: 3,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: themed("rgba(196, 181, 253, 0.2)"),
    backgroundColor: themed("rgba(20, 18, 34, 0.75)"),
  },
  pill: {
    position: "absolute",
    top: 3,
    left: 3,
    width: SEGMENT_WIDTH,
    bottom: 3,
    borderRadius: 999,
    backgroundImage: themed("linear-gradient(135deg, rgba(167, 139, 250, 0.55) 0%, rgba(124, 58, 237, 0.55) 100%)"),
    borderWidth: 1,
    borderColor: themed("rgba(237, 233, 254, 0.35)"),
    boxShadow: themed("0px 0px 14px rgba(167, 139, 250, 0.45)"),
  },
  segment: { width: SEGMENT_WIDTH, height: 32, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  label: { fontFamily: fontFamilies.semibold, fontSize: 13, color: colors.text.primary },
});
