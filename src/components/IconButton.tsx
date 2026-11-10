import { StyleSheet, type StyleProp, type ViewStyle } from "react-native";

import { haptics } from "@/lib/haptics";
import { colors, minTouchTarget, radii } from "@/theme";

import { Icon, type IconName } from "./Icon";
import { PressableScale } from "./PressableScale";

type IconButtonProps = {
  icon: IconName;
  accessibilityLabel: string;
  onPress: () => void;
  size?: number;
  variant?: "glass" | "plain" | "accent";
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function IconButton({
  icon,
  accessibilityLabel,
  onPress,
  size = 40,
  variant = "glass",
  disabled,
  style,
}: IconButtonProps) {
  const color = variant === "accent" ? colors.text.inverse : colors.text.primary;
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      hitSlop={Math.max(0, (minTouchTarget - size) / 2)}
      pressedScale={0.92}
      onPress={() => {
        haptics.selection();
        onPress();
      }}
      style={[
        styles.base,
        { width: size, height: size },
        variant === "glass" && styles.glass,
        variant === "accent" && styles.accent,
        disabled && styles.disabled,
        style,
      ]}
    >
      <Icon name={icon} size={Math.round(size * 0.45)} color={color} weight="medium" />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: radii.full, alignItems: "center", justifyContent: "center" },
  glass: {
    backgroundColor: colors.overlay.surfaceGlass,
    borderWidth: 1,
    borderColor: colors.overlay.borderStrong,
  },
  accent: { backgroundColor: colors.veya.lavender },
  disabled: { opacity: 0.4 },
});
