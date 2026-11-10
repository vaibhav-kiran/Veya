import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from "react-native-reanimated";

import { useLoop } from "./onboarding/motion";
import { themed } from "@/theme";

const TAU = Math.PI * 2;

/** Calm ⇄ recording transition: long, with a very soft start and finish. */
export const ORB_TRANSITION = { duration: 1100, easing: Easing.bezier(0.45, 0, 0.2, 1) };
const WAVE = [5, 8, 12, 9, 16, 22, 15, 26, 18, 26, 15, 22, 16, 9, 12, 8, 5];

type Layer = {
  /** Size relative to the orb. */
  scale: number;
  /** Phase offset so layers never line up. */
  phase: number;
  /** Whole-number wobble cycles per loop — keeps the loop seamless when it restarts. */
  speed: 1 | 2;
  /** Turn direction; one full turn per loop. */
  spin: 1 | -1;
  /** How far corners deviate from a perfect circle (0–1). */
  wobble: number;
  gradient: string;
  opacity: number;
  /** Only visible while recording (fades in with liveness). */
  recordingTint?: boolean;
};

const LAYERS: Layer[] = [
  {
    scale: 1,
    phase: 0,
    speed: 1,
    spin: 1,
    wobble: 0.22,
    opacity: 0.55,
    gradient: themed("radial-gradient(circle at 50% 50%, rgba(124, 58, 237, 0.65) 0%, rgba(76, 29, 149, 0.55) 60%, rgba(30, 27, 75, 0.2) 100%)"),
  },
  {
    scale: 0.9,
    phase: 0.33,
    speed: 2,
    spin: -1,
    wobble: 0.2,
    opacity: 0.75,
    gradient: themed("radial-gradient(circle at 40% 35%, rgba(196, 181, 253, 0.75) 0%, rgba(167, 139, 250, 0.55) 45%, rgba(124, 58, 237, 0.35) 100%)"),
  },
  {
    scale: 0.78,
    phase: 0.66,
    speed: 1,
    spin: 1,
    wobble: 0.18,
    opacity: 0.85,
    gradient: themed("radial-gradient(circle at 38% 30%, rgba(245, 243, 255, 0.9) 0%, rgba(221, 214, 254, 0.6) 30%, rgba(167, 139, 250, 0.45) 70%, rgba(124, 58, 237, 0.3) 100%)"),
  },
  {
    scale: 0.96,
    phase: 0.15,
    speed: 2,
    spin: -1,
    wobble: 0.2,
    opacity: 0.6,
    recordingTint: true,
    gradient:
      "radial-gradient(circle at 42% 36%, rgba(255, 228, 230, 0.75) 0%, rgba(255, 92, 112, 0.6) 40%, rgba(225, 29, 72, 0.45) 75%, rgba(136, 19, 55, 0.3) 100%)",
  },
];

type Timelines = {
  /** Calm wobble loop (always running). */
  slow: SharedValue<number>;
  /** Lively wobble loop (always running, blended in while recording). */
  fast: SharedValue<number>;
  /** 0 = calm, 1 = recording; eases between the two so nothing jumps. */
  liveness: SharedValue<number>;
};

/** Corner radii + squash for one wobble timeline. */
function wobbleShape(time: number, layer: Layer, diameter: number, amount: number) {
  "worklet";
  const t = (time * layer.speed + layer.phase) * TAU;
  // Each corner breathes on its own rhythm, so the outline never repeats exactly.
  const corner = (offset: number, frequency: number) => (diameter / 2) * (1 - amount * (0.5 + 0.5 * Math.sin(t * frequency + offset)));
  return {
    topLeft: corner(0, 1),
    topRight: corner(1.7, 2),
    bottomRight: corner(3.1, 1),
    bottomLeft: corner(4.4, 2),
    // Squash and stretch, like a soft body settling.
    squash: Math.sin(t * 2),
  };
}

const mix = (a: number, b: number, t: number) => {
  "worklet";
  return a + (b - a) * t;
};

/** One translucent, constantly reshaping blob layer. */
function BlobLayer({ layer, size, timelines }: { layer: Layer; size: number; timelines: Timelines }) {
  const diameter = size * layer.scale;
  const style = useAnimatedStyle(() => {
    const live = timelines.liveness.get();
    // Both timelines run continuously and are cross-faded, so switching
    // into or out of recording never restarts (or snaps) the motion.
    const calm = wobbleShape(timelines.slow.get(), layer, diameter, layer.wobble);
    const lively = wobbleShape(timelines.fast.get(), layer, diameter, layer.wobble * 1.4);
    const squash = mix(calm.squash * 0.05, lively.squash * 0.07, live);
    return {
      opacity: layer.recordingTint ? layer.opacity * live : layer.opacity,
      borderTopLeftRadius: mix(calm.topLeft, lively.topLeft, live),
      borderTopRightRadius: mix(calm.topRight, lively.topRight, live),
      borderBottomRightRadius: mix(calm.bottomRight, lively.bottomRight, live),
      borderBottomLeftRadius: mix(calm.bottomLeft, lively.bottomLeft, live),
      transform: [
        { rotate: `${timelines.slow.get() * 360 * layer.spin}deg` },
        { scaleX: 1 + squash },
        { scaleY: 1 - squash },
      ],
    };
  });
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.layer,
        {
          width: diameter,
          height: diameter,
          left: (size - diameter) / 2,
          top: (size - diameter) / 2,
          backgroundImage: layer.gradient,
        },
        style,
      ]}
    />
  );
}

function WaveBar({ index, height, timelines }: { index: number; height: number; timelines: Timelines }) {
  const style = useAnimatedStyle(() => {
    const idle = 0.55 + 0.25 * Math.sin(timelines.slow.get() * TAU + index * 0.4);
    const speaking = 0.35 + 0.65 * Math.abs(Math.sin(Math.PI * (timelines.fast.get() * 6 + index * 0.23)));
    return { transform: [{ scaleY: mix(idle, speaking, timelines.liveness.get()) }] };
  });
  return <Animated.View style={[styles.bar, { height }, style]} />;
}

type SlimeOrbProps = {
  size: number;
  /** Livelier wobble and waveform, e.g. while listening. Transitions smoothly. */
  live?: boolean;
};

/** Veya's voice orb as a soft, wobbling, slime-like circle. */
export function SlimeOrb({ size, live = false }: SlimeOrbProps) {
  const slow = useLoop(9000, true);
  const fast = useLoop(4000, true);
  const glow = useLoop(3000, true, true);
  const liveness = useSharedValue(live ? 1 : 0);
  const timelines: Timelines = { slow, fast, liveness };

  useEffect(() => {
    liveness.set(withTiming(live ? 1 : 0, ORB_TRANSITION));
  }, [live, liveness]);

  const glowStyle = useAnimatedStyle(() => {
    const live = liveness.get();
    return {
      opacity: (0.55 + 0.35 * glow.get()) * (1 - live),
      transform: [{ scale: mix(0.95, 1.08, live) + 0.1 * glow.get() }],
    };
  });
  // Recording: the halo cross-fades to red and pulses a little stronger.
  const redGlowStyle = useAnimatedStyle(() => {
    const live = liveness.get();
    return {
      opacity: (0.7 + 0.3 * glow.get()) * live,
      transform: [{ scale: mix(0.95, 1.1, live) + 0.12 * glow.get() }],
    };
  });
  // The orb swells slightly while recording.
  const bodyStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + 0.06 * liveness.get() }] }));

  return (
    <View style={{ width: size, height: size }}>
      <Animated.View pointerEvents="none" style={[styles.glow, { width: size * 1.5, height: size * 1.5, left: -size * 0.25, top: -size * 0.25 }, glowStyle]} />
      <Animated.View pointerEvents="none" style={[styles.redGlow, { width: size * 1.6, height: size * 1.6, left: -size * 0.3, top: -size * 0.3 }, redGlowStyle]} />
      <Animated.View style={[StyleSheet.absoluteFill, bodyStyle]}>
        {LAYERS.map((layer) => (
          <BlobLayer key={layer.phase} layer={layer} size={size} timelines={timelines} />
        ))}
        <View pointerEvents="none" style={[styles.highlight, { width: size * 0.3, height: size * 0.14, left: size * 0.26, top: size * 0.2 }]} />
        <View pointerEvents="none" style={styles.center}>
          <View style={styles.wave}>
            {WAVE.map((height, index) => (
              <WaveBar key={index} index={index} height={height * (size / 240)} timelines={timelines} />
            ))}
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  redGlow: {
    position: "absolute",
    borderRadius: 9999,
    backgroundImage: themed("radial-gradient(circle, rgba(255, 77, 99, 0.55) 0%, rgba(225, 29, 72, 0.22) 40%, rgba(8, 8, 12, 0) 68%)"),
  },
  glow: {
    position: "absolute",
    borderRadius: 9999,
    backgroundImage: themed("radial-gradient(circle, rgba(167, 139, 250, 0.45) 0%, rgba(124, 58, 237, 0.18) 40%, rgba(8, 8, 12, 0) 68%)"),
  },
  layer: {
    position: "absolute",
    borderWidth: 1,
    borderColor: themed("rgba(237, 233, 254, 0.35)"),
    boxShadow: themed("0px 0px 40px rgba(167, 139, 250, 0.45)"),
  },
  highlight: {
    position: "absolute",
    borderRadius: 9999,
    backgroundColor: "rgba(255, 255, 255, 0.22)",
    transform: [{ rotate: "-24deg" }],
  },
  center: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center" },
  wave: { flexDirection: "row", alignItems: "center", gap: 3 },
  bar: { width: 2.5, borderRadius: 2, backgroundColor: "rgba(255, 255, 255, 0.92)" },
});
