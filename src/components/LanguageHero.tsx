import { StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, type SharedValue } from "react-native-reanimated";

import { colors, fontFamilies, themed } from "@/theme";

import { AppText } from "./AppText";
import { Icon } from "./Icon";
import { useLoop } from "./onboarding/motion";

const TAU = Math.PI * 2;
const GLYPHS = ["अ", "த", "తె", "മ", "ಕ", "অ", "Aa", "ગ"];
const SIZE = 168;
const ORB = 72;
const RADIUS = 64;

function OrbitGlyph({ glyph, index, spin }: { glyph: string; index: number; spin: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    const angle = (index / GLYPHS.length + spin.get()) * TAU;
    // Flattened orbit with depth: glyphs at the back are smaller and dimmer.
    const depth = (Math.sin(angle) + 1) / 2;
    return {
      opacity: 0.35 + 0.65 * depth,
      zIndex: depth > 0.5 ? 2 : 0,
      transform: [
        { translateX: Math.cos(angle) * RADIUS * 1.25 },
        { translateY: Math.sin(angle) * RADIUS * 0.45 },
        { scale: 0.75 + 0.35 * depth },
      ],
    };
  });
  return (
    <Animated.View style={[styles.glyph, style]}>
      <AppText style={styles.glyphText}>{glyph}</AppText>
    </Animated.View>
  );
}

/** A glowing globe with letters from many scripts orbiting it. */
export function LanguageHero() {
  const spin = useLoop(22000, true);
  const breathe = useLoop(2800, true, true);
  const orbStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + breathe.get() * 0.05 }], zIndex: 1 }));
  const haloStyle = useAnimatedStyle(() => ({ opacity: 0.5 + 0.4 * breathe.get() }));

  return (
    <View style={styles.root} accessible accessibilityRole="image" accessibilityLabel="Letters from many Indian scripts orbiting a globe">
      <Animated.View style={[styles.halo, haloStyle]} />
      <View style={styles.ring} />
      {GLYPHS.map((glyph, index) => (
        <OrbitGlyph key={glyph} glyph={glyph} index={index} spin={spin} />
      ))}
      <Animated.View style={[styles.orb, orbStyle]}>
        <View style={styles.shine} />
        <Icon name="language" size={30} color={colors.text.primary} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { width: SIZE * 1.4, height: SIZE * 0.85, alignSelf: "center", alignItems: "center", justifyContent: "center" },
  halo: {
    position: "absolute",
    width: SIZE * 1.3,
    height: SIZE * 1.3,
    borderRadius: 9999,
    backgroundImage: themed("radial-gradient(circle, rgba(167, 139, 250, 0.35) 0%, rgba(124, 58, 237, 0.12) 40%, rgba(8, 8, 12, 0) 68%)"),
  },
  ring: {
    position: "absolute",
    width: RADIUS * 2.5,
    height: RADIUS * 0.9,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: themed("rgba(196, 181, 253, 0.28)"),
  },
  orb: {
    width: ORB,
    height: ORB,
    borderRadius: ORB / 2,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: themed("rgba(237, 233, 254, 0.7)"),
    backgroundImage: themed("radial-gradient(circle at 38% 30%, #EDE9FE 0%, #A78BFA 45%, #5B21B6 100%)"),
    boxShadow: themed("0px 0px 36px rgba(196, 181, 253, 0.75)"),
  },
  shine: {
    position: "absolute",
    top: "8%",
    left: "20%",
    width: "45%",
    height: "22%",
    borderRadius: 9999,
    backgroundColor: "rgba(255, 255, 255, 0.35)",
    transform: [{ rotate: "-20deg" }],
  },
  glyph: {
    position: "absolute",
    minWidth: 30,
    height: 30,
    paddingHorizontal: 6,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: themed("rgba(196, 181, 253, 0.35)"),
    backgroundColor: themed("rgba(26, 22, 44, 0.95)"),
  },
  glyphText: { fontFamily: fontFamilies.semibold, fontSize: 13, lineHeight: 17, color: themed("#E4DEFF") },
});
