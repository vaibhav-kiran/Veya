import { FlatList, Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import Animated, { FadeIn, FadeOut, SlideInLeft, SlideOutLeft } from "react-native-reanimated";

import { haptics } from "@/lib/haptics";
import type { ArchivedChat } from "@/stores/chatStore";
import { colors, fontFamilies, radii, spacing, themed } from "@/theme";
import { formatRelativeDay } from "@/utils/date";

import { AppText } from "../AppText";
import { Button } from "../Button";
import { Icon } from "../Icon";
import { IconButton } from "../IconButton";

type ChatHistoryDrawerProps = {
  history: ArchivedChat[];
  activeId: string | null;
  onNewChat: () => void;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
};

/** Side panel with past chats. Slides in from the left over the chat. */
export function ChatHistoryDrawer({ history, activeId, onNewChat, onOpen, onDelete, onClose }: ChatHistoryDrawerProps) {
  const { width } = useWindowDimensions();
  const panelWidth = Math.min(width * 0.82, 340);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(150)} style={StyleSheet.absoluteFill}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close chat history" onPress={onClose} style={styles.scrim} />
      </Animated.View>

      <Animated.View
        entering={SlideInLeft.duration(240)}
        exiting={SlideOutLeft.duration(200)}
        style={[styles.panel, { width: panelWidth }]}
        accessibilityViewIsModal
      >
        <View style={styles.header}>
          <AppText variant="h3" accessibilityRole="header">
            Chat history
          </AppText>
          <IconButton icon="close" variant="plain" size={36} accessibilityLabel="Close chat history" onPress={onClose} />
        </View>

        <Button label="New chat" icon="plus" iconPosition="left" size="small" onPress={onNewChat} />

        <FlatList
          data={history}
          keyExtractor={(chat) => chat.id}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Icon name="chat" size={20} color={colors.text.muted} />
              <AppText variant="bodySmall" tone="secondary" align="center">
                Your past chats will appear here. Each visit starts a fresh chat.
              </AppText>
            </View>
          }
          renderItem={({ item }) => {
            const active = item.id === activeId;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${item.title}, ${formatRelativeDay(item.updatedAt)}${item.projectId ? ", created a project" : ""}`}
                accessibilityState={{ selected: active }}
                onPress={() => {
                  haptics.selection();
                  onOpen(item.id);
                }}
                style={({ pressed }) => [styles.row, active && styles.rowActive, pressed && styles.rowPressed]}
              >
                <Icon name={item.projectId ? "sparkle" : "chat"} size={14} color={item.projectId ? colors.veya.lavender : colors.text.muted} />
                <View style={styles.rowText}>
                  <AppText variant="bodyMedium" numberOfLines={2} style={styles.rowTitle}>
                    {item.title}
                  </AppText>
                  <AppText variant="caption" tone="muted">
                    {formatRelativeDay(item.updatedAt)}
                    {item.projectId ? " · Project created" : ""}
                  </AppText>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Delete chat: ${item.title}`}
                  hitSlop={8}
                  onPress={() => {
                    haptics.warning();
                    onDelete(item.id);
                  }}
                >
                  <Icon name="trash" size={14} color={colors.text.muted} />
                </Pressable>
              </Pressable>
            );
          }}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: colors.overlay.scrim },
  panel: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    gap: spacing[3],
    paddingTop: spacing[3],
    paddingHorizontal: spacing[4],
    borderTopRightRadius: radii.xl,
    borderBottomRightRadius: radii.xl,
    borderRightWidth: 1,
    borderColor: themed("rgba(196, 181, 253, 0.18)"),
    backgroundColor: colors.veya.surface,
    boxShadow: "8px 0px 30px rgba(0, 0, 0, 0.5)",
  },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  list: { flex: 1 },
  listContent: { gap: spacing[1], paddingBottom: spacing[6] },
  empty: { alignItems: "center", gap: spacing[2], paddingTop: spacing[8], paddingHorizontal: spacing[2] },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: "transparent",
  },
  rowActive: { borderColor: themed("rgba(196, 181, 253, 0.4)"), backgroundColor: themed("rgba(124, 58, 237, 0.14)") },
  rowPressed: { backgroundColor: colors.overlay.lavenderSoft },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontFamily: fontFamilies.medium },
});
