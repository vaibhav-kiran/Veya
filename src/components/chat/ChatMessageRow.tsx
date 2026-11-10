import { Pressable, StyleSheet, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import { colors, fontFamilies, radii, spacing, themed } from "@/theme";
import type { ChatMessage } from "@/types/models";

import { AppText } from "../AppText";
import { Icon, type IconName } from "../Icon";
import { VeyaAvatar } from "./VeyaAvatar";

type ChatMessageRowProps = {
  message: ChatMessage;
  onRetry: () => void;
  onSaveAsIdea: () => void;
  onOpenIdea: (ideaId: string) => void;
  onOpenProject: (projectId: string) => void;
};

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

function ActionChip({ label, icon, onPress }: { label: string; icon: IconName; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
    >
      <Icon name={icon} size={12} color={colors.veya.lavender} />
      <AppText style={styles.chipLabel}>{label}</AppText>
    </Pressable>
  );
}

/** Your messages: violet gradient bubbles on the right. Veya: frosted glass on the left. */
export function ChatMessageRow({ message, onRetry, onSaveAsIdea, onOpenIdea, onOpenProject }: ChatMessageRowProps) {
  if (message.role === "veya") {
    return (
      <Animated.View entering={FadeInDown.duration(260)} style={styles.veyaRow}>
        <VeyaAvatar />
        <View style={styles.veyaColumn}>
          <View style={styles.veyaBubble}>
            <AppText variant="bodyLarge" selectable>
              {message.text}
            </AppText>
          </View>
          {message.projectId ? (
            <View style={styles.actions}>
              <ActionChip label="Open project" icon="arrowRight" onPress={() => message.projectId && onOpenProject(message.projectId)} />
            </View>
          ) : null}
          <AppText style={styles.time}>{timeOf(message.createdAt)}</AppText>
        </View>
      </Animated.View>
    );
  }

  const failed = message.status === "failed";
  return (
    <Animated.View entering={FadeInDown.duration(260)} style={styles.userRow}>
      <Pressable
        accessibilityRole="text"
        accessibilityLabel={`You said: ${message.text}`}
        accessibilityHint={message.savedIdeaId ? undefined : "Long press to save as an idea"}
        onLongPress={message.savedIdeaId ? undefined : onSaveAsIdea}
        style={[styles.userBubble, failed && styles.userBubbleFailed]}
      >
        <AppText variant="bodyLarge" selectable style={styles.userText}>
          {message.text}
        </AppText>
      </Pressable>

      <View style={styles.metaRow}>
        {failed ? <Icon name="warning" size={11} color={colors.semantic.error} /> : null}
        <AppText style={[styles.time, failed && styles.timeFailed]}>
          {message.status === "sending" ? "Sending…" : failed ? "Not delivered" : timeOf(message.createdAt)}
        </AppText>
      </View>

      {failed && message.error ? (
        <AppText variant="bodySmall" tone="secondary" style={styles.error} accessibilityRole="alert">
          {message.error}
        </AppText>
      ) : null}

      {message.status !== "sending" ? (
        <View style={styles.actions}>
          {failed ? <ActionChip label="Retry" icon="retry" onPress={onRetry} /> : null}
          {message.savedIdeaId ? (
            <ActionChip label="Saved · View idea" icon="arrowRight" onPress={() => message.savedIdeaId && onOpenIdea(message.savedIdeaId)} />
          ) : (
            <ActionChip label="Save as idea" icon="save" onPress={onSaveAsIdea} />
          )}
        </View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  veyaRow: { flexDirection: "row", alignItems: "flex-end", gap: spacing[2], paddingRight: spacing[8] },
  veyaColumn: { flexShrink: 1, gap: 4 },
  veyaBubble: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    borderRadius: radii.xl - 4,
    borderBottomLeftRadius: 6,
    borderWidth: 1,
    borderColor: themed("rgba(196, 181, 253, 0.18)"),
    backgroundColor: themed("rgba(24, 21, 40, 0.88)"),
    boxShadow: "0px 6px 18px rgba(0, 0, 0, 0.35)",
  },
  userRow: { alignItems: "flex-end", gap: 4, paddingLeft: spacing[10] },
  userBubble: {
    maxWidth: "100%",
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    borderRadius: radii.xl - 4,
    borderBottomRightRadius: 6,
    borderWidth: 1,
    borderColor: themed("rgba(237, 233, 254, 0.25)"),
    backgroundImage: themed("linear-gradient(135deg, #8B5CF6 0%, #6D28D9 60%, #5B21B6 100%)"),
    boxShadow: themed("0px 8px 22px rgba(124, 58, 237, 0.4)"),
  },
  userBubbleFailed: { borderColor: "rgba(255, 77, 79, 0.65)" },
  userText: { color: colors.text.primary },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  time: { fontFamily: fontFamilies.regular, fontSize: 11, lineHeight: 14, color: colors.text.muted },
  timeFailed: { color: colors.semantic.error },
  error: { textAlign: "right" },
  actions: { flexDirection: "row", gap: spacing[2], marginTop: 2 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    minHeight: 28,
    paddingHorizontal: spacing[3],
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: themed("rgba(196, 181, 253, 0.25)"),
    backgroundColor: themed("rgba(124, 58, 237, 0.12)"),
  },
  chipPressed: { opacity: 0.6 },
  chipLabel: { fontFamily: fontFamilies.medium, fontSize: 12, lineHeight: 16, color: colors.veya.lavender },
});
