import { Image } from "expo-image";
import { StyleSheet, View } from "react-native";

import { VEYA_ORB } from "@/constants/brandAssets";
import { themed } from "@/theme";

/** Veya's glowing orb (from the logo), shown beside replies and the typing indicator. */
export function VeyaAvatar({ size = 30 }: { size?: number }) {
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <Image source={VEYA_ORB} style={StyleSheet.absoluteFill} contentFit="cover" accessible={false} />
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    overflow: "hidden",
    boxShadow: themed("0px 0px 14px rgba(196, 181, 253, 0.6)"),
  },
});
