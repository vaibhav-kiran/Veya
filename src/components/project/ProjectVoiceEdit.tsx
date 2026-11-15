import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  type RecordingOptions,
} from "expo-audio";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BACKEND_LANGUAGE } from "@/constants/languages";
import { haptics } from "@/lib/haptics";
import { boardsApi, describeApiError } from "@/lib/veyaApi";
import { VoiceActivityDetector } from "@/lib/voiceActivity";
import { useConversationStore } from "@/stores/conversationStore";
import { usePreferencesStore } from "@/stores/preferencesStore";
import { useProjectsStore } from "@/stores/projectsStore";
import { colors, radii, spacing, themed } from "@/theme";

import { HAIRLINE } from "../ui/Grouped";
import { AppText } from "../AppText";
import { Button } from "../Button";
import { Icon } from "../Icon";
import { IconButton } from "../IconButton";
import { SlimeOrb } from "../SlimeOrb";
import { TextField } from "../TextField";

const RECORDING_OPTIONS: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  numberOfChannels: 1,
  bitRate: 64000,
  isMeteringEnabled: true,
};
const VAD_INTERVAL_MS = 50;
const ORB_SIZE = 58;

type Phase =
  | { kind: "idle" }
  | { kind: "recording" }
  | { kind: "typing" }
  | { kind: "transcribing" }
  | { kind: "editing"; heard: string }
  | { kind: "done"; heard: string; summary: string; changed: string[] }
  | { kind: "error"; message: string };

/**
 * A small glowing orb on a project: tap it and say what to change ("use
 * Firebase instead of PostgreSQL", "we only have one week now"). Veya updates
 * the plan file (README, and with it the Implementation section) and says
 * what it changed. One tap undoes it.
 */
export function ProjectVoiceEdit({ projectId, canUndo }: { projectId: string; canUndo: boolean }) {
  const insets = useSafeAreaInsets();
  const recorder = useAudioRecorder(RECORDING_OPTIONS);
  const language = usePreferencesStore((state) => state.language);
  const aiModel = usePreferencesStore((state) => state.aiModel);
  const editPlan = useProjectsStore((state) => state.editPlan);
  const undoPlanEdit = useProjectsStore((state) => state.undoPlanEdit);

  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [typed, setTyped] = useState("");
  const [undoing, setUndoing] = useState(false);
  const recordingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const stopRecorder = async () => {
    stopTimer();
    if (!recordingRef.current) return;
    recordingRef.current = false;
    await recorder.stop();
    await setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
  };

  // Leaving the screen stops the microphone.
  useEffect(
    () => () => {
      stopTimer();
      if (recordingRef.current) {
        recordingRef.current = false;
        void recorder.stop().catch(() => undefined);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const apply = async (instruction: string) => {
    const heard = instruction.trim();
    if (!heard) {
      setPhase({ kind: "error", message: "I didn't catch anything. Tap the orb and try again." });
      return;
    }
    setPhase({ kind: "editing", heard });
    try {
      const result = await editPlan(projectId, { instruction: heard, model: aiModel, language: BACKEND_LANGUAGE[language] });
      if (result.changed) haptics.success();
      setPhase({ kind: "done", heard, summary: result.summary, changed: result.changed_sections });
    } catch (error) {
      haptics.error();
      setPhase({ kind: "error", message: describeApiError(error) });
    }
  };

  const finishRecording = async () => {
    setPhase({ kind: "transcribing" });
    try {
      await stopRecorder();
      const uri = recorder.uri;
      if (!uri) throw new Error("No recording");
      const text = await boardsApi.transcribe({ uri }, BACKEND_LANGUAGE[language]);
      await apply(text);
    } catch (error) {
      setPhase({
        kind: "error",
        message: error instanceof Error && error.message === "No recording" ? "Nothing was recorded. Try again." : describeApiError(error),
      });
    }
  };

  const startRecording = async () => {
    if (useConversationStore.getState().phase === "listening") {
      setPhase({ kind: "error", message: "Veya is listening on the Talk tab. Stop that first." });
      return;
    }
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) {
      setPhase({ kind: "typing" });
      return;
    }
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      recordingRef.current = true;
      haptics.light();
      setPhase({ kind: "recording" });
    } catch {
      setPhase({ kind: "error", message: "Couldn't start the microphone. Try again, or type instead." });
      return;
    }

    // Stop by itself when the student stops talking.
    const detector = new VoiceActivityDetector({ maxRecordingMs: 45_000 });
    timerRef.current = setInterval(() => {
      if (!recordingRef.current) return stopTimer();
      let level: number | undefined;
      try {
        level = recorder.getStatus().metering;
      } catch {
        level = undefined;
      }
      const activity = detector.update(level, Date.now());
      if (activity === "endOfSpeech" || activity === "tooLong") {
        stopTimer();
        void finishRecording();
      } else if (activity === "noSpeech") {
        stopTimer();
        void stopRecorder()
          .catch(() => undefined)
          .finally(() => setPhase({ kind: "error", message: "I didn't hear anything. Tap the orb and say what to change." }));
      }
    }, VAD_INTERVAL_MS);
  };

  const onOrb = () => {
    haptics.selection();
    if (phase.kind === "recording") void finishRecording();
    else if (phase.kind === "transcribing" || phase.kind === "editing") return;
    else void startRecording();
  };

  const typeInstead = () => {
    void stopRecorder().catch(() => undefined);
    setTyped("");
    setPhase({ kind: "typing" });
  };

  const close = () => {
    void stopRecorder().catch(() => undefined);
    setPhase({ kind: "idle" });
  };

  const undo = async () => {
    setUndoing(true);
    try {
      await undoPlanEdit(projectId);
      haptics.success();
      setPhase({ kind: "idle" });
    } catch (error) {
      setPhase({ kind: "error", message: describeApiError(error) });
    } finally {
      setUndoing(false);
    }
  };

  const busy = phase.kind === "transcribing" || phase.kind === "editing";
  const showPanel = phase.kind !== "idle";

  return (
    <View style={[styles.wrap, { bottom: insets.bottom + spacing[4] }]} pointerEvents="box-none">
      {showPanel ? (
        <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)} style={styles.panel} accessibilityLiveRegion="polite">
          <View style={styles.panelHeader}>
            <AppText variant="eyebrow" tone="accent" style={styles.flex}>
              Change this plan
            </AppText>
            {busy ? null : <IconButton icon="close" variant="plain" size={30} accessibilityLabel="Close" onPress={close} />}
          </View>
          <View style={styles.note}>
            <Icon name="document" size={13} color={colors.text.muted} />
            <AppText variant="caption" tone="secondary" style={styles.flex}>
              Only the README changes (and the Implementation section, which comes from it). Veya&apos;s plan, the workflow, the image and your tasks stay as they are.
            </AppText>
          </View>

          {phase.kind === "recording" ? (
            <>
              <AppText variant="bodyMedium">Listening… say what to change.</AppText>
              <AppText variant="caption" tone="muted">
                For example: “use Firebase instead of PostgreSQL”, “add a dark mode”, or “we only have one week now”.
              </AppText>
              <View style={styles.row}>
                <Button label="Done" size="small" icon="check" iconPosition="left" onPress={() => void finishRecording()} style={styles.flex} />
                <Button label="Type instead" size="small" variant="ghost" onPress={typeInstead} />
              </View>
            </>
          ) : null}

          {phase.kind === "typing" ? (
            <>
              <TextField
                label="What should change?"
                placeholder="e.g. Use Firebase instead of PostgreSQL"
                value={typed}
                onChangeText={setTyped}
                multiline
                autoFocus
              />
              <Button label="Change the plan" size="small" icon="check" iconPosition="left" disabled={!typed.trim()} onPress={() => void apply(typed)} />
            </>
          ) : null}

          {phase.kind === "transcribing" ? (
            <View style={styles.row}>
              <ActivityIndicator size="small" color={colors.text.secondary} />
              <AppText variant="bodySmall" tone="secondary">
                Listening back…
              </AppText>
            </View>
          ) : null}

          {phase.kind === "editing" ? (
            <>
              <AppText variant="bodySmall" tone="secondary">
                You said: “{phase.heard}”
              </AppText>
              <View style={styles.row}>
                <ActivityIndicator size="small" color={colors.text.secondary} />
                <AppText variant="bodySmall" tone="secondary" style={styles.flex}>
                  {aiModel === "qwen" ? "Updating your plan… (Qwen can take 2–3 minutes)" : "Updating your plan… (a few seconds)"}
                </AppText>
              </View>
            </>
          ) : null}

          {phase.kind === "done" ? (
            <>
              <AppText variant="caption" tone="muted">
                You said: “{phase.heard}”
              </AppText>
              <AppText variant="bodyMedium">{phase.summary}</AppText>
              {phase.changed.length ? (
                <AppText variant="caption" tone="success">
                  Updated: {phase.changed.join(", ")}
                </AppText>
              ) : null}
              <View style={styles.row}>
                {phase.changed.length && canUndo ? (
                  <Button label="Undo" size="small" variant="secondary" icon="retry" iconPosition="left" loading={undoing} onPress={() => void undo()} />
                ) : null}
                <Button label="Change something else" size="small" variant="ghost" onPress={() => void startRecording()} style={styles.flex} />
              </View>
            </>
          ) : null}

          {phase.kind === "error" ? (
            <>
              <AppText variant="bodySmall" tone="error" accessibilityRole="alert">
                {phase.message}
              </AppText>
              <View style={styles.row}>
                <Button label="Try again" size="small" variant="secondary" icon="mic" iconPosition="left" onPress={() => void startRecording()} />
                <Button label="Type instead" size="small" variant="ghost" onPress={typeInstead} />
              </View>
            </>
          ) : null}
        </Animated.View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={phase.kind === "recording" ? "Stop and change the plan" : "Change this plan by voice"}
        accessibilityHint="Say what to change, and Veya updates the README"
        onPress={onOrb}
        onLongPress={typeInstead}
        disabled={busy}
        style={styles.orbButton}
      >
        <SlimeOrb size={ORB_SIZE} live={phase.kind === "recording"} hideWave />
        {busy ? (
          <View style={styles.orbSpinner} pointerEvents="none">
            <ActivityIndicator size="small" color={colors.text.primary} />
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: spacing[4], right: spacing[4], alignItems: "flex-end", gap: spacing[3] },
  flex: { flex: 1 },
  panel: {
    alignSelf: "stretch",
    gap: spacing[2],
    padding: spacing[4],
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: HAIRLINE,
    backgroundColor: themed("rgba(15, 14, 23, 0.97)"),
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  panelHeader: { flexDirection: "row", alignItems: "center", minHeight: 30 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing[2] },
  note: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing[2],
    padding: spacing[2],
    borderRadius: radii.md,
    backgroundColor: colors.overlay.lavenderSoft,
  },
  orbButton: { width: ORB_SIZE + 12, height: ORB_SIZE + 12, alignItems: "center", justifyContent: "center" },
  orbSpinner: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" },
});
