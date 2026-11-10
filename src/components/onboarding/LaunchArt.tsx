import { StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, type SharedValue } from "react-native-reanimated";

import { colors, fontFamilies, themed } from "@/theme";

import { AppText } from "../AppText";
import { Icon } from "../Icon";
import { stagger, useEntrance, useLoop } from "./motion";

const GRID_COLUMNS = [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5];
const GRID_ROWS = 7;
const SPARKS = [0, 1, 2, 3, 4, 5];

/** A horizontal grid line that travels toward the viewer, giving a sense of forward motion. */
function GridRow({ index, floorHeight, time }: { index: number; floorHeight: number; time: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    const t = (index + time.get()) / GRID_ROWS;
    return { opacity: Math.min(1, t * 1.6) * 0.55, transform: [{ translateY: floorHeight * t * t }] };
  });
  return <Animated.View style={[styles.gridRow, style]} />;
}

/** Expanding ring of light from the launch pad. */
function PulseRing({ offset, time }: { offset: number; time: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    const t = (time.get() + offset) % 1;
    return { opacity: (1 - t) * 0.7, transform: [{ scale: 0.7 + t * 1.1 }] };
  });
  return <Animated.View style={[StyleSheet.absoluteFill, styles.ring, style]} />;
}

function Spark({ index, x, baseY, rise, time }: { index: number; x: number; baseY: number; rise: number; time: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    const t = (time.get() + index / SPARKS.length) % 1;
    return { opacity: Math.sin(t * Math.PI), transform: [{ translateY: -t * rise }] };
  });
  return <Animated.View style={[styles.spark, { left: x - 2, top: baseY - 2 }, style]} />;
}

/** Page 4 — a futuristic workspace with a glowing launch element. */
export function LaunchArt({ size, active }: { size: number; active: boolean }) {
  const progress = useEntrance(active, 1800);
  const travel = useLoop(2400, active);
  const pulse = useLoop(2600, active);
  const hover = useLoop(2200, active, true);
  const sparks = useLoop(2800, active);

  const center = size / 2;
  const horizon = size * 0.62;
  const floorHeight = size - horizon;
  const padWidth = size * 0.5;
  const padHeight = size * 0.12;
  const rocket = size * 0.24;
  const rocketY = size * 0.33;

  const floorStyle = useAnimatedStyle(() => ({ opacity: stagger(progress.get(), 0, 0.35) }));
  const padStyle = useAnimatedStyle(() => {
    const p = stagger(progress.get(), 0.15, 0.3);
    return { opacity: p, transform: [{ scaleX: 0.4 + 0.6 * p }] };
  });
  const beamStyle = useAnimatedStyle(() => ({
    opacity: stagger(progress.get(), 0.3, 0.3) * (0.55 + 0.45 * hover.get()),
    transform: [{ scaleY: stagger(progress.get(), 0.3, 0.35) }],
  }));
  const rocketStyle = useAnimatedStyle(() => {
    const p = stagger(progress.get(), 0.35, 0.35);
    return { opacity: p, transform: [{ translateY: (1 - p) * 50 - hover.get() * 8 }] };
  });
  const leftPanelStyle = useAnimatedStyle(() => {
    const p = stagger(progress.get(), 0.55, 0.3);
    return { opacity: p, transform: [{ translateX: (1 - p) * -30 }, { translateY: hover.get() * 4 }] };
  });
  const rightPanelStyle = useAnimatedStyle(() => {
    const p = stagger(progress.get(), 0.65, 0.3);
    return { opacity: p, transform: [{ translateX: (1 - p) * 30 }, { translateY: -hover.get() * 4 }] };
  });

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="A futuristic project workspace with a glowing rocket ready to launch"
      style={{ width: size, height: size }}
    >
      {/* Perspective floor */}
      <Animated.View style={[styles.floor, { top: horizon, height: floorHeight }, floorStyle]}>
        {GRID_COLUMNS.map((column) => {
          const endX = center + column * size * 0.2;
          const dx = endX - center;
          const length = Math.hypot(dx, floorHeight);
          const angle = (Math.atan2(floorHeight, dx) * 180) / Math.PI;
          return (
            <View
              key={column}
              style={[
                styles.gridColumn,
                { left: center, width: length, transform: [{ rotate: `${angle}deg` }] },
              ]}
            />
          );
        })}
        {Array.from({ length: GRID_ROWS }, (_, index) => (
          <GridRow key={index} index={index} floorHeight={floorHeight} time={travel} />
        ))}
      </Animated.View>

      {/* Light beam */}
      <Animated.View
        style={[
          styles.beam,
          { width: size * 0.2, height: horizon - size * 0.04, left: center - size * 0.1, top: size * 0.04 },
          beamStyle,
        ]}
      />

      {/* Launch pad + rings */}
      <Animated.View
        style={[{ position: "absolute", width: padWidth, height: padHeight, left: center - padWidth / 2, top: horizon - padHeight / 2 }, padStyle]}
      >
        <PulseRing offset={0} time={pulse} />
        <PulseRing offset={0.33} time={pulse} />
        <PulseRing offset={0.66} time={pulse} />
        <View style={[StyleSheet.absoluteFill, styles.pad]} />
      </Animated.View>

      {SPARKS.map((index) => (
        <Spark
          key={index}
          index={index}
          x={center + (index - 2.5) * size * 0.045}
          baseY={horizon - 6}
          rise={size * 0.42}
          time={sparks}
        />
      ))}

      {/* Rocket */}
      <Animated.View style={[styles.rocket, { width: rocket, height: rocket, left: center - rocket / 2, top: rocketY - rocket / 2 }, rocketStyle]}>
        <View style={styles.rocketShine} />
        <Icon name="rocket" size={rocket * 0.42} color="#FFFFFF" />
      </Animated.View>

      {/* Floating workspace panels */}
      <Animated.View style={[styles.panel, { left: 0, top: size * 0.12, width: size * 0.3 }, leftPanelStyle]}>
        <View style={styles.panelHeader}>
          <Icon name="calendar" size={11} color={colors.veya.lavender} />
          <AppText style={styles.panelTitle}>Timeline</AppText>
        </View>
        <View style={styles.progressTrack}>
          <View style={styles.progressFill} />
        </View>
        <AppText style={styles.panelMeta}>MVP · 72%</AppText>
      </Animated.View>

      <Animated.View style={[styles.panel, { right: 0, top: size * 0.24, width: size * 0.3 }, rightPanelStyle]}>
        <View style={styles.panelHeader}>
          <Icon name="checklist" size={11} color={colors.veya.lavender} />
          <AppText style={styles.panelTitle}>Tasks</AppText>
        </View>
        {[true, true, false].map((done, row) => (
          <View key={row} style={styles.taskRow}>
            <View style={[styles.taskCheck, done && styles.taskCheckDone]} />
            <View style={[styles.taskLine, { width: row === 2 ? "45%" : "65%" }]} />
          </View>
        ))}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  floor: { position: "absolute", left: 0, right: 0, overflow: "hidden" },
  gridColumn: {
    position: "absolute",
    top: 0,
    height: 1,
    transformOrigin: "left center",
    backgroundImage: themed("linear-gradient(90deg, rgba(196, 181, 253, 0) 0%, rgba(196, 181, 253, 0.45) 100%)"),
  },
  gridRow: { position: "absolute", left: 0, right: 0, top: 0, height: 1, backgroundColor: themed("rgba(196, 181, 253, 0.6)") },
  beam: {
    position: "absolute",
    borderRadius: 999,
    transformOrigin: "bottom",
    backgroundImage: themed("linear-gradient(0deg, rgba(196, 181, 253, 0.55) 0%, rgba(167, 139, 250, 0.12) 55%, rgba(167, 139, 250, 0) 100%)"),
  },
  pad: {
    borderRadius: 9999,
    borderWidth: 1.5,
    borderColor: themed("rgba(221, 214, 254, 0.85)"),
    backgroundImage: themed("radial-gradient(ellipse at 50% 50%, rgba(237, 233, 254, 0.75) 0%, rgba(167, 139, 250, 0.45) 40%, rgba(76, 29, 149, 0.2) 100%)"),
    boxShadow: themed("0px 0px 34px rgba(196, 181, 253, 0.85)"),
  },
  ring: { borderRadius: 9999, borderWidth: 1.5, borderColor: themed("rgba(196, 181, 253, 0.8)") },
  spark: {
    position: "absolute",
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: themed("#EDE9FE"),
    boxShadow: themed("0px 0px 8px rgba(196, 181, 253, 1)"),
  },
  rocket: {
    position: "absolute",
    borderRadius: 9999,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: themed("rgba(237, 233, 254, 0.85)"),
    backgroundImage: themed("radial-gradient(circle at 38% 30%, #F5F3FF 0%, #C4B5FD 30%, #7C3AED 72%, #2E1065 100%)"),
    boxShadow: themed("0px 0px 50px rgba(196, 181, 253, 0.9)"),
  },
  rocketShine: {
    position: "absolute",
    top: "8%",
    left: "20%",
    width: "44%",
    height: "20%",
    borderRadius: 9999,
    backgroundColor: "rgba(255, 255, 255, 0.3)",
    transform: [{ rotate: "-20deg" }],
  },
  panel: {
    position: "absolute",
    gap: 6,
    padding: 9,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: themed("rgba(196, 181, 253, 0.28)"),
    backgroundColor: themed("rgba(22, 20, 36, 0.9)"),
    boxShadow: themed("0px 10px 26px rgba(0, 0, 0, 0.5), 0px 0px 18px rgba(124, 58, 237, 0.22)"),
  },
  panelHeader: { flexDirection: "row", alignItems: "center", gap: 5 },
  panelTitle: { fontFamily: fontFamilies.semibold, fontSize: 10.5, lineHeight: 14, color: colors.text.primary },
  panelMeta: { fontFamily: fontFamilies.regular, fontSize: 9.5, lineHeight: 12, color: colors.text.secondary },
  progressTrack: { height: 5, borderRadius: 3, backgroundColor: "rgba(255, 255, 255, 0.1)", overflow: "hidden" },
  progressFill: {
    width: "72%",
    height: "100%",
    borderRadius: 3,
    backgroundImage: `linear-gradient(90deg, ${colors.veya.violet} 0%, ${colors.veya.lavender} 100%)`,
  },
  taskRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  taskCheck: { width: 9, height: 9, borderRadius: 5, borderWidth: 1, borderColor: colors.veya.lavender },
  taskCheckDone: { backgroundColor: colors.veya.violet, borderColor: colors.veya.violet },
  taskLine: { height: 4, borderRadius: 2, backgroundColor: "rgba(255, 255, 255, 0.18)" },
});
