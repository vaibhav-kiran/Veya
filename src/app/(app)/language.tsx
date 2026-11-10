import { useLocalSearchParams, useRouter } from "expo-router";
import { useRef, useState } from "react";
import { ScrollView, StyleSheet, View, type ScrollViewInstance } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { IconButton } from "@/components/IconButton";
import { LanguageHero } from "@/components/LanguageHero";
import { LanguageOption } from "@/components/LanguageOption";
import { ScreenBackground } from "@/components/ScreenBackground";
import { VeyaLogo } from "@/components/VeyaLogo";
import {
  LANGUAGE_CAPTIONS,
  LANGUAGE_GLYPHS,
  LANGUAGE_SECTIONS,
  languageLabel,
  type LanguageOptionData,
} from "@/constants/languages";
import { haptics } from "@/lib/haptics";
import { usePreferencesStore } from "@/stores/preferencesStore";
import { colors, fontFamilies, radii, screenGutter, spacing, themed } from "@/theme";
import type { LanguagePreferenceKey, LanguagePreferences } from "@/types/preferences";

const SECTION_KEYS: LanguagePreferenceKey[] = ["input", "response", "documentation"];

function chunkPairs<T>(items: readonly T[]): T[][] {
  const rows: T[][] = [];
  for (let index = 0; index < items.length; index += 2) rows.push(items.slice(index, index + 2));
  return rows;
}

type SectionCardProps = {
  sectionKey: LanguagePreferenceKey;
  index: number;
  selected: string;
  onSelect: (code: string) => void;
  onLayoutY: (y: number) => void;
};

/** One numbered glass card per preference, with the current choice shown in its header. */
function SectionCard({ sectionKey, index, selected, onSelect, onLayoutY }: SectionCardProps) {
  const section = LANGUAGE_SECTIONS[sectionKey];
  const options: readonly LanguageOptionData<string>[] = section.options;

  return (
    <Animated.View
      entering={FadeInDown.duration(420).delay(140 + index * 110)}
      onLayout={(event) => onLayoutY(event.nativeEvent.layout.y)}
      style={styles.card}
      accessibilityRole="radiogroup"
      accessibilityLabel={section.prompt}
    >
      <View style={styles.cardHeader}>
        <View style={styles.badge}>
          <AppText style={styles.badgeText}>{index + 1}</AppText>
        </View>
        <View style={styles.cardTitles}>
          <AppText style={styles.cardTitle} accessibilityRole="header">
            {section.title}
          </AppText>
          <AppText variant="bodySmall" tone="secondary">
            {section.prompt}
          </AppText>
        </View>
      </View>

      <View style={styles.grid}>
        {chunkPairs(options).map((row) => (
          <View key={row[0].code} style={styles.row}>
            {row.map((option) => (
              <LanguageOption
                key={option.code}
                label={option.label}
                detail={option.nativeLabel ?? LANGUAGE_CAPTIONS[option.code]}
                glyph={LANGUAGE_GLYPHS[option.code] ?? option.label.charAt(0)}
                selected={selected === option.code}
                onPress={() => onSelect(option.code)}
              />
            ))}
            {row.length === 1 ? <View style={styles.spacer} /> : null}
          </View>
        ))}
      </View>
    </Animated.View>
  );
}

/**
 * Language preferences. Used once after first sign-in and again from
 * Settings (`mode=edit`, optionally scrolled to `section`).
 */
export default function LanguageScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string; section?: LanguagePreferenceKey }>();
  const isEditing = params.mode === "edit";
  const savedLanguages = usePreferencesStore((state) => state.languages);
  const setLanguages = usePreferencesStore((state) => state.setLanguages);

  const [draft, setDraft] = useState<LanguagePreferences>(savedLanguages);
  const scrollRef = useRef<ScrollViewInstance>(null);
  const didScroll = useRef(false);
  // Card positions are relative to the cards container, so track both.
  const cardsY = useRef<number | null>(null);
  const targetCardY = useRef<number | null>(null);

  const choose = (key: LanguagePreferenceKey, code: string) =>
    setDraft((current) => ({ ...current, [key]: code }) as LanguagePreferences);

  const save = () => {
    setLanguages(draft);
    haptics.success();
    if (isEditing && router.canGoBack()) router.back();
    else router.replace("/talk");
  };

  // Opened from a specific Settings row: bring that card into view once,
  // as soon as both its own and its container's positions are known.
  const tryScrollToSection = () => {
    if (didScroll.current || cardsY.current === null || targetCardY.current === null) return;
    didScroll.current = true;
    scrollRef.current?.scrollTo({ y: cardsY.current + targetCardY.current - spacing[4], animated: true });
  };
  const onCardLayout = (key: LanguagePreferenceKey, y: number) => {
    if (params.section !== key) return;
    targetCardY.current = y;
    tryScrollToSection();
  };

  return (
    <ScreenBackground glow="top">
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <ScrollView ref={scrollRef} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
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
              Talk to Veya the way you think. Choose each one separately — you can change them anytime.
            </AppText>
          </Animated.View>

          <View
            style={styles.cards}
            onLayout={(event) => {
              cardsY.current = event.nativeEvent.layout.y;
              tryScrollToSection();
            }}
          >
            {SECTION_KEYS.map((key, index) => (
              <SectionCard
                key={key}
                sectionKey={key}
                index={index}
                selected={draft[key]}
                onSelect={(code) => choose(key, code)}
                onLayoutY={(y) => onCardLayout(key, y)}
              />
            ))}
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <View pointerEvents="none" style={styles.fade} />
          <View style={styles.summary} accessible accessibilityLabel="Your choices">
            {SECTION_KEYS.map((key) => (
              <View key={key} style={styles.summaryItem}>
                <AppText style={styles.summaryLabel}>{LANGUAGE_SECTIONS[key].summary}</AppText>
                <AppText style={styles.summaryValue} numberOfLines={1}>
                  {languageLabel(draft[key])}
                </AppText>
              </View>
            ))}
          </View>
          <Button label={isEditing ? "Save preferences" : "Continue"} icon={isEditing ? "check" : "arrowRight"} onPress={save} />
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
  cards: { marginTop: spacing[8], gap: spacing[5] },
  card: {
    padding: spacing[4],
    gap: spacing[4],
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: themed("rgba(196, 181, 253, 0.14)"),
    backgroundColor: themed("rgba(18, 16, 30, 0.82)"),
    boxShadow: "0px 12px 30px rgba(0, 0, 0, 0.35)",
  },
  cardHeader: { flexDirection: "row", alignItems: "flex-start", gap: spacing[3] },
  badge: {
    width: 32,
    height: 32,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundImage: `linear-gradient(135deg, ${colors.veya.lavender} 0%, ${colors.veya.purple} 100%)`,
    boxShadow: themed("0px 0px 14px rgba(167, 139, 250, 0.5)"),
  },
  badgeText: { fontFamily: fontFamilies.bold, fontSize: 15, lineHeight: 20, color: colors.text.primary },
  cardTitles: { flex: 1, gap: 2 },
  cardTitle: { fontFamily: fontFamilies.semibold, fontSize: 17, lineHeight: 22, color: colors.text.primary },
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
    flexDirection: "row",
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: themed("rgba(196, 181, 253, 0.14)"),
    backgroundColor: "rgba(255, 255, 255, 0.03)",
  },
  summaryItem: { flex: 1, alignItems: "center", paddingVertical: spacing[2], gap: 1 },
  summaryLabel: { fontFamily: fontFamilies.regular, fontSize: 11, lineHeight: 14, color: colors.text.muted },
  summaryValue: { fontFamily: fontFamilies.semibold, fontSize: 13.5, lineHeight: 18, color: colors.veya.lavender },
});
