import Animated, { useAnimatedStyle, type SharedValue } from "react-native-reanimated";

import { TAU } from "./motion";
import { themed } from "@/theme";

type ParticleProps = { x: number; y: number; size: number; phase: number; amplitude: number; time: SharedValue<number> };

/** Tiny drifting point of light. */
export function Particle({ x, y, size, phase, amplitude, time }: ParticleProps) {
  const style = useAnimatedStyle(() => {
    const wave = Math.sin((time.get() + phase) * TAU);
    return { opacity: 0.25 + 0.55 * Math.abs(wave), transform: [{ translateY: wave * amplitude }] };
  });
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          left: x - size / 2,
          top: y - size / 2,
          width: size,
          height: size,
          borderRadius: size,
          backgroundColor: themed("#DDD6FE"),
          boxShadow: themed("0px 0px 8px rgba(196, 181, 253, 0.9)"),
        },
        style,
      ]}
    />
  );
}
