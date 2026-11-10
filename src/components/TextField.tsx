import { useState, type Ref } from "react";
import { Pressable, StyleSheet, TextInput, View, type TextInputInstance, type TextInputProps } from "react-native";

import { colors, fontFamilies, radii, shadows, spacing } from "@/theme";

import { AppText } from "./AppText";
import { Icon } from "./Icon";

type TextFieldProps = Omit<TextInputProps, "style" | "ref"> & {
  ref?: Ref<TextInputInstance>;
  /** Visible label above the field. When omitted, the placeholder is used as the accessible label. */
  label?: string;
  error?: string | null;
  /** Adds a show/hide toggle for password fields. */
  secureToggle?: boolean;
  minHeight?: number;
};

export function TextField({
  ref,
  label,
  error,
  secureToggle = false,
  secureTextEntry,
  multiline,
  minHeight,
  onFocus,
  onBlur,
  ...inputProps
}: TextFieldProps) {
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(true);
  const isSecure = secureToggle ? hidden : secureTextEntry;

  return (
    <View style={styles.wrapper}>
      {label ? (
        <AppText variant="bodySmall" tone="secondary" style={styles.label}>
          {label}
        </AppText>
      ) : null}
      <View
        style={[
          styles.field,
          multiline && styles.multiline,
          minHeight ? { minHeight } : null,
          focused && styles.focused,
          !!error && styles.errored,
        ]}
      >
        <TextInput
          ref={ref}
          accessibilityLabel={label ?? inputProps.placeholder}
          placeholderTextColor={colors.text.muted}
          selectionColor={colors.veya.violet}
          cursorColor={colors.veya.lavender}
          keyboardAppearance="dark"
          secureTextEntry={isSecure}
          multiline={multiline}
          textAlignVertical={multiline ? "top" : "center"}
          {...inputProps}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          style={[styles.input, multiline && styles.inputMultiline]}
        />
        {secureToggle ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={hidden ? "Show password" : "Hide password"}
            onPress={() => setHidden((value) => !value)}
            hitSlop={12}
            style={styles.toggle}
          >
            <Icon name={hidden ? "eyeOff" : "eye"} size={20} color={colors.text.secondary} />
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <View style={styles.errorRow} accessibilityLiveRegion="polite">
          <Icon name="warning" size={13} color={colors.semantic.error} />
          <AppText variant="bodySmall" tone="error" style={styles.errorText}>
            {error}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: spacing[1] + 2 },
  label: { fontFamily: fontFamilies.medium },
  field: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radii.md + 2,
    borderWidth: 1,
    borderColor: colors.overlay.borderStrong,
    backgroundColor: colors.overlay.surfaceRaised,
    paddingHorizontal: spacing[4],
  },
  multiline: { alignItems: "flex-start", paddingVertical: spacing[3] },
  focused: { borderColor: colors.overlay.lavenderBorder, boxShadow: shadows.selectedGlow },
  errored: { borderColor: colors.semantic.error },
  input: {
    flex: 1,
    color: colors.text.primary,
    fontFamily: fontFamilies.regular,
    fontSize: 15,
    paddingVertical: spacing[3],
  },
  inputMultiline: { paddingVertical: 0, minHeight: 72 },
  toggle: { paddingLeft: spacing[2] },
  errorRow: { flexDirection: "row", alignItems: "center", gap: spacing[1] + 2 },
  errorText: { flex: 1 },
});
