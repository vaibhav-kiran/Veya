import { StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, type SharedValue } from "react-native-reanimated";

import { colors, fontFamilies, themed } from "@/theme";

import { AppText } from "../AppText";
import { Icon, type IconName } from "../Icon";
import { TAU, stagger, useEntrance, useLoop } from "./motion";

const FEATURES: { label: string; icon: IconName }[] = [
  { label: "Multilingual voice", icon: "language" },
  { label: "AI ideation", icon: "idea" },
  { label: "Tech guidance", icon: "build" },
  { label: "Workflow diagrams", icon: "list" },
  { label: "Concepts", icon: "sparkle" },
  { label: "README.md", icon: "document" },
];

const CHIP_WIDTH = 132;
const CHIP_HEIGHT = 30;
const MINI_BARS = [5, 9, 14, 20, 14, 9, 5];

type OrbitChipProps = {
  label: string;
  icon: IconName;
  index: number;
  center: number;
  radiusX: number;
  radiusY: number;
  orbit: SharedValue<number>;
  progress: SharedValue<number>;
};

/** A feature chip travelling an elliptical orbit; chips "behind" the phone shrink and dim. */
function OrbitChip({ label, icon, index, center, radiusX, radiusY, orbit, progress }: OrbitChipProps) {
  const style = useAnimatedStyle(() => {
    const angle = (index / FEATURES.length + orbit.get()) * TAU - Math.PI / 2;
    const depth = (Math.sin(angle) + 1) / 2; // 0 = back (top), 1 = front (bottom)
    const entrance = stagger(progress.get(), 0.35 + index * 0.07, 0.3);
    return {
      opacity: entrance * (0.55 + 0.45 * depth),
      zIndex: depth > 0.5 ? 3 : 1,
      transform: [
        { translateX: Math.cos(angle) * radiusX * (0.6 + 0.4 * entrance) },
        { translateY: Math.sin(angle) * radiusY * (0.6 + 0.4 * entrance) },
        { scale: 0.82 + 0.18 * depth },
      ],
    };
  });

  return (
    <Animated.View style={[styles.chipWrap, { left: center - CHIP_WIDTH / 2, top: center - CHIP_HEIGHT / 2 }, style]}>
      <View style={styles.chip}>
        <Icon name={icon} size={13} color={colors.veya.lavender} />
        <AppText style={styles.chipLabel} numberOfLines={1}>
          {label}
        </AppText>
      </View>
    </Animated.View>
  );
}

/** Page 3 — the Veya interface at the centre of its feature set. */
export function FeaturesArt({ size, active }: { size: number; active: boolean }) {
  const progress = useEntrance(active, 1900);
  const orbit = useLoop(48000, active);
  const breathe = useLoop(2400, active, true);
  const center = size / 2;
  const phoneWidth = size * 0.34;
  const phoneHeight = size * 0.56;
  const orb = phoneWidth * 0.62;

  const phoneStyle = useAnimatedStyle(() => {
    const p = stagger(progress.get(), 0, 0.35);
    return { opacity: p, zIndex: 2, transform: [{ translateY: (1 - p) * 20 }, { scale: 0.9 + 0.1 * p }] };
  });
  const glowStyle = useAnimatedStyle(() => ({
    opacity: stagger(progress.get(), 0.1, 0.4) * (0.6 + 0.4 * breathe.get()),
    transform: [{ scale: 0.95 + 0.1 * breathe.get() }],
  }));
  const orbStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + 0.05 * breathe.get() }] }));
  const trackStyle = useAnimatedStyle(() => ({ opacity: stagger(progress.get(), 0.3, 0.4) * 0.45 }));

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="The Veya app surrounded by its features: multilingual voice, AI ideation, technical guidance, workflow diagrams, concept generation and README files"
      style={{ width: size, height: size }}
    >
      <Animated.View
        style={[styles.glow, { width: size * 0.8, height: size * 0.8, left: size * 0.1, top: size * 0.1 }, glowStyle]}
      />
      <Animated.View
        style={[styles.track, { width: size * 0.84, height: size * 0.84, left: size * 0.08, top: size * 0.08 }, trackStyle]}
      />

      {FEATURES.map((feature, index) => (
        <OrbitChip
          key={feature.label}
          label={feature.label}
          icon={feature.icon}
          index={index}
          center={center}
          radiusX={size * 0.38}
          radiusY={size * 0.42}
          orbit={orbit}
          progress={progress}
        />
      ))}

      <Animated.View
        style={[
          styles.phone,
          { width: phoneWidth, height: phoneHeight, left: center - phoneWidth / 2, top: center - phoneHeight / 2 },
          phoneStyle,
        ]}
      >
        <View style={styles.notch} />
        <View style={styles.phoneBrand}>
          <Icon name="sparkle" size={9} color={colors.veya.lavender} />
          <AppText style={styles.phoneBrandText}>VEYA</AppText>
        </View>
        <Animated.View style={[styles.miniOrb, { width: orb, height: orb }, orbStyle]}>
          <View style={styles.miniWave}>
            {MINI_BARS.map((height, index) => (
              <View key={index} style={[styles.miniBar, { height: height * (orb / 70) }]} />
            ))}
          </View>
        </Animated.View>
        <View style={styles.phoneLines}>
          <View style={[styles.phoneLine, { width: "70%" }]} />
          <View style={[styles.phoneLine, { width: "48%" }]} />
        </View>
        <View style={styles.phoneTabs}>
          {[0, 1, 2].map((tab) => (
            <View key={tab} style={[styles.phoneTab, tab === 0 && styles.phoneTabActive]} />
          ))}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  glow: {
    position: "absolute",
    borderRadius: 9999,
    backgroundImage: themed("radial-gradient(circle, rgba(124, 58, 237, 0.42) 0%, rgba(30, 27, 75, 0.25) 45%, rgba(8, 8, 12, 0) 70%)"),
  },
  track: {
    position: "absolute",
    borderRadius: 9999,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: themed("rgba(196, 181, 253, 0.5)"),
    transform: [{ scaleX: 0.9 }],
  },
  chipWrap: { position: "absolute", width: CHIP_WIDTH, height: CHIP_HEIGHT, alignItems: "center", justifyContent: "center" },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: themed("rgba(196, 181, 253, 0.35)"),
    backgroundColor: themed("rgba(26, 22, 44, 0.95)"),
    boxShadow: themed("0px 4px 14px rgba(0, 0, 0, 0.4), 0px 0px 12px rgba(124, 58, 237, 0.25)"),
  },
  chipLabel: { fontFamily: fontFamilies.medium, fontSize: 11, lineHeight: 14, color: colors.text.primary },
  phone: {
    position: "absolute",
    alignItems: "center",
    paddingTop: 8,
    paddingHorizontal: 8,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: themed("rgba(221, 214, 254, 0.55)"),
    backgroundColor: themed("#0D0C16"),
    backgroundImage: themed("radial-gradient(ellipse 120% 60% at 50% 0%, rgba(30, 27, 75, 0.95) 0%, rgba(13, 12, 22, 1) 70%)"),
    boxShadow: themed("0px 20px 40px rgba(0, 0, 0, 0.6), 0px 0px 36px rgba(167, 139, 250, 0.35)"),
  },
  notch: { width: "30%", height: 5, borderRadius: 3, backgroundColor: "rgba(255, 255, 255, 0.12)" },
  phoneBrand: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 8 },
  phoneBrandText: { fontFamily: fontFamilies.medium, fontSize: 8, lineHeight: 10, letterSpacing: 1.6, color: colors.text.primary },
  miniOrb: {
    marginTop: 10,
    borderRadius: 9999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: themed("rgba(221, 214, 254, 0.55)"),
    backgroundImage: themed("radial-gradient(circle at 38% 30%, rgba(237, 233, 254, 0.55) 0%, rgba(167, 139, 250, 0.4) 35%, rgba(76, 29, 149, 0.6) 100%)"),
    boxShadow: themed("0px 0px 22px rgba(196, 181, 253, 0.6)"),
  },
  miniWave: { flexDirection: "row", alignItems: "center", gap: 2 },
  miniBar: { width: 1.5, borderRadius: 1, backgroundColor: themed("#F5F3FF") },
  phoneLines: { marginTop: 10, width: "100%", alignItems: "center", gap: 4 },
  phoneLine: { height: 3, borderRadius: 2, backgroundColor: "rgba(255, 255, 255, 0.16)" },
  phoneTabs: {
    position: "absolute",
    bottom: 8,
    flexDirection: "row",
    gap: 10,
  },
  phoneTab: { width: 8, height: 8, borderRadius: 3, backgroundColor: "rgba(255, 255, 255, 0.18)" },
  phoneTabActive: { backgroundColor: colors.veya.lavender },
});
