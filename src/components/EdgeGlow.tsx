import { useEffect } from "react";
import { Platform, Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useListeningStore } from "@/stores/listeningStore";
import { colors, fontFamilies, themed } from "@/theme";

import { AppText } from "./AppText";
import { Icon } from "./Icon";
import { useLoop } from "./onboarding/motion";

type Light = { color: string; size: number; speed: 1 | 2; phase: number; direction: 1 | -1 };

/** Coloured lights that travel around the screen edge, in Veya's palette. */
const LIGHTS: Light[] = [
  { color: themed("rgba(196, 181, 253, 0.85)"), size: 220, speed: 1, phase: 0, direction: 1 },
  { color: themed("rgba(124, 58, 237, 0.85)"), size: 260, speed: 1, phase: 0.5, direction: 1 },
  { color: "rgba(77, 139, 255, 0.6)", size: 200, speed: 2, phase: 0.25, direction: -1 },
];

/** Point on the screen's perimeter for t in [0, 1), clockwise from the top-left. */
function perimeterPoint(t: number, width: number, height: number) {
  "worklet";
  const perimeter = 2 * (width + height);
  let d = (((t % 1) + 1) % 1) * perimeter;
  if (d < width) return { x: d, y: 0 };
  d -= width;
  if (d < height) return { x: width, y: d };
  d -= height;
  if (d < width) return { x: width - d, y: height };
  d -= width;
  return { x: 0, y: height - d };
}

function TravellingLight({ light, width, height, time }: { light: Light; width: number; height: number; time: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    const point = perimeterPoint(time.get() * light.speed * light.direction + light.phase, width, height);
    return { transform: [{ translateX: point.x - light.size / 2 }, { translateY: point.y - light.size / 2 }] };
  });
  return (
    <Animated.View
      style={[
        styles.light,
        {
          width: light.size,
          height: light.size,
          backgroundImage: themed(`radial-gradient(circle, ${light.color} 0%, rgba(8, 8, 12, 0) 68%)`),
        },
        style,
      ]}
    />
  );
}

/**
 * Apple-style "listening" glow around the screen edges, shown on every screen
 * except the voice page (which has its own listening animation).
 */
export function EdgeGlow() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const listening = useListeningStore((state) => state.listening);
  const voicePageVisible = useListeningStore((state) => state.voicePageVisible);
  const stopListening = useListeningStore((state) => state.stopListening);
  const visible = listening && !voicePageVisible;

  const appear = useSharedValue(0);
  const travel = useLoop(5200, visible);
  const breathe = useLoop(1600, visible, true);

  useEffect(() => {
    appear.set(withTiming(visible ? 1 : 0, { duration: visible ? 450 : 300 }));
  }, [appear, visible]);

  // Approximate the device's display corner radius (rounded on modern phones).
  const cornerRadius = Platform.OS === "ios" ? (insets.bottom > 0 ? 48 : 0) : insets.top > 30 ? 28 : 16;

  const containerStyle = useAnimatedStyle(() => ({ opacity: appear.get() }));
  const rimStyle = useAnimatedStyle(() => ({ opacity: 0.65 + 0.35 * breathe.get() }));
  const pillStyle = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - appear.get()) * -20 }] }));

  return (
    <Animated.View pointerEvents="box-none" style={[StyleSheet.absoluteFill, containerStyle]}>
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.clip, { borderRadius: cornerRadius }]}>
        {/* Each light is centred on the edge and fades out inward, so only the rim glows. */}
        {LIGHTS.map((light) => (
          <TravellingLight key={light.phase} light={light} width={width} height={height} time={travel} />
        ))}
        <Animated.View style={[StyleSheet.absoluteFill, styles.rim, { borderRadius: cornerRadius }, rimStyle]} />
      </View>

      {visible ? (
        <Animated.View style={[styles.pillWrap, { top: insets.top + 6 }, pillStyle]} pointerEvents="box-none">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Veya is listening. Tap to stop."
            onPress={stopListening}
            style={({ pressed }) => [styles.pill, pressed && styles.pillPressed]}
          >
            <View style={styles.dot} />
            <AppText style={styles.pillText}>Veya is listening</AppText>
            <Icon name="close" size={12} color={colors.text.secondary} />
          </Pressable>
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: "hidden" },
  light: { position: "absolute", left: 0, top: 0, borderRadius: 9999 },
  rim: {
    borderWidth: 2,
    borderColor: themed("rgba(221, 214, 254, 0.75)"),
    boxShadow:
      themed("inset 0px 0px 18px 4px rgba(196, 181, 253, 0.85), inset 0px 0px 48px 12px rgba(124, 58, 237, 0.55), inset 0px 0px 90px 18px rgba(77, 139, 255, 0.18)"),
  },
  pillWrap: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: themed("rgba(196, 181, 253, 0.45)"),
    backgroundColor: themed("rgba(16, 14, 28, 0.92)"),
    boxShadow: themed("0px 6px 20px rgba(0, 0, 0, 0.5), 0px 0px 18px rgba(167, 139, 250, 0.45)"),
  },
  pillPressed: { opacity: 0.75 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.veya.lavender, boxShadow: themed("0px 0px 8px rgba(196, 181, 253, 1)") },
  pillText: { fontFamily: fontFamilies.semibold, fontSize: 13, lineHeight: 17, color: colors.text.primary },
});
