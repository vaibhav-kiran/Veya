import { useAuth, useUser } from "@/lib/auth";
import Constants from "expo-constants";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppText } from "@/components/AppText";
import { FormMessage } from "@/components/FormMessage";
import { Icon, type IconName } from "@/components/Icon";
import { ScreenBackground } from "@/components/ScreenBackground";
import { SettingsRow, SettingsSection } from "@/components/SettingsRow";
import { ThemePicker } from "@/components/ThemePicker";
import { UserAvatar } from "@/components/UserAvatar";
import { VeyaLogo } from "@/components/VeyaLogo";
import { languageLabel } from "@/constants/languages";
import { avatarOf } from "@/lib/avatar";
import { haptics } from "@/lib/haptics";
import { planApi } from "@/lib/veyaApi";
import { usePreferencesStore } from "@/stores/preferencesStore";
import { useProjectsStore } from "@/stores/projectsStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { colors, fontFamilies, radii, screenGutter, spacing, themed } from "@/theme";
import type { LanguagePreferenceKey } from "@/types/preferences";

const LANGUAGE_ROWS: { key: LanguagePreferenceKey; label: string; icon: IconName }[] = [
  { key: "input", label: "Input language", icon: "mic" },
  { key: "response", label: "Response language", icon: "chat" },
  { key: "documentation", label: "Documentation language", icon: "document" },
];

const AVATAR_SIZE = 108;

function StatTile({ value, label, icon }: { value: string; label: string; icon: IconName }) {
  return (
    <View style={styles.stat} accessible accessibilityLabel={`${label}: ${value}`}>
      <Icon name={icon} size={14} color={colors.veya.lavender} />
      <AppText style={styles.statValue} numberOfLines={1}>
        {value}
      </AppText>
      <AppText variant="caption" tone="secondary">
        {label}
      </AppText>
    </View>
  );
}

/** Profile, preferences and account. Only settings that are implemented are shown. */
export default function SettingsScreen() {
  const router = useRouter();
  const { signOut } = useAuth();
  const { user } = useUser();
  const languages = usePreferencesStore((state) => state.languages);
  const ideaCount = useWorkspaceStore((state) => Object.keys(state.ideas).length);
  const projectCount = useProjectsStore((state) => state.summaries.length);
  const [planLabel, setPlanLabel] = useState("Free");
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The plan comes from the backend; keep the last known label if it can't be reached.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      planApi
        .getPlan()
        .then((plan) => active && setPlanLabel(plan.label))
        .catch(() => undefined);
      return () => {
        active = false;
      };
    }, []),
  );

  const fullName = user?.fullName?.trim() || "Your profile";
  const email = user?.primaryEmailAddress?.emailAddress ?? "";
  const avatar = avatarOf(user);
  const editProfile = () => router.push("/edit-profile");
  const editLanguage = (section: LanguagePreferenceKey) => router.push({ pathname: "/language", params: { mode: "edit", section } });

  const confirmSignOut = () =>
    Alert.alert("Sign out of Veya?", "Your ideas and tasks stay on this device for this account.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: async () => {
          setError(null);
          setSigningOut(true);
          try {
            haptics.warning();
            await signOut();
          } catch {
            setError("Couldn’t sign out. Please try again.");
            setSigningOut(false);
          }
        },
      },
    ]);

  return (
    <ScreenBackground glow="top">
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* Profile: picture in the centre. Name and picture are changed in Edit profile. */}
          <View style={styles.hero}>
            <View style={[styles.ring, styles.avatarSpacing]}>
              <UserAvatar avatar={avatar} name={user?.firstName ?? email} size={AVATAR_SIZE} />
            </View>
            <AppText variant="h2" align="center" numberOfLines={1} style={styles.name}>
              {fullName}
            </AppText>
            {email ? (
              <AppText variant="bodySmall" tone="secondary" align="center" numberOfLines={1}>
                {email}
              </AppText>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityHint="Change your name and profile picture"
              onPress={() => {
                haptics.selection();
                editProfile();
              }}
              style={({ pressed }) => [styles.editPill, pressed && styles.pressed]}
            >
              <Icon name="edit" size={13} color={colors.veya.lavender} />
              <AppText variant="bodySmall" tone="accent" style={styles.editPillText}>
                Edit profile
              </AppText>
            </Pressable>
          </View>

          <View style={styles.stats}>
            <StatTile value={String(ideaCount)} label="Ideas" icon="idea" />
            <StatTile value={String(projectCount)} label="Projects" icon="folder" />
            <StatTile value={planLabel} label="Plan" icon="star" />
          </View>

          <View style={styles.themeSection}>
            <AppText variant="eyebrow" tone="secondary" accessibilityRole="header">
              Theme
            </AppText>
            <ThemePicker />
          </View>

          <SettingsSection title="Language">
            {LANGUAGE_ROWS.map(({ key, label, icon }) => (
              <SettingsRow key={key} icon={icon} label={label} value={languageLabel(languages[key])} onPress={() => editLanguage(key)} />
            ))}
          </SettingsSection>

          <SettingsSection title="Account">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Sign out"
              accessibilityState={{ busy: signingOut, disabled: signingOut }}
              disabled={signingOut}
              onPress={confirmSignOut}
              style={({ pressed }) => [styles.signOut, pressed && styles.signOutPressed]}
            >
              <View style={styles.signOutLeading}>
                <View style={styles.signOutIcon}>
                  <Icon name="signOut" size={15} color={colors.semantic.error} />
                </View>
                <AppText variant="bodyLarge" tone="error">
                  Sign out
                </AppText>
              </View>
              {signingOut ? <ActivityIndicator color={colors.semantic.error} /> : null}
            </Pressable>
          </SettingsSection>

          <FormMessage message={error} />


          <View style={styles.footer}>
            <VeyaLogo size="small" />
            <AppText variant="caption" tone="muted" align="center">
              Version {Constants.expoConfig?.version ?? ""} · Think it. Speak it. Build it.
            </AppText>
          </View>
        </ScrollView>
      </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { paddingHorizontal: screenGutter, paddingTop: spacing[4], paddingBottom: spacing[12], gap: spacing[6] },
  hero: { alignItems: "center", gap: spacing[1] },
  avatarSpacing: { marginBottom: spacing[3] },
  ring: {
    padding: 4,
    borderRadius: 999,
    backgroundImage: `linear-gradient(135deg, ${colors.veya.lavender} 0%, ${colors.veya.purple} 100%)`,
    boxShadow: themed("0px 0px 36px rgba(167, 139, 250, 0.5)"),
  },
  name: { maxWidth: "90%" },
  editPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: spacing[3],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: themed("rgba(196, 181, 253, 0.35)"),
    backgroundColor: colors.overlay.lavenderSoft,
  },
  editPillText: { fontFamily: fontFamilies.semibold },
  pressed: { opacity: 0.75 },
  stats: { flexDirection: "row", gap: spacing[3] },
  stat: {
    flex: 1,
    alignItems: "center",
    gap: 2,
    paddingVertical: spacing[4],
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: themed("rgba(196, 181, 253, 0.16)"),
    backgroundImage: themed("linear-gradient(160deg, rgba(124, 58, 237, 0.18) 0%, rgba(15, 14, 23, 0.9) 100%)"),
  },
  statValue: { fontFamily: fontFamilies.bold, fontSize: 20, lineHeight: 26, color: colors.text.primary },
  signOut: { minHeight: 56, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing[4] },
  signOutPressed: { backgroundColor: colors.overlay.errorSoft },
  signOutLeading: { flexDirection: "row", alignItems: "center", gap: spacing[3] },
  signOutIcon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.overlay.errorSoft,
  },
  themeSection: { gap: spacing[2] },
  footer: { alignItems: "center", gap: spacing[1], marginTop: spacing[2] },
});
