import { useAuth } from "@/lib/auth";
import { Stack } from "expo-router";
import { View } from "react-native";
import { useEffect } from "react";

import { EdgeGlow } from "@/components/EdgeGlow";
import { VoiceConversationController } from "@/components/VoiceConversationController";
import { useBackendUser } from "@/hooks/useBackendUser";
import { useFreshChatOnReturn } from "@/hooks/useFreshChatOnReturn";
import { usePreferencesStore } from "@/stores/preferencesStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { colors } from "@/theme";

export default function AppLayout() {
  const { userId } = useAuth();
  const claimForUser = useWorkspaceStore((state) => state.claimForUser);
  const languagesConfirmed = usePreferencesStore((state) => state.languagesConfirmed);

  // Local ideas/tasks belong to one account; switching accounts starts fresh.
  useEffect(() => {
    if (userId) claimForUser(userId);
  }, [claimForUser, userId]);

  // API user header, per-account project cache, one-time upload of on-device projects.
  useBackendUser(userId);

  // A fresh chat on every visit; earlier chats stay in the chat history panel.
  useFreshChatOnReturn();

  return (
    <View style={{ flex: 1 }}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.veya.background },
          animation: "slide_from_right",
        }}
      >
        {/* First sign-in on a device: choose languages before entering the app. */}
        <Stack.Protected guard={languagesConfirmed}>
          <Stack.Screen name="(tabs)" options={{ animation: "fade" }} />
          <Stack.Screen name="project/[id]" />
          <Stack.Screen name="project-timeline" />
          <Stack.Screen name="idea-editor" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
          <Stack.Screen name="item-editor" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
          <Stack.Screen name="section-editor" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
          <Stack.Screen name="deadline-editor" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
          <Stack.Screen name="edit-profile" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
        </Stack.Protected>
        <Stack.Screen name="language" />
      </Stack>
      {/* "Veya is listening" glow, drawn above every in-app screen. */}
      <EdgeGlow />
      {/* Microphone + Veya's voice for the shared conversation (renders nothing). */}
      <VoiceConversationController />
    </View>
  );
}
