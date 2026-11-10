import { useIsFocused } from "expo-router";
import { useEffect, useState } from "react";
import { Keyboard, StyleSheet, View, useWindowDimensions } from "react-native";
import Animated, { useAnimatedReaction, useAnimatedScrollHandler, useSharedValue } from "react-native-reanimated";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";

import { ChatPanel } from "@/components/chat/ChatPanel";
import { AuroraBackground } from "@/components/talk/AuroraBackground";
import { MODE_INDICATOR_HEIGHT, ModeIndicator } from "@/components/talk/ModeIndicator";
import { VoicePanel } from "@/components/talk/VoicePanel";
import { haptics } from "@/lib/haptics";
import { useListeningStore } from "@/stores/listeningStore";

/**
 * Talk tab: voice and text chat side by side, switched only by swiping
 * (left for chat, right for voice). Voice and chat are separate conversations.
 */
export default function TalkScreen() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const scrollX = useSharedValue(0);
  const [page, setPage] = useState(0);
  // Pages in a horizontal ScrollView don't stretch vertically by themselves. Without an
  // explicit height the chat list grows to fit every message and can't scroll.
  const [pagerHeight, setPagerHeight] = useState(0);
  const focused = useIsFocused();
  const setVoicePageVisible = useListeningStore((state) => state.setVoicePageVisible);

  // The voice page shows its own listening animation; everywhere else gets the edge glow.
  useEffect(() => {
    setVoicePageVisible(focused && page === 0);
    return () => setVoicePageVisible(false);
  }, [focused, page, setVoicePageVisible]);

  const onScroll = useAnimatedScrollHandler((event) => {
    scrollX.set(event.contentOffset.x);
  });

  const handlePageChange = (next: number) => {
    setPage(next);
    haptics.selection();
    // Leaving chat: put the keyboard away so voice is unobstructed.
    if (next === 0) Keyboard.dismiss();
  };

  useAnimatedReaction(
    () => (width > 0 ? Math.round(scrollX.get() / width) : 0),
    (next, previous) => {
      if (previous !== null && next !== previous) scheduleOnRN(handlePageChange, next);
    },
    [width],
  );

  return (
    <View style={styles.root}>
      <AuroraBackground width={width} height={height} />
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <ModeIndicator scrollX={scrollX} width={width} />
        <Animated.ScrollView
          horizontal
          pagingEnabled
          bounces={false}
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          scrollEventThrottle={16}
          onScroll={onScroll}
          style={styles.pager}
          onLayout={(event) => setPagerHeight(event.nativeEvent.layout.height)}
          accessibilityLabel={page === 0 ? "Voice. Swipe left for chat." : "Chat. Swipe right for voice."}
        >
          <View style={{ width, height: pagerHeight || undefined }}>
            <VoicePanel />
          </View>
          <View style={{ width, height: pagerHeight || undefined }}>
            {/* The panel starts below the safe area and the indicator. */}
            <ChatPanel keyboardOffset={insets.top + MODE_INDICATOR_HEIGHT} />
          </View>
        </Animated.ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  pager: { flex: 1 },
});
