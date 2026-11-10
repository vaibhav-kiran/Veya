import { StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, type SharedValue } from "react-native-reanimated";

import { Icon, type IconName } from "../Icon";
import { Beam } from "./Beam";
import { TAU, stagger, useEntrance, useLoop } from "./motion";
import { themed } from "@/theme";

type IdeaNode = { icon: IconName; x: number; y: number; phase: number };

/** Four sources of inspiration feeding one central idea. */
const NODES: IdeaNode[] = [
  { icon: "idea", x: 0.14, y: 0.22, phase: 0 },
  { icon: "rocket", x: 0.86, y: 0.2, phase: 0.25 },
  { icon: "brain", x: 0.12, y: 0.78, phase: 0.5 },
  { icon: "target", x: 0.88, y: 0.8, phase: 0.75 },
];

const RAY_COUNT = 10;
const ORBIT_TILT = (-16 * Math.PI) / 180;

type Geometry = { center: number; radius: number };

/** A mote of light travelling from an idea node into the sphere. */
function Stream({ from, geometry, offset, time }: { from: { x: number; y: number }; geometry: Geometry; offset: number; time: SharedValue<number> }) {
  const { center, radius } = geometry;
  const dx = center - from.x;
  const dy = center - from.y;
  const distance = Math.hypot(dx, dy);
  // Stop at the sphere's surface so the light appears to be absorbed.
  const travel = Math.max(0, (distance - radius * 0.9) / distance);

  const style = useAnimatedStyle(() => {
    const t = (time.get() + offset) % 1;
    return {
      opacity: Math.sin(t * Math.PI),
      transform: [{ translateX: dx * travel * t }, { translateY: dy * travel * t }, { scale: 1 - t * 0.4 }],
    };
  });
  return <Animated.View pointerEvents="none" style={[styles.mote, { left: from.x - 3, top: from.y - 3 }, style]} />;
}

function Node({ node, size, progress, float, index }: { node: IdeaNode; size: number; progress: SharedValue<number>; float: SharedValue<number>; index: number }) {
  const style = useAnimatedStyle(() => {
    const p = stagger(progress.get(), 0.3 + index * 0.08, 0.25);
    return {
      opacity: p,
      transform: [{ translateY: Math.sin((float.get() + node.phase) * TAU) * 5 }, { scale: 0.5 + 0.5 * p }],
    };
  });
  return (
    <Animated.View style={[styles.node, { left: node.x * size - 23, top: node.y * size - 23 }, style]}>
      <Icon name={node.icon} size={20} color={themed("#E4DEFF")} weight="light" />
    </Animated.View>
  );
}

/** A point on the tilted orbit; `lag` trails behind the comet head. */
function CometPoint({ geometry, rx, ry, lag, dotSize, time, progress }: { geometry: Geometry; rx: number; ry: number; lag: number; dotSize: number; time: SharedValue<number>; progress: SharedValue<number> }) {
  const { center, radius } = geometry;
  const style = useAnimatedStyle(() => {
    const angle = (time.get() - lag) * TAU;
    const lx = Math.cos(angle) * rx;
    const ly = Math.sin(angle) * ry;
    const x = lx * Math.cos(ORBIT_TILT) - ly * Math.sin(ORBIT_TILT);
    const y = lx * Math.sin(ORBIT_TILT) + ly * Math.cos(ORBIT_TILT);
    // Dim the comet while it passes behind the sphere.
    const behind = ly < 0 && Math.abs(x) < radius;
    return {
      opacity: stagger(progress.get(), 0.55, 0.3) * (behind ? 0.15 : 1) * (1 - lag * 6),
      transform: [{ translateX: x }, { translateY: y }],
    };
  });
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.comet, { width: dotSize, height: dotSize, borderRadius: dotSize, left: center - dotSize / 2, top: center - dotSize / 2 }, style]}
    />
  );
}

/** Page 1 — inspiration from many directions converging into one glowing idea. */
export function IdeationArt({ size, active }: { size: number; active: boolean }) {
  const progress = useEntrance(active, 1800);
  const breathe = useLoop(2800, active, true);
  const rays = useLoop(30000, active);
  const comet = useLoop(7000, active);
  const streams = useLoop(2600, active);
  const float = useLoop(6000, active);

  const center = size / 2;
  const sphere = size * 0.54;
  const geometry: Geometry = { center, radius: sphere / 2 };
  const rx = size * 0.48;
  const ry = size * 0.17;
  const halo = size * 0.86;

  const sphereStyle = useAnimatedStyle(() => {
    const p = stagger(progress.get(), 0, 0.35);
    return { opacity: p, transform: [{ scale: (0.7 + 0.3 * p) * (1 + breathe.get() * 0.025) }] };
  });
  const coreStyle = useAnimatedStyle(() => ({
    opacity: 0.75 + 0.25 * breathe.get(),
    transform: [{ scale: 0.92 + breathe.get() * 0.16 }],
  }));
  const raysStyle = useAnimatedStyle(() => ({
    opacity: stagger(progress.get(), 0.25, 0.4) * (0.55 + 0.35 * breathe.get()),
    transform: [{ rotate: `${rays.get() * 360}deg` }],
  }));
  const ringsStyle = useAnimatedStyle(() => ({ opacity: stagger(progress.get(), 0.2, 0.4) }));
  const haloStyle = useAnimatedStyle(() => ({ opacity: (0.6 + 0.4 * breathe.get()) * stagger(progress.get(), 0, 0.4) }));

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="Ideas from many directions flowing into one glowing concept"
      style={{ width: size, height: size }}
    >
      <Animated.View style={[styles.halo, { width: halo, height: halo, left: center - halo / 2, top: center - halo / 2 }, haloStyle]} />

      {/* Faint outer circle and tilted orbit, as in the reference */}
      <Animated.View style={[StyleSheet.absoluteFill, ringsStyle]} pointerEvents="none">
        <View style={[styles.outerRing, { width: size * 0.8, height: size * 0.8, left: size * 0.1, top: size * 0.1 }]} />
        <View style={[styles.orbit, { width: rx * 2, height: ry * 2, left: center - rx, top: center - ry }]} />
      </Animated.View>

      {NODES.map((node, index) => (
        <Beam
          key={`beam-${node.icon}`}
          x={node.x * size}
          y={node.y * size}
          length={Math.hypot(center - node.x * size, center - node.y * size) - sphere / 2}
          angle={(Math.atan2(center - node.y * size, center - node.x * size) * 180) / Math.PI}
          progress={progress}
          start={0.35 + index * 0.08}
          thickness={1}
          gradient={themed("linear-gradient(90deg, rgba(196, 181, 253, 0.05) 0%, rgba(196, 181, 253, 0.45) 100%)")}
        />
      ))}
      {NODES.map((node) => (
        <View key={`streams-${node.icon}`} style={StyleSheet.absoluteFill} pointerEvents="none">
          <Stream from={{ x: node.x * size, y: node.y * size }} geometry={geometry} offset={node.phase} time={streams} />
          <Stream from={{ x: node.x * size, y: node.y * size }} geometry={geometry} offset={node.phase + 0.5} time={streams} />
        </View>
      ))}

      {/* Comet trail (rendered behind the sphere) */}
      {[0.04, 0.03, 0.02, 0.01].map((lag) => (
        <CometPoint key={lag} geometry={geometry} rx={rx} ry={ry} lag={lag} dotSize={4} time={comet} progress={progress} />
      ))}

      {/* Glass sphere with the idea spark inside */}
      <Animated.View
        style={[styles.sphere, { width: sphere, height: sphere, left: center - sphere / 2, top: center - sphere / 2 }, sphereStyle]}
      >
        <Animated.View style={[styles.rays, raysStyle]}>
          {Array.from({ length: RAY_COUNT }, (_, index) => (
            <View
              key={index}
              style={[styles.ray, { width: sphere * 0.46, left: sphere / 2, top: sphere / 2, transform: [{ rotate: `${(360 / RAY_COUNT) * index}deg` }] }]}
            />
          ))}
        </Animated.View>
        <Animated.View style={[styles.core, { width: sphere * 0.36, height: sphere * 0.36 }, coreStyle]}>
          <Icon name="sparkle" size={sphere * 0.16} color="#FFFFFF" />
        </Animated.View>
        <View style={styles.specular} />
        <View style={styles.rim} />
      </Animated.View>

      {/* Comet head passes in front of the sphere on its near side */}
      <CometPoint geometry={geometry} rx={rx} ry={ry} lag={0} dotSize={9} time={comet} progress={progress} />

      {NODES.map((node, index) => (
        <Node key={node.icon} node={node} size={size} progress={progress} float={float} index={index} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  halo: {
    position: "absolute",
    borderRadius: 9999,
    backgroundImage: themed("radial-gradient(circle, rgba(167, 139, 250, 0.32) 0%, rgba(124, 58, 237, 0.12) 40%, rgba(8, 8, 12, 0) 68%)"),
  },
  outerRing: { position: "absolute", borderRadius: 9999, borderWidth: 1, borderColor: themed("rgba(196, 181, 253, 0.14)") },
  orbit: {
    position: "absolute",
    borderRadius: 9999,
    borderWidth: 1.2,
    borderColor: themed("rgba(196, 181, 253, 0.45)"),
    transform: [{ rotate: "-16deg" }],
  },
  sphere: {
    position: "absolute",
    overflow: "hidden",
    borderRadius: 9999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: themed("rgba(237, 233, 254, 0.55)"),
    backgroundImage:
      themed("radial-gradient(circle at 35% 28%, rgba(255, 255, 255, 0.32) 0%, rgba(196, 181, 253, 0.2) 30%, rgba(124, 58, 237, 0.24) 65%, rgba(30, 27, 75, 0.6) 100%)"),
    boxShadow: themed("0px 0px 60px rgba(167, 139, 250, 0.55), 0px 0px 120px rgba(124, 58, 237, 0.25)"),
  },
  rays: { ...StyleSheet.absoluteFill },
  ray: {
    position: "absolute",
    height: 1.5,
    marginTop: -0.75,
    transformOrigin: "left center",
    backgroundImage: themed("linear-gradient(90deg, rgba(237, 233, 254, 0.75) 0%, rgba(196, 181, 253, 0) 100%)"),
  },
  core: {
    borderRadius: 9999,
    alignItems: "center",
    justifyContent: "center",
    backgroundImage: themed("radial-gradient(circle at 45% 40%, #FFFFFF 0%, #EDE9FE 25%, #C4B5FD 55%, rgba(124, 58, 237, 0.2) 100%)"),
    boxShadow: themed("0px 0px 36px rgba(237, 233, 254, 0.95)"),
  },
  specular: {
    position: "absolute",
    top: "7%",
    left: "18%",
    width: "42%",
    height: "20%",
    borderRadius: 9999,
    backgroundColor: "rgba(255, 255, 255, 0.16)",
    transform: [{ rotate: "-22deg" }],
  },
  rim: {
    ...StyleSheet.absoluteFill,
    borderRadius: 9999,
    borderWidth: 6,
    borderColor: themed("rgba(196, 181, 253, 0.08)"),
  },
  node: {
    position: "absolute",
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: themed("rgba(196, 181, 253, 0.3)"),
    backgroundColor: themed("rgba(32, 28, 52, 0.92)"),
    boxShadow: themed("0px 0px 20px rgba(167, 139, 250, 0.32)"),
  },
  mote: {
    position: "absolute",
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: themed("#EDE9FE"),
    boxShadow: themed("0px 0px 10px rgba(196, 181, 253, 1)"),
  },
  comet: {
    position: "absolute",
    backgroundColor: themed("#F5F3FF"),
    boxShadow: themed("0px 0px 14px rgba(221, 214, 254, 1), 0px 0px 28px rgba(167, 139, 250, 0.8)"),
  },
});
