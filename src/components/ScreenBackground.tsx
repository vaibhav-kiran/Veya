import type { ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { colors, gradients } from "@/theme";

type ScreenBackgroundProps = {
  children: ReactNode;
  /** "top" mirrors the soft indigo light at the top of the references; "center" adds a glow behind hero art. */
  glow?: "top" | "center" | "none";
  style?: StyleProp<ViewStyle>;
};

/** Near-black canvas with restrained ambient lighting. */
export function ScreenBackground({ children, glow = "top", style }: ScreenBackgroundProps) {
  return (
    <View style={[styles.root, style]}>
      {glow !== "none" ? (
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundImage: glow === "top" ? gradients.ambientTop : gradients.ambientCenter }]}
        />
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.veya.background },
});
