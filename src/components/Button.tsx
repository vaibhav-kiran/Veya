import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { haptics } from "@/lib/haptics";
import { colors, gradients, minTouchTarget, radii, shadows, spacing } from "@/theme";

import { AppText } from "./AppText";
import { Icon, type IconName } from "./Icon";
import { PressableScale } from "./PressableScale";

type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  icon?: IconName;
  /** Position of the icon relative to the label. */
  iconPosition?: "left" | "right";
  loading?: boolean;
  disabled?: boolean;
  /** Use the tall, uppercase hero style from onboarding. */
  size?: "default" | "large" | "small";
  uppercase?: boolean;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
};

export function Button({
  label,
  onPress,
  variant = "primary",
  icon,
  iconPosition = "right",
  loading = false,
  disabled = false,
  size = "default",
  uppercase = false,
  accessibilityHint,
  style,
}: ButtonProps) {
  const inactive = disabled || loading;
  const foreground =
    variant === "primary" ? colors.text.inverse : variant === "destructive" ? colors.semantic.error : colors.text.primary;
  const iconNode = icon ? <Icon name={icon} size={size === "small" ? 16 : 18} color={foreground} weight="medium" /> : null;

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={() => {
        haptics.light();
        onPress();
      }}
      style={[
        styles.base,
        size === "large" && styles.large,
        size === "small" && styles.small,
        variantStyles[variant],
        inactive && styles.inactive,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={foreground} />
      ) : (
        <View style={styles.content}>
          {iconPosition === "left" ? iconNode : null}
          <AppText
            variant="button"
            style={[{ color: foreground }, size === "small" && styles.smallLabel, uppercase && styles.uppercase]}
          >
            {label}
          </AppText>
          {iconPosition === "right" ? iconNode : null}
        </View>
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 54,
    borderRadius: radii.full,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing[6],
  },
  large: { minHeight: 60, borderRadius: radii.lg + 4 },
  small: { minHeight: minTouchTarget - 8, paddingHorizontal: spacing[4] },
  content: { flexDirection: "row", alignItems: "center", gap: spacing[2] },
  smallLabel: { fontSize: 14 },
  uppercase: { textTransform: "uppercase", letterSpacing: 0.8 },
  inactive: { opacity: 0.5 },
});

const variantStyles = StyleSheet.create({
  primary: { backgroundImage: gradients.primaryButton, boxShadow: shadows.buttonGlow },
  secondary: {
    borderWidth: 1,
    borderColor: colors.overlay.borderStrong,
    backgroundColor: colors.overlay.surfaceRaised,
  },
  ghost: { backgroundColor: colors.overlay.lavenderSoft },
  destructive: { borderWidth: 1, borderColor: "rgba(255, 77, 79, 0.35)", backgroundColor: colors.overlay.errorSoft },
});
