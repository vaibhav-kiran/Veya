import { StyleSheet, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

import { checkPassword, type PasswordRequirements } from "@/lib/passwordRequirements";
import { colors, fontFamilies, spacing } from "@/theme";

import { AppText } from "./AppText";
import { Icon } from "./Icon";

/**
 * Clerk's password rules under the password field, each ticking off as the
 * user types, plus a reminder that common or leaked passwords are refused.
 */
export function PasswordRequirementsList({ password, requirements }: { password: string; requirements: PasswordRequirements }) {
  const checks = checkPassword(password, requirements);

  return (
    <Animated.View entering={FadeIn.duration(200)} style={styles.root} accessibilityLabel="Password requirements">
      {checks.map((check) => (
        <View key={check.key} style={styles.row} accessible accessibilityLabel={`${check.label}: ${check.met ? "done" : "not yet"}`}>
          <Icon name={check.met ? "checkCircle" : "circle"} size={14} color={check.met ? colors.semantic.success : colors.text.muted} />
          <AppText style={[styles.text, check.met && styles.met]}>{check.label}</AppText>
        </View>
      ))}
      {requirements.rejectsBreached ? (
        <AppText style={styles.note}>Avoid common or reused passwords; Clerk blocks ones found in data breaches.</AppText>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 6, marginTop: -spacing[1] },
  row: { flexDirection: "row", alignItems: "center", gap: spacing[2] },
  text: { fontFamily: fontFamilies.regular, fontSize: 13, lineHeight: 18, color: colors.text.secondary },
  met: { color: colors.text.primary },
  note: { fontFamily: fontFamilies.regular, fontSize: 12, lineHeight: 16, color: colors.text.muted, marginTop: 2 },
});
