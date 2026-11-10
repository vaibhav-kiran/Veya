import { useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";

import { haptics } from "@/lib/haptics";
import { colors, fontFamilies, gradients, shadows, spacing, themed } from "@/theme";

import { Icon } from "../Icon";
import { PressableScale } from "../PressableScale";

type ChatComposerProps = {
  value: string;
  onChangeText: (value: string) => void;
  onSend: () => void;
  canSend: boolean;
  sending: boolean;
};

/** Glass message box that glows while focused, with a gradient send button. */
export function ChatComposer({ value, onChangeText, onSend, canSend, sending }: ChatComposerProps) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.composer, focused && styles.focused]}>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder="Message Veya…"
        placeholderTextColor={colors.text.muted}
        selectionColor={colors.veya.violet}
        cursorColor={colors.veya.lavender}
        keyboardAppearance="dark"
        multiline
        maxLength={4000}
        accessibilityLabel="Message"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={styles.input}
      />
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={sending ? "Sending" : "Send message"}
        accessibilityState={{ disabled: !canSend }}
        disabled={!canSend}
        pressedScale={0.9}
        onPress={() => {
          haptics.light();
          onSend();
        }}
        style={[styles.send, canSend ? styles.sendActive : styles.sendIdle]}
      >
        <Icon name="arrowUp" size={18} color={canSend ? colors.text.inverse : colors.text.muted} weight="semibold" />
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing[2],
    padding: 6,
    paddingLeft: spacing[4],
    borderRadius: 26,
    borderWidth: 1,
    borderColor: themed("rgba(196, 181, 253, 0.22)"),
    backgroundColor: themed("rgba(20, 18, 34, 0.92)"),
    boxShadow: "0px 10px 30px rgba(0, 0, 0, 0.45)",
  },
  focused: { borderColor: themed("rgba(196, 181, 253, 0.6)"), boxShadow: `${shadows.selectedGlow}, 0px 10px 30px rgba(0, 0, 0, 0.45)` },
  input: {
    flex: 1,
    maxHeight: 140,
    minHeight: 40,
    paddingTop: 10,
    paddingBottom: 10,
    color: colors.text.primary,
    fontFamily: fontFamilies.regular,
    fontSize: 16,
  },
  send: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  sendActive: { backgroundImage: gradients.primaryButton, boxShadow: shadows.buttonGlow },
  sendIdle: { backgroundColor: colors.overlay.surfaceRaised, borderWidth: 1, borderColor: colors.overlay.borderStrong },
});
