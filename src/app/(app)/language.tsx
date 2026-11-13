import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { IconButton } from "@/components/IconButton";
import { LanguageHero } from "@/components/LanguageHero";
import { LanguageOption } from "@/components/LanguageOption";
import { ScreenBackground } from "@/components/ScreenBackground";
import { VeyaLogo } from "@/components/VeyaLogo";
import { LANGUAGE_GLYPHS, LANGUAGES, languageLabel, type LanguageCode } from "@/constants/languages";
import { haptics } from "@/lib/haptics";
import { useChatStore } from "@/stores/chatStore";
import { useConversationStore } from "@/stores/conversationStore";
import { usePreferencesStore } from "@/stores/preferencesStore";
import { colors, fontFamilies, radii, screenGutter, spacing, themed } from "@/theme";

/**
 * A conversation keeps the language it started in, so after a change the
 * open voice conversation and text chat start over in the new one (the chat
 * goes to history). A project that is being built is left to finish.
 */
function startOverInNewLanguage() {
  const conversation = useConversationStore.getState();
  if (conversation.sessionId && conversation.phase !== "generatingProject") conversation.startNewConversation();

  const chat = useChatStore.getState();
  if (chat.sessionId && !chat.generating) chat.startNewChat();
}

function chunkPairs<T>(items: readonly T[]): T[][] {
  const rows: T[][] = [];
  for (let index = 0; index < items.length; index += 2) rows.push(items.slice(index, index + 2));
  return rows;
}

/**
 * Choose the one language Veya works in: she listens for it, replies in it
 * and speaks it. Used once after first sign-in and again from Settings
 * (`mode=edit`).
 */
export default function LanguageScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string }>();
  const isEditing = params.mode === "edit";
  const savedLanguage = usePreferencesStore((state) => state.language);
  const setLanguage = usePreferencesStore((state) => state.setLanguage);
  const [draft, setDraft] = useState<LanguageCode>(savedLanguage);

  const save = () => {
    if (draft !== savedLanguage) startOverInNewLanguage();
    setLanguage(draft);
    haptics.success();
    if (isEditing && router.canGoBack()) router.back();
    else router.replace("/talk");
  };

  return (
    <ScreenBackground glow="top">
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            {isEditing ? (
              <IconButton icon="chevronLeft" accessibilityLabel="Back to settings" onPress={() => router.back()} style={styles.back} />
            ) : null}
            <VeyaLogo size="small" />
          </View>

          <Animated.View entering={FadeInDown.duration(500)}>
            <LanguageHero />
            <AppText variant="h1" align="center" accessibilityRole="header" style={styles.title}>
              Let&apos;s speak{"\n"}
              <AppText variant="h1" tone="accent" style={styles.title}>
                your language.
              </AppText>
            </AppText>
            <AppText variant="bodyMedium" tone="secondary" align="center" style={styles.subtitle}>
              Pick one language. Veya will listen, reply and speak in it. English words like app names are fine.
            </AppText>
          </Animated.View>

          <Animated.View
            entering={FadeInDown.duration(420).delay(140)}
            style={styles.card}
            accessibilityRole="radiogroup"
            accessibilityLabel="Which language should Veya use?"
          >
            <View style={styles.grid}>
              {chunkPairs(LANGUAGES).map((row) => (
                <View key={row[0].code} style={styles.row}>
                  {row.map((option) => (
                    <LanguageOption
                      key={option.code}
                      label={option.label}
                      detail={"nativeLabel" in option ? option.nativeLabel : undefined}
                      glyph={LANGUAGE_GLYPHS[option.code]}
                      selected={draft === option.code}
                      onPress={() => setDraft(option.code)}
                    />
                  ))}
                  {row.length === 1 ? <View style={styles.spacer} /> : null}
                </View>
              ))}
            </View>
          </Animated.View>
        </ScrollView>

        <View style={styles.footer}>
          <View pointerEvents="none" style={styles.fade} />
          <View style={styles.summary} accessible accessibilityLabel={`Veya will use ${languageLabel(draft)}`}>
            <AppText style={styles.summaryLabel}>Veya listens, replies and speaks in</AppText>
            <AppText style={styles.summaryValue} numberOfLines={1}>
              {languageLabel(draft)}
            </AppText>
          </View>
          <Button label={isEditing ? "Save language" : "Continue"} icon={isEditing ? "check" : "arrowRight"} onPress={save} />
        </View>
      </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { paddingHorizontal: screenGutter, paddingTop: spacing[2], paddingBottom: spacing[8] },
  header: { minHeight: 44, alignItems: "center", justifyContent: "center" },
  back: { position: "absolute", left: 0 },
  title: { fontSize: 32, lineHeight: 38 },
  subtitle: { marginTop: spacing[3], maxWidth: 320, alignSelf: "center" },
  card: {
    marginTop: spacing[8],
    padding: spacing[4],
    gap: spacing[4],
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: themed("rgba(196, 181, 253, 0.14)"),
    backgroundColor: themed("rgba(18, 16, 30, 0.82)"),
    boxShadow: "0px 12px 30px rgba(0, 0, 0, 0.35)",
  },
  grid: { gap: spacing[2] + 2 },
  row: { flexDirection: "row", gap: spacing[2] + 2 },
  spacer: { flex: 1 },
  footer: {
    backgroundColor: colors.veya.background,
    paddingHorizontal: screenGutter,
    paddingTop: spacing[3],
    paddingBottom: spacing[2],
    gap: spacing[3],
  },
  fade: {
    position: "absolute",
    left: 0,
    right: 0,
    top: -32,
    height: 32,
    backgroundImage: themed(`linear-gradient(180deg, rgba(8, 8, 12, 0) 0%, ${colors.veya.background} 100%)`),
  },
  summary: {
    alignItems: "center",
    paddingVertical: spacing[2],
    gap: 1,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: themed("rgba(196, 181, 253, 0.14)"),
    backgroundColor: "rgba(255, 255, 255, 0.03)",
  },
  summaryLabel: { fontFamily: fontFamilies.regular, fontSize: 11, lineHeight: 14, color: colors.text.muted },
  summaryValue: { fontFamily: fontFamilies.semibold, fontSize: 13.5, lineHeight: 18, color: colors.veya.lavender },
});
