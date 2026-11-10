import { StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, type SharedValue } from "react-native-reanimated";

import { colors, themed } from "@/theme";

import { useLoop } from "../onboarding/motion";

const TAU = Math.PI * 2;

type Blob = { x: number; y: number; size: number; drift: number; phase: number; gradient: string };

const BLOBS: Blob[] = [
  {
    x: 0.15,
    y: 0.12,
    size: 1.1,
    drift: 0.08,
    phase: 0,
    gradient: themed("radial-gradient(circle, rgba(124, 58, 237, 0.32) 0%, rgba(124, 58, 237, 0) 65%)"),
  },
  {
    x: 0.85,
    y: 0.45,
    size: 1.0,
    drift: 0.1,
    phase: 0.4,
    gradient: "radial-gradient(circle, rgba(77, 139, 255, 0.14) 0%, rgba(77, 139, 255, 0) 65%)",
  },
  {
    x: 0.35,
    y: 0.85,
    size: 1.2,
    drift: 0.07,
    phase: 0.7,
    gradient: themed("radial-gradient(circle, rgba(167, 139, 250, 0.22) 0%, rgba(167, 139, 250, 0) 65%)"),
  },
];

function AuroraBlob({ blob, width, height, time }: { blob: Blob; width: number; height: number; time: SharedValue<number> }) {
  const diameter = width * blob.size;
  const style = useAnimatedStyle(() => {
    const t = (time.get() + blob.phase) * TAU;
    return {
      transform: [
        { translateX: Math.cos(t) * width * blob.drift },
        { translateY: Math.sin(t * 2) * width * blob.drift * 0.6 },
        { scale: 1 + Math.sin(t) * 0.08 },
      ],
    };
  });
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.blob,
        { width: diameter, height: diameter, left: blob.x * width - diameter / 2, top: blob.y * height - diameter / 2, backgroundImage: blob.gradient },
        style,
      ]}
    />
  );
}

/** Slowly drifting lavender/indigo light behind the Talk tab. */
export function AuroraBackground({ width, height }: { width: number; height: number }) {
  const time = useLoop(24000, true);
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.root]}>
      {BLOBS.map((blob) => (
        <AuroraBlob key={blob.phase} blob={blob} width={width} height={height} time={time} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: colors.veya.background, overflow: "hidden" },
  blob: { position: "absolute", borderRadius: 9999 },
});
