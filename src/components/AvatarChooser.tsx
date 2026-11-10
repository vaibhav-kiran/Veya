import { Image } from "expo-image";
import { useState } from "react";
import { Alert, Linking, Pressable, StyleSheet, View, useWindowDimensions } from "react-native";

import { MASCOTS } from "@/constants/mascots";
import { avatarOf, chooseMascot, PhotoAccessDeniedError, removeAvatar, uploadProfilePhoto } from "@/lib/avatar";
import { haptics } from "@/lib/haptics";
import { colors, fontFamilies, screenGutter, spacing, themed } from "@/theme";

import { AppText } from "./AppText";
import { Button } from "./Button";
import { FormMessage } from "./FormMessage";
import { Icon } from "./Icon";

const COLUMNS = 5;

type ChooserUser = Parameters<typeof chooseMascot>[0];

type AvatarChooserProps = {
  user: ChooserUser;
  /** Reports whether a picture change is being saved (to hold other actions). */
  onBusyChange?: (busy: boolean) => void;
};

/**
 * Upload a photo or pick one of Veya's mascots. Each choice is saved to the
 * account straight away.
 */
export function AvatarChooser({ user, onBusyChange }: AvatarChooserProps) {
  const { width } = useWindowDimensions();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const avatar = avatarOf(user);
  const tile = Math.floor((Math.min(width, 520) - screenGutter * 2 - spacing[4] * 2 - spacing[3] * (COLUMNS - 1)) / COLUMNS);

  const run = async (key: string, action: () => Promise<unknown>) => {
    setBusy(key);
    onBusyChange?.(true);
    setError(null);
    try {
      await action();
      haptics.success();
    } catch (cause) {
      haptics.error();
      if (cause instanceof PhotoAccessDeniedError) {
        Alert.alert("Allow photo access", "Veya needs access to your photos to use one as your profile picture.", [
          { text: "Not now", style: "cancel" },
          { text: "Open Settings", onPress: () => void Linking.openSettings() },
        ]);
      } else {
        setError("Couldn't update your profile picture. Check your connection and try again.");
      }
    } finally {
      setBusy(null);
      onBusyChange?.(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <Button
        label={avatar.kind === "photo" ? "Choose another photo" : "Upload a photo"}
        icon="image"
        iconPosition="left"
        variant="secondary"
        loading={busy === "photo"}
        disabled={busy !== null}
        onPress={() => void run("photo", () => uploadProfilePhoto(user))}
      />

      <View style={styles.header}>
        <AppText variant="eyebrow" tone="secondary">
          Or pick a mascot
        </AppText>
        <AppText variant="caption" tone="muted">
          {MASCOTS.length} to choose from
        </AppText>
      </View>

      <View style={styles.grid}>
        {MASCOTS.map((mascot) => {
          const selected = avatar.kind === "mascot" && avatar.mascotId === mascot.id;
          return (
            <Pressable
              key={mascot.id}
              accessibilityRole="radio"
              accessibilityLabel={`${mascot.name} mascot`}
              accessibilityState={{ checked: selected, disabled: busy !== null }}
              disabled={busy !== null}
              onPress={() => {
                haptics.selection();
                void run(mascot.id, () => chooseMascot(user, mascot.id));
              }}
              style={({ pressed }) => [styles.mascot, { width: tile }, pressed && styles.pressed]}
            >
              <View style={[styles.frame, { width: tile, height: tile, borderRadius: tile / 2 }, selected && styles.frameSelected]}>
                <Image source={mascot.source} style={StyleSheet.absoluteFill} contentFit="cover" accessible={false} />
                {selected ? (
                  <View style={styles.check}>
                    <Icon name="check" size={10} color={colors.text.inverse} weight="semibold" />
                  </View>
                ) : null}
              </View>
              <AppText style={[styles.name, selected && styles.nameSelected]} numberOfLines={1}>
                {mascot.name}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      <FormMessage message={error} />

      {avatar.kind !== "initial" ? (
        <Button
          label="Remove picture"
          variant="ghost"
          icon="trash"
          iconPosition="left"
          size="small"
          loading={busy === "remove"}
          disabled={busy !== null}
          onPress={() => void run("remove", () => removeAvatar(user))}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing[4] },
  header: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing[3] },
  mascot: { alignItems: "center", gap: 6 },
  pressed: { opacity: 0.7 },
  frame: { overflow: "hidden", borderWidth: 2, borderColor: "transparent" },
  frameSelected: { borderColor: colors.veya.lavender, boxShadow: themed("0px 0px 14px rgba(196, 181, 253, 0.7)") },
  check: {
    position: "absolute",
    right: 2,
    bottom: 2,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.veya.lavender,
  },
  name: { fontFamily: fontFamilies.medium, fontSize: 12, lineHeight: 16, color: colors.text.secondary },
  nameSelected: { color: colors.veya.lavender },
});
