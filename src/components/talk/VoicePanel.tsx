import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import Animated, { FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from "react-native-reanimated";

import { voiceControls } from "@/lib/voiceControls";
import { isSessionActive, useConversationStore, type VoicePhase } from "@/stores/conversationStore";
import { useListeningStore } from "@/stores/listeningStore";
import { usePreferencesStore } from "@/stores/preferencesStore";
import { screenGutter, spacing } from "@/theme";

import { AppText } from "../AppText";
import { Button } from "../Button";
import { PressableScale } from "../PressableScale";
import { ORB_TRANSITION, SlimeOrb } from "../SlimeOrb";
import { TextLink } from "../TextLink";
import { useLoop } from "../onboarding/motion";

const RINGS = [0, 0.33, 0.66];

/** Ring of sound spreading out from the orb while listening. */
function ListeningRing({ offset, size, time, liveness }: { offset: number; size: number; time: SharedValue<number>; liveness: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    const t = (time.get() + offset) % 1;
    return { opacity: (1 - t) * 0.6 * liveness.get(), transform: [{ scale: 0.85 + t * 0.7 }] };
  });
  return <Animated.View pointerEvents="none" style={[styles.ring, { width: size, height: size, borderRadius: size / 2 }, style]} />;
}

function formatElapsed(ms: number) {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

const PROMPTS: Record<VoicePhase, { title: string; note: string }> = {
  idle: { title: "Tap and start talking", note: "or swipe left to type" },
  starting: { title: "Connecting to Veya…", note: "" },
  listening: { title: "Listening…", note: "Just talk. I'll send it when you pause, or tap to send now" },
  processing: { title: "Veya is thinking…", note: "" },
  speaking: { title: "Veya is speaking…", note: "Tap the orb to skip" },
  waitingForUser: { title: "Tap to answer", note: "or swipe left to type" },
  awaitingConfirmation: { title: "Is that right?", note: "Say yes, tell me what to change, or build it" },
  generatingProject: { title: "Building your project…", note: "This can take a few minutes" },
  completed: { title: "Your project is ready", note: "" },
  error: { title: "Something went wrong", note: "Tap the orb to continue" },
};

const BUSY: readonly VoicePhase[] = ["starting", "processing", "generatingProject"];

/** Voice side of the Talk tab: Veya's latest line, the orb, one instruction. */
export function VoicePanel() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const startedAt = useListeningStore((state) => state.startedAt);
  const phase = useConversationStore((state) => state.phase);
  const error = useConversationStore((state) => state.error);
  const notice = useConversationStore((state) => state.notice);
  const afterSpeech = useConversationStore((state) => state.afterSpeech);
  const projectId = useConversationStore((state) => state.projectId);
  const handsFree = useConversationStore((state) => state.handsFree);
  const active = useConversationStore(isSessionActive);
  const lastVeya = useConversationStore((state) => state.messages.findLast((message) => message.role === "veya")?.text);
  const lastUser = useConversationStore((state) => state.messages.findLast((message) => message.role === "user")?.text);
  const startVoiceConversation = useConversationStore((state) => state.startVoiceConversation);
  const confirm = useConversationStore((state) => state.confirm);
  const cancel = useConversationStore((state) => state.cancel);
  const startNewConversation = useConversationStore((state) => state.startNewConversation);
  const dismissError = useConversationStore((state) => state.dismissError);
  const responseLanguage = usePreferencesStore((state) => state.languages.response);

  const listening = phase === "listening";
  const rings = useLoop(2000, true);
  // Eases the rings in and out together with the orb (see SlimeOrb).
  const liveness = useSharedValue(listening ? 1 : 0);
  const [now, setNow] = useState(() => Date.now());
  const showConversation = phase !== "idle" && Boolean(lastVeya);
  const orbSize = Math.min(width * 0.6, height * (showConversation ? 0.26 : 0.36), 300);

  useEffect(() => {
    liveness.set(withTiming(listening ? 1 : 0, ORB_TRANSITION));
  }, [listening, liveness]);

  // Tick the elapsed-time label while listening.
  useEffect(() => {
    if (!listening) return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [listening]);

  const onOrbPress = () => {
    switch (phase) {
      case "idle":
      case "completed":
        void startVoiceConversation(responseLanguage);
        return;
      case "listening":
        void voiceControls.stopAndSend();
        return;
      case "speaking":
        voiceControls.stopSpeaking();
        return;
      case "waitingForUser":
      case "awaitingConfirmation":
        void voiceControls.startRecording();
        return;
      case "error":
        dismissError();
        return;
      default:
        return;
    }
  };

  const busy = BUSY.includes(phase) || (phase === "speaking" && afterSpeech === "generate");
  // Hands-free: on the user's turn the mic opens by itself, so say so instead of "tap".
  const prompt =
    handsFree && phase === "waitingForUser"
      ? { title: "Your turn…", note: "Listening starts automatically" }
      : PROMPTS[phase];
  const orbLabel =
    phase === "listening" ? "Stop and send your answer" : phase === "speaking" ? "Skip Veya's reply" : busy ? prompt.title : "Talk to Veya";

  return (
    <View style={styles.panel}>
      {showConversation ? (
        <ScrollView style={styles.lineScroll} contentContainerStyle={styles.lineContent} showsVerticalScrollIndicator={false}>
          <AppText variant="eyebrow" tone="accent" align="center">
            Veya
          </AppText>
          <AppText variant="h3" align="center" accessibilityLiveRegion="polite" selectable>
            {lastVeya}
          </AppText>
          {lastUser ? (
            <AppText variant="bodySmall" tone="secondary" align="center" numberOfLines={3}>
              You said: “{lastUser}”
            </AppText>
          ) : null}
        </ScrollView>
      ) : (
        <AppText variant="h1" align="center" accessibilityRole="header" style={styles.title}>
          What are we{"\n"}building today?
        </AppText>
      )}

      <View style={styles.center}>
        <View pointerEvents="none" style={styles.rings}>
          {RINGS.map((offset) => (
            <ListeningRing key={offset} offset={offset} size={orbSize} time={rings} liveness={liveness} />
          ))}
        </View>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={orbLabel}
          accessibilityState={{ disabled: busy, busy }}
          accessibilityHint="Swipe left to type instead"
          disabled={busy}
          onPress={onOrbPress}
          pressedScale={0.94}
        >
          <SlimeOrb size={orbSize} live={listening || phase === "speaking"} />
        </PressableScale>
      </View>

      <View style={styles.footer}>
        <Animated.View key={phase} entering={FadeIn.duration(220)} exiting={FadeOut.duration(120)} style={styles.footerInner}>
          <AppText variant="h3" align="center" accessibilityLiveRegion="polite">
            {listening ? `${prompt.title}  ${formatElapsed(Math.max(0, now - (startedAt ?? now)))}` : prompt.title}
          </AppText>
          {error ? (
            <AppText variant="bodySmall" tone="error" align="center" accessibilityRole="alert">
              {error}
            </AppText>
          ) : prompt.note ? (
            <AppText variant="bodySmall" tone="secondary" align="center">
              {prompt.note}
            </AppText>
          ) : null}
          {notice && phase !== "error" ? (
            <AppText variant="caption" tone="muted" align="center">
              {notice}
            </AppText>
          ) : null}

          {phase === "awaitingConfirmation" ? (
            <Button label="Build my project" icon="build" iconPosition="left" size="small" onPress={() => void confirm()} />
          ) : null}
          {phase === "completed" && projectId ? (
            <Button
              label="Open project"
              icon="arrowRight"
              size="small"
              onPress={() => router.push({ pathname: "/project/[id]", params: { id: projectId } })}
            />
          ) : null}
          {active && phase !== "generatingProject" ? (
            <TextLink label="End conversation" onPress={() => void cancel()} />
          ) : phase === "completed" || phase === "error" ? (
            <TextLink label="Start a new conversation" onPress={startNewConversation} />
          ) : null}
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Title, orb and prompt sit together as one centred group.
  panel: { flex: 1, paddingHorizontal: screenGutter, justifyContent: "center", gap: spacing[8], paddingBottom: spacing[8] },
  title: { fontSize: 32, lineHeight: 38 },
  lineScroll: { flexGrow: 0, maxHeight: 180 },
  lineContent: { gap: spacing[2] },
  center: { alignItems: "center", justifyContent: "center" },
  rings: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center" },
  // Rings only show while recording, so they share the orb's red recording glow.
  ring: { position: "absolute", borderWidth: 1.5, borderColor: "rgba(255, 99, 120, 0.75)" },
  // Fixed height so switching states doesn't shift the group.
  footer: { minHeight: 96 },
  footerInner: { alignItems: "center", gap: spacing[2] },
});
