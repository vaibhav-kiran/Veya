import { Easing, FadeIn, Keyframe, ReduceMotion } from "react-native-reanimated";

/**
 * Calm motion for content that appears on a screen (new results, a tab's
 * content): short fades with a small rise, no bouncing. Nothing moves under
 * the finger, and screens themselves open without any transition.
 * Everything follows the phone's "Reduce motion" setting.
 */
export const EASE_OUT = Easing.bezier(0.22, 1, 0.36, 1);

/** New content: fades in while rising 8 px. */
export const enterSoft = new Keyframe({
  0: { opacity: 0, transform: [{ translateY: 8 }] },
  100: { opacity: 1, transform: [{ translateY: 0 }], easing: EASE_OUT },
})
  .duration(260)
  .reduceMotion(ReduceMotion.System);

/** Switching what's shown in the same place (tabs, a changing line of text). */
export const fadeSoft = FadeIn.duration(180).reduceMotion(ReduceMotion.System);

