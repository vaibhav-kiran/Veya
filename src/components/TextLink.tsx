import { Pressable, type StyleProp, type ViewStyle } from "react-native";

import { fontFamilies } from "@/theme";

import { AppText } from "./AppText";

type TextLinkProps = {
  prefix?: string;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** "New to Veya? Create an account" style inline link with a comfortable hit area. */
export function TextLink({ prefix, label, onPress, disabled, style }: TextLinkProps) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={prefix ? `${prefix} ${label}` : label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={10}
      style={({ pressed }) => [{ minHeight: 32, justifyContent: "center", opacity: pressed ? 0.6 : 1 }, style]}
    >
      <AppText variant="bodyMedium" tone="secondary">
        {prefix ? `${prefix} ` : ""}
        <AppText variant="bodyMedium" tone="accent" style={{ fontFamily: fontFamilies.semibold }}>
          {label}
        </AppText>
      </AppText>
    </Pressable>
  );
}
