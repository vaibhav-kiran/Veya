/**
 * Imperative voice controls. The audio hardware is owned by a single
 * <VoiceConversationController /> mounted in the app layout; screens call
 * these functions instead of creating their own recorders or players.
 */
export type VoiceControls = {
  /** Ask for mic permission and start recording an answer. */
  startRecording: () => Promise<void>;
  /** Stop recording and send the answer to Veya. */
  stopAndSend: () => Promise<void>;
  /** Stop recording and throw the audio away. */
  discardRecording: () => Promise<void>;
  /** Interrupt Veya's reply; the conversation continues as if it had finished. */
  stopSpeaking: () => void;
};

const noop = async () => undefined;

let controls: VoiceControls = {
  startRecording: noop,
  stopAndSend: noop,
  discardRecording: noop,
  stopSpeaking: () => undefined,
};

export function registerVoiceControls(next: VoiceControls): () => void {
  controls = next;
  return () => {
    if (controls === next) controls = { startRecording: noop, stopAndSend: noop, discardRecording: noop, stopSpeaking: () => undefined };
  };
}

export const voiceControls: VoiceControls = {
  startRecording: () => controls.startRecording(),
  stopAndSend: () => controls.stopAndSend(),
  discardRecording: () => controls.discardRecording(),
  stopSpeaking: () => controls.stopSpeaking(),
};
