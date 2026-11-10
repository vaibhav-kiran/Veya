import { Image } from "expo-image";
import { StyleSheet, View } from "react-native";

import { LOGO_MARK } from "@/constants/brandAssets";
import { fontFamilies, themed } from "@/theme";

import { AppText } from "./AppText";

type VeyaLogoProps = {
  size?: "small" | "medium" | "large";
  showTagline?: boolean;
};

const sizes = {
  small: { mark: 30, word: 18, gap: 8 },
  medium: { mark: 38, word: 22, gap: 10 },
  large: { mark: 52, word: 30, gap: 12 },
} as const;

/** Veya's logo mark + spaced "VEYA" wordmark. */
export function VeyaLogo({ size = "medium", showTagline = false }: VeyaLogoProps) {
  const dimensions = sizes[size];
  return (
    <View accessible accessibilityRole="header" accessibilityLabel="Veya" style={styles.container}>
      <View style={[styles.row, { gap: dimensions.gap }]}>
        <View style={[styles.markGlow, { borderRadius: dimensions.mark * 0.22 }]}>
          <Image
            source={LOGO_MARK}
            style={{ width: dimensions.mark, height: dimensions.mark }}
            contentFit="contain"
            accessible={false}
          />
        </View>
        <AppText
          style={{
            fontFamily: fontFamilies.medium,
            fontSize: dimensions.word,
            lineHeight: dimensions.word * 1.2,
            letterSpacing: dimensions.word * 0.14,
          }}
        >
          VEYA
        </AppText>
      </View>
      {showTagline ? (
        <AppText variant="bodySmall" tone="secondary" style={styles.tagline}>
          Think it. Speak it. Build it.
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: "center" },
  row: { flexDirection: "row", alignItems: "center" },
  markGlow: { boxShadow: themed("0px 0px 18px rgba(196, 181, 253, 0.45)") },
  tagline: { marginTop: 6 },
});
