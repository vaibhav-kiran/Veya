/**
 * Voice activity detection for hands-free answers.
 *
 * Fed the microphone level (dBFS, -160 = silence … 0 = max) every ~50 ms
 * while recording. It does not rely on guessing the room's background
 * level (which fails when the user talks the moment the mic opens, or in a
 * room with a fan or traffic). Instead:
 *
 * - Speech is recognised by its rise and fall: syllables make the level
 *   swing by 12+ dB within half a second; steady background noise doesn't.
 * - The answer ends when nothing has come close to the user's OWN speaking
 *   level for `endSilenceMs`. Background noise sits well below a voice
 *   close to the phone, so it counts as silence in quiet and noisy rooms.
 *
 *   waiting      -> no speech yet
 *   speaking     -> the user is talking (or paused only briefly)
 *   endOfSpeech  -> they talked, then went quiet long enough: send it
 *   noSpeech     -> nobody said anything: stop and don't send
 *   tooLong      -> hard cap reached: send what we have
 */
export type VoiceActivity = "waiting" | "speaking" | "endOfSpeech" | "noSpeech" | "tooLong";

export type VoiceActivityOptions = {
  /** Window used to recognise the start of speech. */
  onsetWindowMs: number;
  /** How much the level must swing inside that window to count as speech. */
  speechSwingDb: number;
  /** Speech peaks must be at least this loud (ignores a silent, noisy line). */
  minSpeechPeakDb: number;
  /** Levels within this distance of the user's speaking level count as talking. */
  belowSpeechDb: number;
  /** Quiet this long after talking ends the answer. */
  endSilenceMs: number;
  /** Give up if no speech starts within this time. */
  noSpeechTimeoutMs: number;
  /** Hard limit for one answer. */
  maxRecordingMs: number;
};

export const DEFAULT_VOICE_ACTIVITY_OPTIONS: VoiceActivityOptions = {
  onsetWindowMs: 500,
  speechSwingDb: 12,
  minSpeechPeakDb: -50,
  belowSpeechDb: 10,
  endSilenceMs: 1300,
  noSpeechTimeoutMs: 8000,
  maxRecordingMs: 30_000,
};

type Sample = { at: number; level: number };

export class VoiceActivityDetector {
  private readonly options: VoiceActivityOptions;
  private startedAt: number | null = null;
  private samples: Sample[] = [];
  private heardSpeech = false;
  /** Smoothed level of the user's voice. */
  private speechLevel = -160;
  private lastLoudAt = 0;

  constructor(options: Partial<VoiceActivityOptions> = {}) {
    this.options = { ...DEFAULT_VOICE_ACTIVITY_OPTIONS, ...options };
  }

  update(levelDb: number | undefined, nowMs: number): VoiceActivity {
    const options = this.options;
    if (this.startedAt === null) this.startedAt = nowMs;
    const elapsed = nowMs - this.startedAt;

    if (elapsed >= options.maxRecordingMs) return this.heardSpeech ? "tooLong" : "noSpeech";

    // No reading (metering unavailable for a moment): treat it as silence.
    const level = typeof levelDb === "number" && Number.isFinite(levelDb) ? Math.max(levelDb, -160) : -160;
    this.samples.push({ at: nowMs, level });
    const keepFrom = nowMs - options.onsetWindowMs;
    while (this.samples.length && this.samples[0].at < keepFrom) this.samples.shift();

    if (!this.heardSpeech) {
      const levels = this.samples.map((sample) => sample.level);
      const peak = Math.max(...levels);
      const low = percentile(levels, 0.25);
      const enoughData = this.samples.length >= 4;
      if (enoughData && peak >= options.minSpeechPeakDb && peak - low >= options.speechSwingDb) {
        this.heardSpeech = true;
        this.speechLevel = peak;
        this.lastLoudAt = nowMs;
        return "speaking";
      }
      return elapsed >= options.noSpeechTimeoutMs ? "noSpeech" : "waiting";
    }

    // Talking: anything near the user's own level keeps the answer going.
    if (level >= this.speechLevel - options.belowSpeechDb) {
      this.lastLoudAt = nowMs;
      // Follow the voice (louder or softer) without being pulled down by pauses.
      this.speechLevel = this.speechLevel * 0.85 + level * 0.15;
    }
    return nowMs - this.lastLoudAt >= options.endSilenceMs ? "endOfSpeech" : "speaking";
  }
}

function percentile(values: number[], fraction: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))];
}
