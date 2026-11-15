import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from "expo-audio";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { BACKEND_LANGUAGE } from "@/constants/languages";
import { haptics } from "@/lib/haptics";
import { boardsApi, describeApiError } from "@/lib/veyaApi";
import { useConversationStore } from "@/stores/conversationStore";
import { usePreferencesStore } from "@/stores/preferencesStore";
import { spacing } from "@/theme";

import { AppText } from "../AppText";
import { Button } from "../Button";

type VoiceInputButtonProps = {
  /** Called with what the user said. */
  onText: (text: string) => void;
  label?: string;
};

/** Tap to talk, tap again to stop: the speech becomes text (Gnani speech-to-text, in the user's language). */
export function VoiceInputButton({ onText, label = "Tap and speak" }: VoiceInputButtonProps) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const language = usePreferencesStore((state) => state.language);
  const [state, setState] = useState<"idle" | "recording" | "transcribing">("idle");
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setError(null);
    // The voice conversation owns the microphone while it's listening.
    if (useConversationStore.getState().phase === "listening") {
      setError("Veya is listening on the Talk tab. Stop that first.");
      return;
    }
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) {
      setError("Microphone access is off. Allow it in your settings, or type instead.");
      return;
    }
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      haptics.light();
      setState("recording");
    } catch {
      setError("Couldn't start recording. Please try again, or type instead.");
    }
  };

  const stop = async () => {
    setState("transcribing");
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
      const uri = recorder.uri;
      if (!uri) throw new Error("No recording");
      const text = await boardsApi.transcribe({ uri }, BACKEND_LANGUAGE[language]);
      haptics.success();
      onText(text);
    } catch (problem) {
      setError(problem instanceof Error && problem.message === "No recording" ? "Nothing was recorded. Try again." : describeApiError(problem));
    } finally {
      setState("idle");
    }
  };

  return (
    <View style={styles.wrap}>
      <Button
        label={state === "recording" ? "Stop and use this" : state === "transcribing" ? "Listening back…" : label}
        icon={state === "recording" ? "stop" : "mic"}
        iconPosition="left"
        variant={state === "recording" ? "destructive" : "secondary"}
        loading={state === "transcribing"}
        onPress={() => void (state === "recording" ? stop() : start())}
        disabled={state === "transcribing"}
      />
      {state === "recording" ? (
        <AppText variant="caption" tone="secondary" align="center" accessibilityLiveRegion="polite">
          Recording… tap again when you&apos;re done.
        </AppText>
      ) : null}
      {error ? (
        <AppText variant="caption" tone="error" align="center" accessibilityRole="alert">
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing[2] },
});
