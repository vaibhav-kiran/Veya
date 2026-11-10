import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, screenGutter, spacing, themed } from "@/theme";

import { AppText } from "./AppText";
import { IconButton } from "./IconButton";

type AuthLayoutProps = {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
  onBack?: () => void;
};

/**
 * Sign-in / sign-up frame: colour wash from the top, logo mark, centred
 * title, then a borderless form and footer link.
 */
export function AuthLayout({ title, subtitle, children, footer, onBack }: AuthLayoutProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.root}>
      <View pointerEvents="none" style={styles.wash} />
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <KeyboardAvoidingView style={styles.safe} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            showsVerticalScrollIndicator={false}
          >

            <View style={styles.inner}>
              {/* Decorative: the title below already says what the screen is. */}
              <View style={styles.mark} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                {/* Default-avatar silhouette: head and shoulders, clipped by the circle. */}
                <View style={styles.head} />
                <View style={styles.shoulders} />
              </View>

              <View style={styles.heading}>
                <AppText variant="h2" align="center" accessibilityRole="header">
                  {title}
                </AppText>
                <AppText variant="bodyMedium" tone="secondary" align="center">
                  {subtitle}
                </AppText>
              </View>

              <View style={styles.form}>{children}</View>

              {footer ? <View style={styles.footer}>{footer}</View> : null}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
      {/* Floats over the content so it doesn't push the centred form down. */}
      {onBack ? (
        <IconButton icon="chevronLeft" accessibilityLabel="Go back" onPress={onBack} style={[styles.back, { top: insets.top + spacing[2] }]} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.veya.background },
  // Brand colour washing down from the top edge, fading into the background.
  wash: {
    ...StyleSheet.absoluteFill,
    backgroundImage:
      themed("linear-gradient(180deg, rgba(124, 58, 237, 0.55) 0%, rgba(76, 29, 149, 0.32) 18%, rgba(30, 27, 75, 0.18) 34%, rgba(8, 8, 12, 0) 52%)"),
  },
  safe: { flex: 1 },
  // flexGrow + centre keeps the form vertically centred, and still scrolls on small screens.
  content: { flexGrow: 1, justifyContent: "center", paddingHorizontal: screenGutter, paddingVertical: spacing[10] },
  back: { position: "absolute", left: screenGutter },
  inner: { width: "100%", maxWidth: 420, alignSelf: "center" },
  // Human profile avatar in a soft glass circle.
  mark: {
    alignSelf: "center",
    width: 72,
    height: 72,
    borderRadius: 36,
    overflow: "hidden",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: themed("rgba(196, 181, 253, 0.45)"),
    backgroundImage: themed("linear-gradient(180deg, rgba(196, 181, 253, 0.16) 0%, rgba(124, 58, 237, 0.12) 100%)"),
  },
  head: { marginTop: 14, width: 26, height: 26, borderRadius: 13, backgroundColor: colors.veya.lavender },
  shoulders: {
    marginTop: 5,
    width: 50,
    height: 40,
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
    backgroundColor: colors.veya.lavender,
  },
  heading: { marginTop: spacing[6], gap: spacing[2] },
  form: { marginTop: spacing[8], gap: spacing[4] },
  footer: { marginTop: spacing[6], alignItems: "center", gap: spacing[3] },
});
