import { Image } from "expo-image";
import { StyleSheet, View } from "react-native";

import type { AvatarSource } from "@/lib/avatar";
import { colors, fontFamilies, themed } from "@/theme";

import { AppText } from "./AppText";
import { Icon } from "./Icon";

type UserAvatarProps = {
  /** Resolved avatar (mascot, photo or initial). Takes precedence over `imageUrl`. */
  avatar?: AvatarSource;
  imageUrl?: string | null;
  name?: string | null;
  size?: number;
};

export function UserAvatar({ avatar, imageUrl, name, size = 40 }: UserAvatarProps) {
  const initial = name?.trim().charAt(0).toUpperCase();
  const photo = avatar ? (avatar.kind === "photo" ? avatar.uri : null) : imageUrl;
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      {avatar?.kind === "mascot" ? (
        <Image source={avatar.source} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} accessible={false} />
      ) : photo ? (
        <Image source={{ uri: photo }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} accessible={false} />
      ) : initial ? (
        <AppText style={{ fontFamily: fontFamilies.semibold, fontSize: size * 0.42, color: colors.text.inverse }}>{initial}</AppText>
      ) : (
        <Icon name="person" size={size * 0.5} color={colors.text.inverse} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundImage: themed("linear-gradient(135deg, #DDD6FE 0%, #A78BFA 100%)"),
    borderWidth: 1,
    borderColor: themed("rgba(221, 214, 254, 0.6)"),
    boxShadow: themed("0px 0px 14px rgba(167, 139, 250, 0.45)"),
  },
});
