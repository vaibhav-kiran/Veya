import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import { FlatList, KeyboardAvoidingView, Pressable, StyleSheet, View, type FlatList as FlatListType } from "react-native";

import { haptics } from "@/lib/haptics";
import { isAwaitingConfirmation, isChatBusy, useChatStore } from "@/stores/chatStore";
import { usePreferencesStore } from "@/stores/preferencesStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { colors, fontFamilies, radii, screenGutter, spacing, themed } from "@/theme";
import type { ChatMessage } from "@/types/models";
import { formatRelativeDay } from "@/utils/date";

import { AppText } from "../AppText";
import { Icon, type IconName } from "../Icon";
import { SlimeOrb } from "../SlimeOrb";
import { Button } from "../Button";
import { IconButton } from "../IconButton";
import { ChatComposer } from "./ChatComposer";
import { ChatHistoryDrawer } from "./ChatHistoryDrawer";
import { ChatMessageRow } from "./ChatMessageRow";
import { TypingIndicator } from "./TypingIndicator";

const TITLE_LIMIT = 60;

const STARTERS: { icon: IconName; text: string }[] = [
  { icon: "rocket", text: "I have a hackathon idea..." },
  { icon: "idea", text: "Help me explore an idea." },
  { icon: "build", text: "I want to build something new." },
];

function titleFrom(text: string): string {
  const firstLine = text.split("\n")[0].trim();
  return firstLine.length > TITLE_LIMIT ? `${firstLine.slice(0, TITLE_LIMIT - 1).trimEnd()}…` : firstLine;
}

function EmptyChat({ onPick }: { onPick: (text: string) => void }) {
  return (
    <View style={styles.empty}>
      <SlimeOrb size={112} />
      <AppText variant="h2" align="center" style={styles.emptyTitle}>
        Type it out.
      </AppText>
      <AppText variant="bodyMedium" tone="secondary" align="center" style={styles.emptyBody}>
        Describe your idea in your own words. Veya asks whatever it needs to know, one question at a time, then builds your project plan.
      </AppText>
      <View style={styles.starters}>
        {STARTERS.map((starter) => (
          <Pressable
            key={starter.text}
            accessibilityRole="button"
            accessibilityLabel={`Use prompt: ${starter.text}`}
            onPress={() => {
              haptics.selection();
              onPick(starter.text);
            }}
            style={({ pressed }) => [styles.starter, pressed && styles.starterPressed]}
          >
            <View style={styles.starterIcon}>
              <Icon name={starter.icon} size={16} color={colors.veya.lavender} />
            </View>
            <AppText style={styles.starterText} numberOfLines={1}>
              {starter.text}
            </AppText>
            <Icon name="arrowUp" size={14} color={colors.text.muted} style={styles.starterArrow} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

type ChatPanelProps = {
  /** Distance from the top of the screen to this panel, for keyboard avoidance. */
  keyboardOffset: number;
};

/**
 * Text side of the Talk tab — its own chat with Veya (separate from voice).
 * The model asks the questions it needs, then builds the project.
 */
export function ChatPanel({ keyboardOffset }: ChatPanelProps) {
  const router = useRouter();
  const messages = useChatStore((state) => state.messages);
  const error = useChatStore((state) => state.error);
  const busy = useChatStore(isChatBusy);
  const sending = useChatStore((state) => state.sending);
  const generating = useChatStore((state) => state.generating);
  const awaitingConfirmation = useChatStore(isAwaitingConfirmation);
  const completed = useChatStore((state) => state.serverStatus === "completed");
  const send = useChatStore((state) => state.send);
  const retry = useChatStore((state) => state.retry);
  const confirm = useChatStore((state) => state.confirm);
  const cancel = useChatStore((state) => state.cancel);
  const dismissError = useChatStore((state) => state.dismissError);
  const startNewChat = useChatStore((state) => state.startNewChat);
  const markSavedAsIdea = useChatStore((state) => state.markSavedAsIdea);
  const history = useChatStore((state) => state.history);
  const viewingId = useChatStore((state) => state.viewingId);
  const viewHistory = useChatStore((state) => state.viewHistory);
  const deleteHistory = useChatStore((state) => state.deleteHistory);
  const responseLanguage = usePreferencesStore((state) => state.languages.response);
  const addIdea = useWorkspaceStore((state) => state.addIdea);

  const listRef = useRef<FlatListType<ChatMessage>>(null);
  const [text, setText] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  // Reading a past chat from the history panel (read-only).
  const viewing = viewingId ? history.find((chat) => chat.id === viewingId) : undefined;
  const shownMessages = viewing ? viewing.messages : messages;
  // Veya is thinking or building: show the typing dots and hold new messages.
  const isSending = sending || generating;
  const canSend = text.trim().length > 0 && !busy;

  // A regular (non-inverted) list that follows the newest message. Inverted
  // lists rely on flipping content, which some platforms (e.g. web) don't
  // undo for every element, leaving parts of the chat upside down.
  const scrollToLatest = () => listRef.current?.scrollToEnd({ animated: true });

  const submit = () => {
    if (!canSend) return;
    const value = text;
    setText("");
    void send(value, responseLanguage);
  };

  const saveAsIdea = (message: ChatMessage) => {
    const ideaId = addIdea({
      title: titleFrom(message.text),
      description: message.text,
      problem: "",
      solution: "",
      targetUsers: "",
      openQuestions: "",
    });
    markSavedAsIdea(message.id, ideaId);
    haptics.success();
  };

  const newChat = () => {
    haptics.light();
    setHistoryOpen(false);
    startNewChat();
  };

  return (
    <View style={styles.flex}>
      <KeyboardAvoidingView style={styles.flex} behavior="padding" keyboardVerticalOffset={keyboardOffset}>
        <View style={styles.toolbar}>
          <IconButton
            icon="list"
            variant="plain"
            size={38}
            accessibilityLabel={`Chat history${history.length ? `, ${history.length} past chats` : ""}`}
            onPress={() => {
              haptics.selection();
              setHistoryOpen(true);
            }}
          />
          <View style={styles.toolbarTitle}>
            <AppText variant="h4" numberOfLines={1} align="center">
              {viewing ? viewing.title : "New chat"}
            </AppText>
            {viewing ? (
              <AppText variant="caption" tone="muted" align="center">
                Past chat · {formatRelativeDay(viewing.updatedAt)}
              </AppText>
            ) : null}
          </View>
          <IconButton
            icon="plus"
            variant="plain"
            size={38}
            accessibilityLabel="Start a new chat"
            disabled={busy || (!viewing && messages.length === 0)}
            onPress={newChat}
          />
        </View>
        <FlatList<ChatMessage>
          ref={listRef}
          data={shownMessages}
          keyExtractor={(message) => message.id}
          contentContainerStyle={[styles.list, shownMessages.length === 0 && styles.listEmpty]}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          onContentSizeChange={scrollToLatest}
          onLayout={scrollToLatest}
          ListFooterComponent={isSending && !viewing ? <TypingIndicator /> : undefined}
          ListFooterComponentStyle={isSending && !viewing ? styles.typing : undefined}
          ListEmptyComponent={<EmptyChat onPick={setText} />}
          renderItem={({ item }) => (
            <ChatMessageRow
              message={item}
              onRetry={() => void retry(item.id, responseLanguage)}
              onSaveAsIdea={() => saveAsIdea(item)}
              onOpenIdea={(ideaId) => router.push({ pathname: "/ideas/[id]", params: { id: ideaId } })}
              onOpenProject={(projectId) => router.push({ pathname: "/project/[id]", params: { id: projectId } })}
            />
          )}
        />
        {viewing ? (
          <View style={styles.composerWrap}>
            <View style={styles.pastBar}>
              <Icon name="clock" size={14} color={colors.text.secondary} />
              <AppText variant="bodySmall" tone="secondary" style={styles.bannerText}>
                This is a past chat. It can&apos;t be continued.
              </AppText>
            </View>
            <Button label="Back to current chat" variant="secondary" icon="chat" iconPosition="left" size="small" onPress={() => viewHistory(null)} />
          </View>
        ) : (
          <View style={styles.composerWrap}>
            {error ? (
              <View style={styles.banner} accessibilityRole="alert">
                <Icon name="warning" size={14} color={colors.semantic.error} />
                <AppText variant="bodySmall" tone="secondary" style={styles.bannerText}>
                  {error}
                </AppText>
                <Pressable accessibilityRole="button" accessibilityLabel="Dismiss" hitSlop={8} onPress={dismissError}>
                  <Icon name="close" size={14} color={colors.text.muted} />
                </Pressable>
              </View>
            ) : null}
            {awaitingConfirmation && !sending ? (
              <View style={styles.actions}>
                <Button label="Build my project" icon="build" iconPosition="left" size="small" onPress={() => void confirm()} style={styles.flex} />
                <Button label="End" variant="ghost" size="small" onPress={() => void cancel()} />
              </View>
            ) : null}
            {generating ? (
              <AppText variant="bodySmall" tone="secondary" align="center" style={styles.status} accessibilityLiveRegion="polite">
                Veya is building your project plan. This can take a few minutes…
              </AppText>
            ) : null}
            {completed ? (
              <Button label="Start a new chat" variant="secondary" icon="plus" iconPosition="left" size="small" onPress={startNewChat} style={styles.status} />
            ) : null}
            <ChatComposer value={text} onChangeText={setText} onSend={submit} canSend={canSend} sending={isSending} />
          </View>
        )}
      </KeyboardAvoidingView>
      {historyOpen ? (
        <ChatHistoryDrawer
          history={history}
          activeId={viewingId}
          onNewChat={newChat}
          onOpen={(id) => {
            viewHistory(id);
            setHistoryOpen(false);
          }}
          onDelete={deleteHistory}
          onClose={() => setHistoryOpen(false)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { paddingHorizontal: screenGutter, paddingVertical: spacing[4] },
  listEmpty: { flexGrow: 1, justifyContent: "center" },
  separator: { height: spacing[4] },
  typing: { paddingTop: spacing[4] },
  empty: { alignItems: "center", gap: spacing[2] },
  emptyTitle: { marginTop: spacing[4] },
  emptyBody: { maxWidth: 300 },
  starters: { alignSelf: "stretch", marginTop: spacing[5], gap: spacing[2] },
  starter: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    minHeight: 52,
    paddingHorizontal: spacing[3],
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: themed("rgba(196, 181, 253, 0.16)"),
    backgroundColor: themed("rgba(22, 20, 36, 0.8)"),
  },
  starterPressed: { borderColor: themed("rgba(196, 181, 253, 0.5)"), backgroundColor: themed("rgba(124, 58, 237, 0.16)") },
  starterIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.overlay.lavenderSoft,
  },
  starterText: { flex: 1, fontFamily: fontFamilies.medium, fontSize: 14, lineHeight: 19, color: colors.text.primary },
  starterArrow: { transform: [{ rotate: "45deg" }] },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    borderBottomWidth: 1,
    borderBottomColor: themed("rgba(196, 181, 253, 0.1)"),
  },
  toolbarTitle: { flex: 1 },
  pastBar: { flexDirection: "row", alignItems: "center", gap: spacing[2], marginBottom: spacing[2], justifyContent: "center" },
  composerWrap: { paddingHorizontal: spacing[4], paddingTop: spacing[2], paddingBottom: spacing[3] },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
    marginBottom: spacing[2],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: "rgba(255, 77, 79, 0.35)",
    backgroundColor: "rgba(255, 77, 79, 0.08)",
  },
  bannerText: { flex: 1 },
  actions: { flexDirection: "row", gap: spacing[2], marginBottom: spacing[2] },
  status: { marginBottom: spacing[2] },
});
