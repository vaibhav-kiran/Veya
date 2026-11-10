import Animated, { useAnimatedStyle, type SharedValue } from "react-native-reanimated";

import { stagger } from "./motion";
import { themed } from "@/theme";

type BeamProps = {
  /** Start point. */
  x: number;
  y: number;
  length: number;
  /** Degrees, clockwise from pointing right. */
  angle: number;
  progress: SharedValue<number>;
  start: number;
  span?: number;
  thickness?: number;
  gradient?: string;
};

const DEFAULT_GRADIENT = themed("linear-gradient(90deg, rgba(221, 214, 254, 0.85) 0%, rgba(167, 139, 250, 0.15) 100%)");

/** A line that "grows" from its start point as `progress` advances. */
export function Beam({ x, y, length, angle, progress, start, span = 0.3, thickness = 1.5, gradient = DEFAULT_GRADIENT }: BeamProps) {
  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${angle}deg` }, { scaleX: stagger(progress.get(), start, span) }],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          left: x,
          top: y - thickness / 2,
          width: length,
          height: thickness,
          borderRadius: thickness,
          transformOrigin: "left center",
          backgroundImage: gradient,
        },
        style,
      ]}
    />
  );
}
