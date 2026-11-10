import { useUser } from "@/lib/auth";
import { useRouter } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppText } from "@/components/AppText";
import { AvatarChooser } from "@/components/AvatarChooser";
import { Button } from "@/components/Button";
import { FormMessage } from "@/components/FormMessage";
import { Icon } from "@/components/Icon";
import { ScreenBackground } from "@/components/ScreenBackground";
import { ScreenTopBar } from "@/components/ScreenTopBar";
import { TextField } from "@/components/TextField";
import { UserAvatar } from "@/components/UserAvatar";
import { avatarOf } from "@/lib/avatar";
import { haptics } from "@/lib/haptics";
import { colors, radii, screenGutter, spacing, themed } from "@/theme";

const AVATAR_SIZE = 104;

/**
 * Everything about the profile on one page: picture (photo or mascot, saved as
 * soon as it's picked) and name (saved with the button). Email changes stay in
 * Clerk's verified flows.
 */
export default function EditProfileScreen() {
  const router = useRouter();
  const { user } = useUser();
  const [firstName, setFirstName] = useState(user?.firstName ?? "");
  const [lastName, setLastName] = useState(user?.lastName ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pictureBusy, setPictureBusy] = useState(false);

  const email = user?.primaryEmailAddress?.emailAddress ?? "";
  const avatar = avatarOf(user);
  const previewName = [firstName.trim(), lastName.trim()].filter(Boolean).join(" ") || "Your name";
  const changed = firstName.trim() !== (user?.firstName ?? "") || lastName.trim() !== (user?.lastName ?? "");

  const save = async () => {
    if (!user || saving) return;
    // Pictures are already saved; with no name change the button just closes the page.
    if (!changed) {
      haptics.success();
      router.back();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await user.update({ firstName: firstName.trim(), lastName: lastName.trim() });
      haptics.success();
      router.back();
    } catch {
      haptics.error();
      setError("Couldn’t save your profile. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScreenBackground glow="top">
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <ScreenTopBar title="Edit profile" onBack={() => router.back()} backIcon="close" backLabel="Cancel" />
        <KeyboardAvoidingView style={styles.safe} behavior="padding">
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={styles.hero}>
              <View style={styles.ring}>
                <UserAvatar avatar={avatar} name={firstName || email} size={AVATAR_SIZE} />
              </View>
              <AppText variant="h2" align="center" numberOfLines={1} style={styles.name}>
                {previewName}
              </AppText>
            </View>

            {user ? (
              <View style={styles.card}>
                <AppText variant="eyebrow" tone="secondary">
                  Profile picture
                </AppText>
                <AvatarChooser user={user} onBusyChange={setPictureBusy} />
              </View>
            ) : null}

            <View style={styles.card}>
              <AppText variant="eyebrow" tone="secondary">
                Your name
              </AppText>
              <TextField
                label="First name"
                value={firstName}
                onChangeText={setFirstName}
                autoComplete="given-name"
                textContentType="givenName"
                editable={!saving}
              />
              <TextField
                label="Last name"
                value={lastName}
                onChangeText={setLastName}
                autoComplete="family-name"
                textContentType="familyName"
                editable={!saving}
              />
            </View>

            {email ? (
              <View style={styles.emailRow} accessible accessibilityLabel={`Email, ${email}. Managed by your sign-in.`}>
                <View style={styles.emailIcon}>
                  <Icon name="mail" size={15} color={colors.veya.lavender} />
                </View>
                <View style={styles.emailText}>
                  <AppText variant="caption" tone="secondary">
                    Email
                  </AppText>
                  <AppText variant="bodyMedium" numberOfLines={1}>
                    {email}
                  </AppText>
                </View>
                <AppText variant="caption" tone="muted">
                  Managed by sign-in
                </AppText>
              </View>
            ) : null}

            <FormMessage message={error} />
          </ScrollView>
          <Button
            label={changed ? "Save changes" : "Done"}
            icon="check"
            onPress={() => void save()}
            loading={saving}
            disabled={pictureBusy}
            style={styles.save}
          />
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { paddingHorizontal: screenGutter, paddingBottom: spacing[6], gap: spacing[5] },
  hero: { alignItems: "center", gap: spacing[3], marginTop: spacing[2] },
  ring: {
    padding: 4,
    borderRadius: 999,
    backgroundImage: `linear-gradient(135deg, ${colors.veya.lavender} 0%, ${colors.veya.purple} 100%)`,
    boxShadow: themed("0px 0px 36px rgba(167, 139, 250, 0.5)"),
  },
  name: { maxWidth: "90%" },
  card: {
    gap: spacing[3],
    padding: spacing[4],
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: themed("rgba(196, 181, 253, 0.16)"),
    backgroundColor: colors.veya.surface,
  },
  emailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    padding: spacing[4],
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.veya.border,
    backgroundColor: colors.overlay.surfaceGlass,
  },
  emailIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.overlay.lavenderSoft,
  },
  emailText: { flex: 1, gap: 1 },
  save: { marginHorizontal: screenGutter, marginBottom: spacing[2] },
});
