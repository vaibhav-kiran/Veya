import { Text, type TextProps } from "react-native";

import { colors, typography } from "@/theme";

export type TextVariant = keyof typeof typography;

const toneColors = {
  primary: colors.text.primary,
  secondary: colors.text.secondary,
  muted: colors.text.muted,
  inverse: colors.text.inverse,
  accent: colors.veya.lavender,
  error: colors.semantic.error,
  success: colors.semantic.success,
  warning: colors.semantic.warning,
} as const;

export type TextTone = keyof typeof toneColors;

type AppTextProps = TextProps & {
  variant?: TextVariant;
  tone?: TextTone;
  align?: "left" | "center" | "right";
};

/** Text with Veya's type scale and colour tones applied (Inter, loaded natively). */
export function AppText({ variant = "bodyMedium", tone = "primary", align, style, ...rest }: AppTextProps) {
  return (
    <Text
      maxFontSizeMultiplier={1.6}
      {...rest}
      style={[typography[variant], { color: toneColors[tone] }, align ? { textAlign: align } : null, style]}
    />
  );
}
