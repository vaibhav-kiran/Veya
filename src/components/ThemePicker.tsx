import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";

import { haptics } from "@/lib/haptics";
import { applyTheme, colors, fontFamilies, radii, SAVED_THEME, spacing, THEMES, type ThemeOption } from "@/theme";

import { AppText } from "./AppText";
import { FormMessage } from "./FormMessage";
import { Icon } from "./Icon";

/** A tiny mock screen in the theme's own colours. */
function Preview({ theme }: { theme: ThemeOption }) {
  const [background, surface, accent, highlight] = theme.swatches;
  return (
    <View style={[styles.preview, { backgroundColor: background }]}>
      <View style={[styles.previewCard, { backgroundColor: surface, borderColor: `${highlight}33` }]}>
        <View style={[styles.previewDot, { backgroundColor: highlight }]} />
        <View style={[styles.previewLine, { backgroundColor: `${highlight}66` }]} />
      </View>
      <View style={[styles.previewButton, { backgroundImage: `linear-gradient(90deg, ${accent} 0%, ${highlight} 100%)` }]} />
    </View>
  );
}

/**
 * Choose the app's colour theme. Tapping a theme applies it right away: it is
 * saved and Veya restarts for a moment so every screen is rebuilt in it.
 * (No confirmation pop-up — Alert does nothing on web.)
 */
export function ThemePicker() {
  const [applying, setApplying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const choose = async (theme: ThemeOption) => {
    if (theme.id === SAVED_THEME || applying) return;
    haptics.success();
    setError(null);
    setApplying(theme.id);
    try {
      await applyTheme(theme.id);
    } catch {
      setApplying(null);
      setError("Couldn't switch the theme. Please try again.");
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.row} accessibilityRole="radiogroup">
        {THEMES.map((theme) => {
          const selected = theme.id === SAVED_THEME;
          return (
            <Pressable
              key={theme.id}
              accessibilityRole="radio"
              accessibilityLabel={`${theme.name} theme. ${theme.description}`}
              accessibilityState={{ checked: selected, busy: applying === theme.id }}
              disabled={applying !== null}
              onPress={() => void choose(theme)}
              style={({ pressed }) => [styles.card, selected && styles.cardSelected, pressed && styles.pressed]}
            >
              <Preview theme={theme} />
              <View style={styles.label}>
                <AppText style={[styles.name, selected && styles.nameSelected]} numberOfLines={1}>
                  {theme.name}
                </AppText>
                {selected ? (
                  <View style={styles.check}>
                    <Icon name="check" size={9} color={colors.text.inverse} weight="semibold" />
                  </View>
                ) : applying === theme.id ? (
                  <ActivityIndicator size="small" color={colors.veya.lavender} />
                ) : null}
              </View>
              <AppText variant="caption" tone="muted" numberOfLines={2}>
                {applying === theme.id ? "Applying…" : theme.description}
              </AppText>
            </Pressable>
          );
        })}
      </View>
      <AppText variant="caption" tone="muted">
        Tap a theme to apply it. Veya restarts for a moment to recolour every screen.
      </AppText>
      <FormMessage message={error} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing[2] },
  row: { flexDirection: "row", gap: spacing[3] },
  card: {
    flex: 1,
    gap: spacing[2],
    padding: spacing[2],
    paddingBottom: spacing[3],
    borderRadius: radii.lg,
    borderWidth: 1.5,
    borderColor: colors.veya.border,
    backgroundColor: colors.veya.surface,
  },
  cardSelected: { borderColor: colors.veya.lavender, boxShadow: `0px 0px 14px ${colors.overlay.violetGlow}` },
  pressed: { opacity: 0.8 },
  preview: { height: 64, borderRadius: radii.md, padding: 8, gap: 6, overflow: "hidden" },
  previewCard: { flexDirection: "row", alignItems: "center", gap: 5, padding: 6, borderRadius: 6, borderWidth: 1 },
  previewDot: { width: 8, height: 8, borderRadius: 4 },
  previewLine: { flex: 1, height: 4, borderRadius: 2 },
  previewButton: { height: 10, borderRadius: 5 },
  label: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 2 },
  name: { flexShrink: 1, fontFamily: fontFamilies.semibold, fontSize: 14, lineHeight: 19, color: colors.text.primary },
  nameSelected: { color: colors.veya.lavender },
  check: { width: 15, height: 15, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: colors.veya.lavender },
});
