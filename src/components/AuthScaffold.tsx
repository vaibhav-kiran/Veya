import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors, screenGutter, spacing, themed } from "@/theme";

import { AppText } from "./AppText";
import { GlassCard } from "./GlassCard";
import { Icon } from "./Icon";
import { IconButton } from "./IconButton";
import { ScreenBackground } from "./ScreenBackground";
import { VeyaLogo } from "./VeyaLogo";

type AuthScaffoldProps = {
  heading: string;
  subheading: string;
  cardTitle: string;
  children: ReactNode;
  footer?: ReactNode;
  onBack?: () => void;
};

/** Shared frame for sign-in, sign-up and password reset (03-auth-screen.png). */
export function AuthScaffold({ heading, subheading, cardTitle, children, footer, onBack }: AuthScaffoldProps) {
  return (
    <ScreenBackground glow="top">
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <KeyboardAvoidingView style={styles.safe} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            showsVerticalScrollIndicator={false}
          >
            {onBack ? (
              <IconButton icon="chevronLeft" accessibilityLabel="Go back" onPress={onBack} style={styles.back} />
            ) : null}
            <VeyaLogo size="large" showTagline />
            <View style={styles.hero}>
              <AppText variant="h2" align="center" accessibilityRole="header" style={styles.heading}>
                {heading}
              </AppText>
              <AppText variant="bodyMedium" tone="secondary" align="center" style={styles.subheading}>
                {subheading}
              </AppText>
            </View>

            <View style={styles.cardWrap}>
              <View style={styles.badge}>
                <Icon name="sparkle" size={18} color={colors.text.primary} />
              </View>
              <GlassCard style={styles.card}>
                <AppText variant="h3" align="center" style={styles.cardTitle}>
                  {cardTitle}
                </AppText>
                {children}
              </GlassCard>
            </View>

            {footer ? <View style={styles.footer}>{footer}</View> : null}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: screenGutter, paddingTop: spacing[6], paddingBottom: spacing[6] },
  back: { position: "absolute", left: screenGutter, top: spacing[5], zIndex: 1 },
  hero: { marginTop: spacing[8], gap: spacing[2], alignItems: "center" },
  heading: { fontSize: 28, lineHeight: 34, maxWidth: 320 },
  subheading: { maxWidth: 290 },
  cardWrap: { marginTop: spacing[8], alignItems: "center" },
  badge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginBottom: -22,
    zIndex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundImage: themed("radial-gradient(circle at 40% 35%, #EDE9FE 0%, #A78BFA 45%, #4C1D95 100%)"),
    boxShadow: themed("0px 0px 26px rgba(196, 181, 253, 0.8)"),
  },
  card: { alignSelf: "stretch", paddingTop: spacing[8], gap: spacing[3] },
  cardTitle: { marginBottom: spacing[2] },
  footer: { marginTop: spacing[6], alignItems: "center", gap: spacing[3] },
});
