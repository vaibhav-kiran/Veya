import { StyleSheet, View } from "react-native";

import { haptics } from "@/lib/haptics";
import { colors, fontFamilies, radii, spacing, themed } from "@/theme";

import { AppText } from "./AppText";
import { Icon } from "./Icon";
import { PressableScale } from "./PressableScale";

type LanguageOptionProps = {
  label: string;
  /** Name in its own script, or a short explanation (e.g. "Hindi + English"). */
  detail?: string;
  /** A letter from the language's script. */
  glyph: string;
  selected: boolean;
  onPress: () => void;
};

/** Language tile: script glyph, English name, native name; glows with a check when selected. */
export function LanguageOption({ label, detail, glyph, selected, onPress }: LanguageOptionProps) {
  return (
    <PressableScale
      accessibilityRole="radio"
      accessibilityLabel={detail ? `${label}, ${detail}` : label}
      accessibilityState={{ checked: selected }}
      onPress={() => {
        if (!selected) haptics.selection();
        onPress();
      }}
      pressedScale={0.96}
      style={[styles.tile, selected && styles.selected]}
    >
      <View style={[styles.glyph, selected && styles.glyphSelected]}>
        <AppText style={[styles.glyphText, glyph.length > 1 && styles.glyphTextSmall]} numberOfLines={1}>
          {glyph}
        </AppText>
      </View>
      <View style={styles.text}>
        <AppText style={[styles.label, selected && styles.labelSelected]} numberOfLines={1}>
          {label}
        </AppText>
        {detail ? (
          <AppText style={styles.detail} numberOfLines={1}>
            {detail}
          </AppText>
        ) : null}
      </View>
      {selected ? (
        <View style={styles.check}>
          <Icon name="check" size={10} color={colors.text.inverse} weight="semibold" />
        </View>
      ) : null}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    paddingHorizontal: spacing[3],
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: themed("rgba(196, 181, 253, 0.12)"),
    backgroundColor: "rgba(255, 255, 255, 0.03)",
  },
  selected: {
    borderColor: themed("rgba(196, 181, 253, 0.7)"),
    backgroundImage: themed("linear-gradient(135deg, rgba(167, 139, 250, 0.28) 0%, rgba(124, 58, 237, 0.18) 100%)"),
    boxShadow: themed("0px 0px 18px rgba(167, 139, 250, 0.35)"),
  },
  glyph: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: themed("rgba(196, 181, 253, 0.08)"),
    borderWidth: 1,
    borderColor: themed("rgba(196, 181, 253, 0.14)"),
  },
  glyphSelected: {
    borderColor: themed("rgba(237, 233, 254, 0.6)"),
    backgroundImage: themed("radial-gradient(circle at 40% 30%, #EDE9FE 0%, #A78BFA 55%, #6D28D9 100%)"),
    boxShadow: themed("0px 0px 14px rgba(196, 181, 253, 0.6)"),
  },
  glyphText: { fontSize: 18, lineHeight: 24, color: colors.text.primary, fontFamily: fontFamilies.semibold },
  glyphTextSmall: { fontSize: 14, lineHeight: 20 },
  text: { flex: 1, gap: 1 },
  label: { fontFamily: fontFamilies.medium, fontSize: 15, lineHeight: 20, color: colors.text.primary },
  labelSelected: { fontFamily: fontFamilies.semibold },
  detail: { fontFamily: fontFamilies.regular, fontSize: 12.5, lineHeight: 17, color: colors.text.secondary },
  check: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.veya.lavender,
  },
});
