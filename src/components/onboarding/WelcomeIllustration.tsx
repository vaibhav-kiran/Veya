import { StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, type SharedValue } from "react-native-reanimated";

import { colors, themed } from "@/theme";

import { Icon, type IconName } from "../Icon";
import { TAU, stagger, useEntrance, useLoop } from "./motion";

const SKIN = "#E9B994";
const SKIN_SHADE = "#D9A27C";
const HAIR = themed("#1E1B4B");

type Token = { icon: IconName; x: number; y: number; size: number; phase: number };

/** Glowing idea tokens floating around the character (the reference's "coins"). */
const TOKENS: Token[] = [
  { icon: "idea", x: 0.17, y: 0.13, size: 0.13, phase: 0 },
  { icon: "sparkle", x: 0.8, y: 0.07, size: 0.12, phase: 0.3 },
  { icon: "mic", x: 0.9, y: 0.36, size: 0.11, phase: 0.55 },
  { icon: "chat", x: 0.08, y: 0.45, size: 0.1, phase: 0.8 },
];

type Leaf = { x: number; rotate: number; height: number; color: string; phase: number };

const LEAVES: Leaf[] = [
  { x: 0.05, rotate: -28, height: 0.24, color: themed("rgba(124, 58, 237, 0.85)"), phase: 0 },
  { x: 0.11, rotate: -8, height: 0.3, color: themed("rgba(167, 139, 250, 0.75)"), phase: 0.3 },
  { x: 0.17, rotate: 14, height: 0.2, color: themed("rgba(76, 29, 149, 0.95)"), phase: 0.6 },
  { x: 0.8, rotate: -16, height: 0.22, color: themed("rgba(76, 29, 149, 0.95)"), phase: 0.15 },
  { x: 0.86, rotate: 6, height: 0.3, color: themed("rgba(167, 139, 250, 0.75)"), phase: 0.45 },
  { x: 0.92, rotate: 28, height: 0.24, color: themed("rgba(124, 58, 237, 0.85)"), phase: 0.75 },
];

const CONFETTI = [
  { x: 0.33, y: 0.05, rotate: 30, color: colors.veya.lavender },
  { x: 0.63, y: 0.16, rotate: -20, color: colors.veya.violet },
  { x: 0.95, y: 0.6, rotate: 60, color: colors.veya.lavender },
  { x: 0.03, y: 0.27, rotate: -40, color: colors.veya.violet },
];

function FloatingToken({ token, size, float, progress, index }: { token: Token; size: number; float: SharedValue<number>; progress: SharedValue<number>; index: number }) {
  const diameter = token.size * size;
  const style = useAnimatedStyle(() => {
    const wave = Math.sin((float.get() + token.phase) * TAU);
    const p = stagger(progress.get(), 0.35 + index * 0.08, 0.3);
    return {
      opacity: p,
      transform: [{ translateY: wave * 6 }, { rotate: `${wave * 8}deg` }, { scale: 0.5 + 0.5 * p }],
    };
  });
  return (
    <Animated.View
      style={[
        styles.token,
        { width: diameter, height: diameter, borderRadius: diameter / 2, left: token.x * size - diameter / 2, top: token.y * size - diameter / 2 },
        style,
      ]}
    >
      <Icon name={token.icon} size={diameter * 0.46} color={colors.veya.indigo} />
    </Animated.View>
  );
}

function SwayingLeaf({ leaf, size, sway, progress }: { leaf: Leaf; size: number; sway: SharedValue<number>; progress: SharedValue<number> }) {
  const width = size * 0.075;
  const height = leaf.height * size;
  const style = useAnimatedStyle(() => {
    const p = stagger(progress.get(), 0.2, 0.35);
    return {
      opacity: p,
      transform: [{ rotate: `${leaf.rotate + Math.sin((sway.get() + leaf.phase) * TAU) * 4}deg` }, { scaleY: 0.3 + 0.7 * p }],
    };
  });
  return (
    <Animated.View
      style={[
        styles.leaf,
        {
          width,
          height,
          left: leaf.x * size - width / 2,
          top: size * 0.94 - height,
          backgroundColor: leaf.color,
          borderTopLeftRadius: width,
          borderBottomRightRadius: width,
          borderTopRightRadius: width * 0.15,
          borderBottomLeftRadius: width * 0.15,
        },
        style,
      ]}
    />
  );
}

/** Final onboarding page: a friendly character waving hello inside a glowing blob. */
export function WelcomeIllustration({ size, active }: { size: number; active: boolean }) {
  const progress = useEntrance(active, 1500, 60);
  const wave = useLoop(1100, active, true);
  const float = useLoop(4200, active);
  const sway = useLoop(5200, active);
  const breathe = useLoop(3000, active, true);

  // Blob geometry; the character is drawn inside it and cropped by its edge.
  const blobW = size * 0.84;
  const blobH = size * 0.8;
  const cx = blobW / 2;
  const torsoW = blobW * 0.52;
  const torsoH = blobH * 0.34;
  const torsoTop = blobH - torsoH + blobH * 0.04;
  const neckW = blobW * 0.1;
  const neckH = blobH * 0.08;
  const neckTop = torsoTop - neckH * 0.75;
  const headW = blobW * 0.25;
  const headH = blobH * 0.3;
  const headTop = neckTop - headH * 0.86;
  const eye = blobW * 0.075;
  const eyeY = headTop + headH * 0.42;
  const armW = blobW * 0.085;
  const armH = blobH * 0.27;
  const shoulderX = cx + torsoW * 0.36;
  const shoulderY = torsoTop + torsoH * 0.18;
  const hand = blobW * 0.09;

  const blobStyle = useAnimatedStyle(() => {
    const p = stagger(progress.get(), 0, 0.35);
    return { opacity: p, transform: [{ scale: (0.85 + 0.15 * p) * (1 + 0.015 * breathe.get()) }] };
  });
  const personStyle = useAnimatedStyle(() => {
    const p = stagger(progress.get(), 0.15, 0.35);
    return { transform: [{ translateY: (1 - p) * blobH * 0.4 + breathe.get() * 2 }] };
  });
  // Waving: the arm swings around the shoulder.
  const armStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${22 + wave.get() * 22}deg` }] }));

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="A smiling person waving hello, surrounded by glowing ideas"
      style={{ width: size, height: size }}
    >
      {CONFETTI.map((piece) => (
        <View
          key={`${piece.x}-${piece.y}`}
          style={[styles.confetti, { left: piece.x * size, top: piece.y * size, backgroundColor: piece.color, transform: [{ rotate: `${piece.rotate}deg` }] }]}
        />
      ))}

      <Animated.View style={[styles.blob, { width: blobW, height: blobH, left: (size - blobW) / 2, top: size * 0.1 }, blobStyle]}>
        <Animated.View style={[StyleSheet.absoluteFill, personStyle]}>
          {/* Waving arm sits behind the torso */}
          <Animated.View
            style={[
              styles.arm,
              { width: armW, height: armH, left: shoulderX - armW / 2, top: shoulderY - armH, borderRadius: armW / 2 },
              armStyle,
            ]}
          >
            <View style={[styles.hand, { width: hand, height: hand, borderRadius: hand / 2, top: -hand * 0.55, left: (armW - hand) / 2 }]} />
          </Animated.View>

          <View style={[styles.torso, { width: torsoW, height: torsoH, left: cx - torsoW / 2, top: torsoTop, borderTopLeftRadius: torsoW * 0.42, borderTopRightRadius: torsoW * 0.42 }]} />
          <View style={[styles.neck, { width: neckW, height: neckH, left: cx - neckW / 2, top: neckTop }]} />
          {/* V-neck collar */}
          <View style={[styles.collar, { width: neckW * 1.1, height: neckW * 1.1, left: cx - (neckW * 1.1) / 2, top: torsoTop - neckW * 0.35 }]} />

          <View style={[styles.ear, { width: headW * 0.2, height: headW * 0.26, left: cx - headW / 2 - headW * 0.08, top: headTop + headH * 0.42 }]} />
          <View style={[styles.ear, { width: headW * 0.2, height: headW * 0.26, left: cx + headW / 2 - headW * 0.12, top: headTop + headH * 0.42 }]} />
          <View style={[styles.head, { width: headW, height: headH, left: cx - headW / 2, top: headTop }]} />

          {/* Hair */}
          <View
            style={[
              styles.hair,
              { width: headW * 1.08, height: headH * 0.42, left: cx - (headW * 1.08) / 2, top: headTop - headH * 0.08, borderTopLeftRadius: headW * 0.55, borderTopRightRadius: headW * 0.55 },
            ]}
          />
          <View style={[styles.hair, { width: headW * 0.5, height: headH * 0.28, left: cx - headW * 0.05, top: headTop - headH * 0.16, borderRadius: headW * 0.3, transform: [{ rotate: "-18deg" }] }]} />

          {/* Glasses */}
          <View style={[styles.lens, { width: eye, height: eye, borderRadius: eye / 2, left: cx - eye - headW * 0.04, top: eyeY }]} />
          <View style={[styles.lens, { width: eye, height: eye, borderRadius: eye / 2, left: cx + headW * 0.04, top: eyeY }]} />
          <View style={[styles.bridge, { width: headW * 0.09, left: cx - headW * 0.045, top: eyeY + eye * 0.42 }]} />
          <View style={[styles.pupil, { left: cx - eye / 2 - headW * 0.04 - 2, top: eyeY + eye / 2 - 2 }]} />
          <View style={[styles.pupil, { left: cx + eye / 2 + headW * 0.04 - 2, top: eyeY + eye / 2 - 2 }]} />

          {/* Smile */}
          <View style={[styles.smile, { width: headW * 0.3, height: headW * 0.14, left: cx - headW * 0.15, top: headTop + headH * 0.66, borderBottomLeftRadius: headW * 0.2, borderBottomRightRadius: headW * 0.2 }]} />
        </Animated.View>
      </Animated.View>

      {LEAVES.map((leaf) => (
        <SwayingLeaf key={`${leaf.x}`} leaf={leaf} size={size} sway={sway} progress={progress} />
      ))}

      {TOKENS.map((token, index) => (
        <FloatingToken key={token.icon} token={token} size={size} float={float} progress={progress} index={index} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  blob: {
    position: "absolute",
    overflow: "hidden",
    // Asymmetric radii give the blob an organic, hand-drawn shape.
    borderTopLeftRadius: 9999,
    borderTopRightRadius: 9999,
    borderBottomLeftRadius: 140,
    borderBottomRightRadius: 170,
    borderWidth: 1,
    borderColor: themed("rgba(196, 181, 253, 0.35)"),
    backgroundImage:
      themed("radial-gradient(circle at 45% 35%, rgba(196, 181, 253, 0.55) 0%, rgba(124, 58, 237, 0.4) 45%, rgba(30, 27, 75, 0.85) 100%)"),
    boxShadow: themed("0px 0px 60px rgba(124, 58, 237, 0.45)"),
  },
  torso: {
    position: "absolute",
    backgroundImage: themed(`linear-gradient(180deg, ${colors.veya.violet} 0%, ${colors.veya.purple} 55%, #4C1D95 100%)`),
  },
  neck: { position: "absolute", backgroundColor: SKIN_SHADE, borderRadius: 6 },
  collar: { position: "absolute", backgroundColor: SKIN_SHADE, transform: [{ rotate: "45deg" }] },
  head: { position: "absolute", borderRadius: 9999, backgroundColor: SKIN },
  ear: { position: "absolute", borderRadius: 9999, backgroundColor: SKIN_SHADE },
  hair: { position: "absolute", backgroundColor: HAIR, borderBottomLeftRadius: 8, borderBottomRightRadius: 8 },
  lens: { position: "absolute", borderWidth: 2, borderColor: HAIR, backgroundColor: "rgba(255, 255, 255, 0.2)" },
  bridge: { position: "absolute", height: 2, backgroundColor: HAIR },
  pupil: { position: "absolute", width: 4, height: 4, borderRadius: 2, backgroundColor: HAIR },
  smile: { position: "absolute", borderBottomWidth: 2.5, borderColor: "#7A3E2B" },
  arm: {
    position: "absolute",
    transformOrigin: "bottom center",
    backgroundImage: `linear-gradient(180deg, ${colors.veya.violet} 0%, ${colors.veya.purple} 100%)`,
  },
  hand: { position: "absolute", backgroundColor: SKIN },
  token: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: themed("rgba(245, 243, 255, 0.85)"),
    backgroundImage: themed("radial-gradient(circle at 38% 32%, #FFFFFF 0%, #DDD6FE 40%, #A78BFA 100%)"),
    boxShadow: themed("0px 0px 22px rgba(196, 181, 253, 0.75)"),
  },
  leaf: { position: "absolute", transformOrigin: "bottom center" },
  confetti: { position: "absolute", width: 10, height: 4, borderRadius: 2, opacity: 0.8 },
});
