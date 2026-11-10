import type { ReactNode } from "react";
import { Platform, StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, type SharedValue } from "react-native-reanimated";

import { colors, fontFamilies, themed } from "@/theme";

import { AppText } from "../AppText";
import { Icon, type IconName } from "../Icon";
import { stagger, useEntrance, useLoop } from "./motion";

const BAR_COUNT = 22;
const MONO = Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" });

function WaveBar({ index, maxHeight, time }: { index: number; maxHeight: number; time: SharedValue<number> }) {
  // Taller in the middle, like a voice envelope.
  const envelope = 0.35 + 0.65 * Math.sin((Math.PI * (index + 0.5)) / BAR_COUNT);
  // scaleY (not height) keeps the animation off the layout pass.
  const style = useAnimatedStyle(() => ({
    transform: [{ scaleY: 0.2 + 0.8 * Math.abs(Math.sin(Math.PI * (time.get() * 4 + index * 0.21))) }],
  }));
  return <Animated.View style={[styles.waveBar, { height: Math.max(4, maxHeight * envelope) }, style]} />;
}

function FlowDot({ offset, length, time }: { offset: number; length: number; time: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    const t = (time.get() + offset) % 1;
    return { opacity: Math.sin(t * Math.PI), transform: [{ translateY: t * length }] };
  });
  return <Animated.View style={[styles.flowDot, style]} />;
}

function Card({ title, icon, index, progress, children }: { title: string; icon: IconName; index: number; progress: SharedValue<number>; children: ReactNode }) {
  const style = useAnimatedStyle(() => {
    const p = stagger(progress.get(), 0.5 + index * 0.09, 0.3);
    return { opacity: p, transform: [{ translateY: (1 - p) * 14 }, { scale: 0.94 + 0.06 * p }] };
  });
  return (
    <Animated.View style={[styles.card, style]}>
      <View style={styles.cardHeader}>
        <Icon name={icon} size={12} color={colors.veya.lavender} />
        <AppText style={styles.cardTitle} numberOfLines={1}>
          {title}
        </AppText>
      </View>
      {children}
    </Animated.View>
  );
}

const Line = ({ width, tone = "rgba(255, 255, 255, 0.16)" }: { width: `${number}%`; tone?: string }) => (
  <View style={[styles.line, { width, backgroundColor: tone }]} />
);

/** Page 2 — a voice waveform flowing into an organised project workspace. */
export function ManagementArt({ size, active }: { size: number; active: boolean }) {
  const progress = useEntrance(active, 2000);
  const wave = useLoop(3200, active);
  const flow = useLoop(1600, active);

  const pillWidth = size * 0.7;
  const pillHeight = Math.max(48, size * 0.15);
  const flowTop = size * 0.03 + pillHeight;
  const panelTop = size * 0.34;
  const flowLength = panelTop - flowTop;

  const pillStyle = useAnimatedStyle(() => {
    const p = stagger(progress.get(), 0, 0.25);
    return { opacity: p, transform: [{ translateY: (1 - p) * -12 }] };
  });
  const flowStyle = useAnimatedStyle(() => ({ opacity: stagger(progress.get(), 0.2, 0.2) }));
  const panelStyle = useAnimatedStyle(() => {
    const p = stagger(progress.get(), 0.3, 0.3);
    return { opacity: p, transform: [{ translateY: (1 - p) * 18 }] };
  });

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="A voice waveform turning into an organised workspace with notes, implementation steps, a diagram and a README file"
      style={{ width: size, height: size }}
    >
      <Animated.View
        style={[styles.pill, { width: pillWidth, height: pillHeight, left: (size - pillWidth) / 2, top: size * 0.03 }, pillStyle]}
      >
        <View style={styles.mic}>
          <Icon name="mic" size={15} color={colors.text.inverse} />
        </View>
        <View style={styles.wave}>
          {Array.from({ length: BAR_COUNT }, (_, index) => (
            <WaveBar key={index} index={index} maxHeight={pillHeight * 0.62} time={wave} />
          ))}
        </View>
      </Animated.View>

      <Animated.View style={[styles.flow, { top: flowTop, height: flowLength, left: size / 2 - 1 }, flowStyle]}>
        <FlowDot offset={0} length={flowLength} time={flow} />
        <FlowDot offset={0.5} length={flowLength} time={flow} />
      </Animated.View>
      <Animated.View style={[styles.organising, { top: flowTop + flowLength / 2 - 12, left: size / 2 + 12 }, flowStyle]}>
        <Icon name="sparkle" size={11} color={colors.veya.lavender} />
        <AppText style={styles.organisingLabel}>Organising</AppText>
      </Animated.View>

      <Animated.View style={[styles.panel, { top: panelTop, left: size * 0.02, width: size * 0.96, height: size * 0.64 }, panelStyle]}>
        <View style={styles.panelHeader}>
          <View style={styles.trafficLights}>
            <View style={[styles.light, { backgroundColor: "#FF5F57" }]} />
            <View style={[styles.light, { backgroundColor: "#FEBC2E" }]} />
            <View style={[styles.light, { backgroundColor: "#28C840" }]} />
          </View>
          <AppText style={styles.panelTitle}>Project workspace</AppText>
        </View>

        <View style={styles.grid}>
          <View style={styles.gridRow}>
            <Card title="Notes" icon="document" index={0} progress={progress}>
              <Line width="92%" />
              <Line width="74%" />
              <Line width="58%" />
            </Card>
            <Card title="Steps" icon="checklist" index={1} progress={progress}>
              {[true, true, false].map((done, row) => (
                <View key={row} style={styles.stepRow}>
                  <View style={[styles.checkbox, done && styles.checkboxDone]}>
                    {done ? <Icon name="check" size={7} color={colors.text.primary} weight="semibold" /> : null}
                  </View>
                  <Line width={row === 2 ? "50%" : "70%"} />
                </View>
              ))}
            </Card>
          </View>
          <View style={styles.gridRow}>
            <Card title="Diagram" icon="list" index={2} progress={progress}>
              <View style={styles.diagram}>
                <View style={styles.diagramRow}>
                  <View style={styles.box} />
                  <View style={styles.connector} />
                  <View style={[styles.box, styles.boxAccent]} />
                  <View style={styles.connector} />
                  <View style={styles.box} />
                </View>
                <View style={styles.diagramDrop} />
                <View style={[styles.box, styles.boxWide]} />
              </View>
            </Card>
            <Card title="README.md" icon="document" index={3} progress={progress}>
              <AppText style={[styles.code, styles.codeHeading]}># Veya</AppText>
              <AppText style={[styles.code, styles.codeSub]}>## Getting started</AppText>
              <AppText style={[styles.code, styles.codeMuted]}>npm install</AppText>
            </Card>
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: themed("rgba(196, 181, 253, 0.4)"),
    backgroundColor: themed("rgba(30, 27, 52, 0.9)"),
    boxShadow: themed("0px 0px 30px rgba(167, 139, 250, 0.35)"),
  },
  mic: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundImage: `linear-gradient(135deg, ${colors.veya.lavender} 0%, ${colors.veya.violet} 100%)`,
  },
  wave: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between", height: "100%" },
  waveBar: { width: 2.5, borderRadius: 2, backgroundColor: themed("#EDE9FE") },
  flow: {
    position: "absolute",
    width: 2,
    borderRadius: 1,
    alignItems: "center",
    backgroundImage: themed("linear-gradient(180deg, rgba(196, 181, 253, 0.6) 0%, rgba(196, 181, 253, 0.1) 100%)"),
  },
  flowDot: {
    position: "absolute",
    top: -3,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: themed("#EDE9FE"),
    boxShadow: themed("0px 0px 10px rgba(196, 181, 253, 1)"),
  },
  organising: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: themed("rgba(124, 58, 237, 0.22)"),
    borderWidth: 1,
    borderColor: themed("rgba(196, 181, 253, 0.35)"),
  },
  organisingLabel: { fontFamily: fontFamilies.medium, fontSize: 10, lineHeight: 13, color: themed("#E4DEFF") },
  panel: {
    position: "absolute",
    padding: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.overlay.borderStrong,
    backgroundColor: themed("rgba(18, 16, 30, 0.92)"),
    boxShadow: themed("0px 18px 40px rgba(0, 0, 0, 0.55), 0px 0px 30px rgba(124, 58, 237, 0.18)"),
  },
  panelHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  trafficLights: { flexDirection: "row", gap: 4 },
  light: { width: 7, height: 7, borderRadius: 4, opacity: 0.85 },
  panelTitle: { fontFamily: fontFamilies.medium, fontSize: 10.5, lineHeight: 14, color: colors.text.secondary },
  grid: { flex: 1, gap: 8 },
  gridRow: { flex: 1, flexDirection: "row", gap: 8 },
  card: {
    flex: 1,
    gap: 5,
    padding: 9,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: themed("rgba(196, 181, 253, 0.16)"),
    backgroundColor: themed("rgba(124, 58, 237, 0.08)"),
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 2 },
  cardTitle: { fontFamily: fontFamilies.semibold, fontSize: 10.5, lineHeight: 14, color: colors.text.primary },
  line: { height: 4, borderRadius: 2 },
  stepRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  checkbox: {
    width: 10,
    height: 10,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: colors.veya.lavender,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxDone: { backgroundColor: colors.veya.purple, borderColor: colors.veya.violet },
  diagram: { alignItems: "center", gap: 0 },
  diagramRow: { flexDirection: "row", alignItems: "center" },
  box: { width: 16, height: 11, borderRadius: 3, borderWidth: 1, borderColor: themed("rgba(196, 181, 253, 0.7)") },
  boxAccent: { backgroundColor: themed("rgba(167, 139, 250, 0.45)") },
  boxWide: { width: 30 },
  connector: { width: 9, height: 1, backgroundColor: themed("rgba(196, 181, 253, 0.6)") },
  diagramDrop: { width: 1, height: 8, backgroundColor: themed("rgba(196, 181, 253, 0.6)") },
  code: { fontFamily: MONO, fontSize: 9, lineHeight: 13 },
  codeHeading: { color: colors.veya.lavender, fontWeight: "700" },
  codeSub: { color: themed("#DDD6FE") },
  codeMuted: { color: colors.text.secondary },
});
