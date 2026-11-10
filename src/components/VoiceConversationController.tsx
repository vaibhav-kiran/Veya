import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  type RecordingOptions,
} from "expo-audio";
import { useEffect, useRef } from "react";
import { AppState } from "react-native";

import { latestReplyAudioSource } from "@/lib/api/conversation";
import { VoiceActivityDetector } from "@/lib/voiceActivity";
import { registerVoiceControls } from "@/lib/voiceControls";
import { useConversationStore } from "@/stores/conversationStore";
import { useListeningStore } from "@/stores/listeningStore";

/**
 * Mono is plenty for speech; the backend converts to 16 kHz WAV with ffmpeg.
 * Metering gives the live input level used to detect when the user stops talking.
 */
const RECORDING_OPTIONS: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  numberOfChannels: 1,
  bitRate: 64000,
  isMeteringEnabled: true,
};

/** How often the input level is checked while listening. */
const VAD_INTERVAL_MS = 50;
/** Pause after Veya stops speaking before the mic opens, so the tail of her voice isn't recorded. */
const AUTO_LISTEN_DELAY_MS = 150;

/** Shorter recordings are almost always accidental taps. */
const MIN_RECORDING_MS = 600;
/** If a reply hasn't started playing by now, show it as text and move on. */
const PLAYBACK_START_TIMEOUT_MS = 15_000;

const PLAYBACK_FAILED = "Voice playback failed, so the reply is shown as text.";

/**
 * Owns the microphone and speaker for the Veya conversation. Rendered once
 * in the app layout (renders nothing), so Veya keeps talking and listening
 * on every tab. Screens drive it through `voiceControls`.
 */
export function VoiceConversationController() {
  const recorder = useAudioRecorder(RECORDING_OPTIONS);
  const player = useAudioPlayer(null);
  const playerStatus = useAudioPlayerStatus(player);

  const speechId = useConversationStore((state) => state.speechId);
  const sessionId = useConversationStore((state) => state.sessionId);
  const phase = useConversationStore((state) => state.phase);
  const handsFree = useConversationStore((state) => state.handsFree);
  const listening = useListeningStore((state) => state.listening);
  const voicePageVisible = useListeningStore((state) => state.voicePageVisible);

  const recordingRef = useRef(false);
  const stoppingRef = useRef(false);
  const startedAtRef = useRef(0);
  const playingSpeechRef = useRef<number | null>(null);
  const startedPlayingRef = useRef(false);
  const vadTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** Starts recording; `auto` = opened by hands-free mode rather than a tap. */
  const beginRecordingRef = useRef<(auto: boolean) => Promise<void>>(async () => undefined);

  const stopVoiceDetection = () => {
    if (vadTimerRef.current !== null) clearInterval(vadTimerRef.current);
    vadTimerRef.current = null;
  };

  // ---- recording -------------------------------------------------------

  useEffect(() => {
    const conversation = () => useConversationStore.getState();

    const stopRecorder = async (): Promise<string | null> => {
      stopVoiceDetection();
      stoppingRef.current = true;
      try {
        await recorder.stop();
        return recorder.uri;
      } finally {
        recordingRef.current = false;
        stoppingRef.current = false;
        useListeningStore.getState().stopListening();
        await setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
      }
    };

    const stopAndSend = async () => {
      if (!recordingRef.current || stoppingRef.current) return;
      const duration = Date.now() - startedAtRef.current;
      let uri: string | null = null;
      try {
        uri = await stopRecorder();
      } catch {
        conversation().reportVoiceError("The recording failed. Please try again, or type your answer.");
        return;
      }
      if (!uri || duration < MIN_RECORDING_MS) {
        conversation().reportVoiceError("That recording was too short. Tap the orb and speak your answer.");
        return;
      }
      await conversation().sendRecording({ uri });
    };

    /** Watch the input level: send when the user stops talking, give up if nobody talks. */
    const startVoiceDetection = () => {
      stopVoiceDetection();
      const detector = new VoiceActivityDetector();
      vadTimerRef.current = setInterval(() => {
        if (!recordingRef.current || stoppingRef.current) {
          stopVoiceDetection();
          return;
        }
        let level: number | undefined;
        try {
          level = recorder.getStatus().metering;
        } catch {
          level = undefined;
        }
        const activity = detector.update(level, Date.now());
        if (activity === "endOfSpeech" || activity === "tooLong") {
          stopVoiceDetection();
          void stopAndSend();
        } else if (activity === "noSpeech") {
          stopVoiceDetection();
          void stopRecorder()
            .catch(() => undefined)
            .finally(() => conversation().noSpeechHeard());
        }
      }, VAD_INTERVAL_MS);
    };

    const beginRecording = async (auto: boolean) => {
        if (recordingRef.current || stoppingRef.current) return;
        const state = conversation();
        // A tap means the user wants to talk: keep listening hands-free from now on.
        if (!auto) state.setHandsFree(true);
        // Never record while Veya is still speaking: stop the reply first.
        if (state.phase === "speaking") {
          player.pause();
          playingSpeechRef.current = null;
          state.speechFinished();
        }
        try {
          const permission = await requestRecordingPermissionsAsync();
          if (!permission.granted) {
            conversation().reportVoiceError(
              "Microphone access is off. Allow it in your device settings, or swipe left to type your answer.",
            );
            return;
          }
          await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
          await recorder.prepareToRecordAsync();
          recorder.record();
          recordingRef.current = true;
          startedAtRef.current = Date.now();
          conversation().setListening(true);
          useListeningStore.getState().startListening("tap");
          startVoiceDetection();
        } catch {
          recordingRef.current = false;
          stopVoiceDetection();
          useListeningStore.getState().stopListening();
          conversation().reportVoiceError("Couldn't start recording. Please try again, or type your answer.");
        }
    };

    beginRecordingRef.current = beginRecording;

    return registerVoiceControls({
      startRecording: () => beginRecording(false),

      // Tapping the orb while listening sends right away (no need to wait for the pause).
      stopAndSend,

      discardRecording: async () => {
        if (!recordingRef.current || stoppingRef.current) return;
        await stopRecorder().catch(() => undefined);
        conversation().setHandsFree(false);
        conversation().setListening(false);
      },

      stopSpeaking: () => {
        player.pause();
        playingSpeechRef.current = null;
        if (conversation().phase === "speaking") conversation().speechFinished();
      },
    });
  }, [player, recorder]);

  // Edge-glow tap (or anything else) ended "listening": send what was said.
  useEffect(() => {
    if (!listening && recordingRef.current && !stoppingRef.current) {
      const duration = Date.now() - startedAtRef.current;
      stopVoiceDetection();
      stoppingRef.current = true;
      void (async () => {
        try {
          await recorder.stop();
        } finally {
          recordingRef.current = false;
          stoppingRef.current = false;
          await setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
        }
        const uri = recorder.uri;
        const store = useConversationStore.getState();
        if (!uri || duration < MIN_RECORDING_MS) {
          store.setListening(false);
          return;
        }
        await store.sendRecording({ uri });
      })();
    }
  }, [listening, recorder]);

  // Cancel / new conversation while recording: throw the audio away.
  useEffect(() => {
    if (phase !== "listening" && recordingRef.current && !stoppingRef.current) {
      stopVoiceDetection();
      stoppingRef.current = true;
      void recorder
        .stop()
        .catch(() => undefined)
        .finally(() => {
          recordingRef.current = false;
          stoppingRef.current = false;
          useListeningStore.getState().stopListening();
        });
    }
  }, [phase, recorder]);

  // Going to the background mid-recording: stop and discard rather than send half an answer.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      if (next !== "active" && recordingRef.current && !stoppingRef.current) {
        stopVoiceDetection();
        stoppingRef.current = true;
        void recorder
          .stop()
          .catch(() => undefined)
          .finally(() => {
            recordingRef.current = false;
            stoppingRef.current = false;
            useListeningStore.getState().stopListening();
            useConversationStore.getState().reportVoiceError("Recording stopped when the app left the screen. Tap the orb to answer again.");
          });
      }
    });
    return () => subscription.remove();
  }, [recorder]);

  // Hands-free: whenever it's the user's turn on the voice page, start listening by itself.
  useEffect(() => {
    const usersTurn = phase === "waitingForUser" || phase === "awaitingConfirmation";
    if (!handsFree || !voicePageVisible || !usersTurn || !sessionId) return;
    const timer = setTimeout(() => {
      const state = useConversationStore.getState();
      const stillUsersTurn = state.phase === "waitingForUser" || state.phase === "awaitingConfirmation";
      if (state.handsFree && stillUsersTurn && !recordingRef.current && !stoppingRef.current) {
        void beginRecordingRef.current(true);
      }
    }, AUTO_LISTEN_DELAY_MS);
    return () => clearTimeout(timer);
  }, [handsFree, phase, sessionId, voicePageVisible]);

  // Never leave the level timer running after unmount.
  useEffect(() => () => stopVoiceDetection(), []);

  // ---- playback --------------------------------------------------------

  useEffect(() => {
    if (speechId === null) {
      // Interrupted (cancel, typed answer, new conversation).
      if (playingSpeechRef.current !== null) {
        player.pause();
        playingSpeechRef.current = null;
      }
      return;
    }
    if (!sessionId) return;

    playingSpeechRef.current = speechId;
    startedPlayingRef.current = false;
    let cancelled = false;

    void (async () => {
      try {
        await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
        if (cancelled) return;
        player.replace(latestReplyAudioSource(sessionId));
        player.play();
      } catch {
        if (cancelled) return;
        playingSpeechRef.current = null;
        useConversationStore.setState({ notice: PLAYBACK_FAILED });
        useConversationStore.getState().speechFinished();
      }
    })();

    const timer = setTimeout(() => {
      if (cancelled || startedPlayingRef.current || playingSpeechRef.current !== speechId) return;
      player.pause();
      playingSpeechRef.current = null;
      useConversationStore.setState({ notice: PLAYBACK_FAILED });
      useConversationStore.getState().speechFinished();
    }, PLAYBACK_START_TIMEOUT_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [player, sessionId, speechId]);

  useEffect(() => {
    const current = playingSpeechRef.current;
    if (current === null) return;
    if (playerStatus.playing) startedPlayingRef.current = true;

    const failed = Boolean(playerStatus.error);
    // Only a finish seen after this reply started playing counts (not a stale one from the previous reply).
    if ((playerStatus.didJustFinish && startedPlayingRef.current) || failed) {
      playingSpeechRef.current = null;
      if (failed) useConversationStore.setState({ notice: PLAYBACK_FAILED });
      if (useConversationStore.getState().speechId === current) useConversationStore.getState().speechFinished();
    }
  }, [playerStatus.didJustFinish, playerStatus.error, playerStatus.playing]);

  return null;
}
