import { useEffect, useState, type RefObject } from "react";
import { StyleSheet } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { colors, fontFamilies, spacing } from "@/theme";

import { AppText } from "./AppText";
import { Icon } from "./Icon";

/** Screens that already showed their hint in this run of the app. */
const shown = new Set<string>();

const PEEK_PX = 52;
const SHOW_MS = 3200;

type Pager = { scrollTo: (options: { x: number; animated?: boolean }) => void };

/**
 * Once per app launch for each screen: the pager peeks at the next page and
 * a small "‹ Chat" tab nudges at the right edge, so it's clear there's more
 * to the left. Gone as soon as the user swipes to the next page, or after a
 * few seconds.
 */
export function useSwipeHint(key: string, pager: RefObject<Pager | null>, page: number, width: number): boolean {
  // Decided once, when the screen first appears in this run of the app.
  const [eligible] = useState(() => !shown.has(key));
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    if (!eligible || width <= 0) return;
    shown.add(key);
    // Peek at the next page and come back.
    const peek = setTimeout(() => pager.current?.scrollTo({ x: PEEK_PX, animated: true }), 650);
    const back = setTimeout(() => pager.current?.scrollTo({ x: 0, animated: true }), 1050);
    const hide = setTimeout(() => setExpired(true), SHOW_MS);
    return () => {
      clearTimeout(peek);
      clearTimeout(back);
      clearTimeout(hide);
    };
  }, [eligible, key, pager, width]);

  // Gone once the user swipes over, or after a few seconds.
  return eligible && !expired && page === 0;
}

/** The "‹ Chat" tab at the right edge, nudging left. */
export function SwipeHint({ label, visible, top = "42%" }: { label: string; visible: boolean; top?: `${number}%` | number }) {
  const nudge = useSharedValue(0);

  useEffect(() => {
    if (!visible) return;
    nudge.set(
      withRepeat(
        withSequence(withTiming(-6, { duration: 380, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: 380, easing: Easing.in(Easing.quad) })),
        3,
        false,
        undefined,
        ReduceMotion.System,
      ),
    );
  }, [visible, nudge]);

  const style = useAnimatedStyle(() => ({ transform: [{ translateX: nudge.get() }] }));

  if (!visible) return null;
  return (
    <Animated.View
      entering={FadeIn.duration(220)}
      exiting={FadeOut.duration(200)}
      pointerEvents="none"
      style={[styles.wrap, { top }]}
      accessibilityLiveRegion="polite"
      accessibilityLabel={`Swipe left for ${label}`}
    >
      <Animated.View style={[styles.tab, style]}>
        <Icon name="chevronLeft" size={13} color={colors.text.primary} />
        <AppText variant="caption" style={styles.label}>
          {label}
        </AppText>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", right: 0 },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingLeft: spacing[2],
    paddingRight: spacing[3],
    paddingVertical: spacing[2],
    borderTopLeftRadius: 999,
    borderBottomLeftRadius: 999,
    backgroundColor: colors.overlay.surfaceRaised,
    borderWidth: StyleSheet.hairlineWidth,
    borderRightWidth: 0,
    borderColor: colors.overlay.lavenderBorder,
  },
  label: { fontFamily: fontFamilies.semibold, color: colors.text.primary },
});
