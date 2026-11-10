import { StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, type SharedValue } from "react-native-reanimated";

import { radii, spacing, themed } from "@/theme";

import { useLoop } from "../onboarding/motion";
import { VeyaAvatar } from "./VeyaAvatar";

function Dot({ index, time }: { index: number; time: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    const t = (time.get() - index * 0.15 + 1) % 1;
    const lift = Math.max(0, Math.sin(t * Math.PI * 2));
    return { opacity: 0.4 + 0.6 * lift, transform: [{ translateY: -lift * 4 }] };
  });
  return <Animated.View style={[styles.dot, style]} />;
}

/** "Veya is thinking" — three bouncing dots in a glass bubble. */
export function TypingIndicator() {
  const time = useLoop(1100, true);
  return (
    <View style={styles.row} accessible accessibilityLabel="Veya is thinking" accessibilityLiveRegion="polite">
      <VeyaAvatar />
      <View style={styles.bubble}>
        {[0, 1, 2].map((index) => (
          <Dot key={index} index={index} time={time} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-end", gap: spacing[2] },
  bubble: {
    flexDirection: "row",
    gap: 5,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3] + 2,
    borderRadius: radii.xl - 4,
    borderBottomLeftRadius: 6,
    borderWidth: 1,
    borderColor: themed("rgba(196, 181, 253, 0.18)"),
    backgroundColor: themed("rgba(24, 21, 40, 0.88)"),
  },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: themed("#DDD6FE") },
});
