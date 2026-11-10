import { useEffect } from "react";
import {
  Easing,
  cancelAnimation,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

/**
 * 0 → 1 entrance progress that plays each time a page becomes active and
 * resets when it leaves, so revisiting a page replays its scene.
 */
export function useEntrance(active: boolean, duration = 1700, delay = 120): SharedValue<number> {
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    if (reduceMotion) {
      progress.set(1);
      return;
    }
    if (active) {
      progress.set(withDelay(delay, withTiming(1, { duration, easing: Easing.out(Easing.cubic) })));
    } else {
      cancelAnimation(progress);
      progress.set(0);
    }
  }, [active, delay, duration, progress, reduceMotion]);

  return progress;
}

/**
 * Continuous 0 → 1 loop for ambient motion. Runs only while the page is
 * active (saves battery) and never when the user prefers reduced motion.
 * `mirror` ping-pongs with easing, for breathing/floating effects.
 */
export function useLoop(duration: number, active: boolean, mirror = false): SharedValue<number> {
  const reduceMotion = useReducedMotion();
  const time = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion || !active) {
      cancelAnimation(time);
      return;
    }
    time.set(0);
    time.set(
      withRepeat(withTiming(1, { duration, easing: mirror ? Easing.inOut(Easing.sin) : Easing.linear }), -1, mirror),
    );
    return () => cancelAnimation(time);
  }, [active, duration, mirror, reduceMotion, time]);

  return time;
}

/** Maps overall entrance progress onto a 0..1 window, for staggering elements. */
export function stagger(progress: number, start: number, span = 0.35): number {
  "worklet";
  return Math.min(1, Math.max(0, (progress - start) / span));
}

export const TAU = Math.PI * 2;
