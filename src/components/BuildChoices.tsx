import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { haptics } from "@/lib/haptics";
import { colors, fontFamilies, radii, spacing, themed } from "@/theme";
import type { IdeaCheck, IdeaChoice } from "@/types/api";

import { AppText } from "./AppText";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { TextLink } from "./TextLink";

/** How Veya says each idea out loud, so the screen matches what the student heard. */
const ORDINAL = ["First", "Second", "Third", "Fourth", "Fifth"];

type Option = { choice: IdeaChoice; title: string; description?: string; tag?: string };

function optionsFor(check: IdeaCheck): Option[] {
  const options: Option[] = [{ choice: "as_is", title: "Build it as it is", description: "Keep the idea exactly as you described it." }];
  check.angles.forEach((angle, index) =>
    options.push({
      choice: `angle:${index}` as IdeaChoice,
      title: angle.title,
      description: angle.description,
      tag: `${ORDINAL[index] ?? `#${index + 1}`} idea to stand out`,
    }),
  );
  if (check.feasibility.smaller_version) {
    options.push({ choice: "smaller", title: "The smaller version", description: check.feasibility.smaller_version, tag: "Fits your time better" });
  }
  return options;
}

type BuildChoicesProps = {
  check: IdeaCheck;
  onBuild: (choice: IdeaChoice) => void;
  /** Opens the full Idea Check (similar projects with links, feasibility). */
  onSeeDetails?: () => void;
  disabled?: boolean;
};

/**
 * After the summary and Idea Check: tick how to build the project, then
 * Build. Shown on the Talk and Chat screens, so the student can pick here
 * instead of remembering "the second one" from what Veya said.
 */
export function BuildChoices({ check, onBuild, onSeeDetails, disabled = false }: BuildChoicesProps) {
  const options = optionsFor(check);
  const [selected, setSelected] = useState<IdeaChoice>("as_is");

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Icon name="sparkle" size={14} color={colors.veya.lavender} />
        <AppText variant="h4" style={styles.flex}>
          How should I build it?
        </AppText>
      </View>
      <AppText variant="caption" tone="secondary">
        Tick one, or just say it. You can only pick one.
      </AppText>

      <View accessibilityRole="radiogroup" style={styles.options}>
        {options.map((option) => {
          const checked = option.choice === selected;
          return (
            <Pressable
              key={option.choice}
              accessibilityRole="radio"
              accessibilityState={{ checked, disabled }}
              accessibilityLabel={`${option.tag ? `${option.tag}: ` : ""}${option.title}`}
              disabled={disabled}
              onPress={() => {
                haptics.selection();
                setSelected(option.choice);
              }}
              style={[styles.option, checked && styles.optionChecked]}
            >
              <View style={[styles.box, checked && styles.boxChecked]}>
                {checked ? <Icon name="check" size={12} color={colors.text.primary} weight="semibold" /> : null}
              </View>
              <View style={styles.flex}>
                {option.tag ? (
                  <AppText variant="caption" tone={checked ? "accent" : "muted"}>
                    {option.tag}
                  </AppText>
                ) : null}
                <AppText variant="bodyMedium" style={styles.title}>
                  {option.title}
                </AppText>
                {option.description ? (
                  <AppText variant="caption" tone="secondary" numberOfLines={checked ? undefined : 2}>
                    {option.description}
                  </AppText>
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>

      <Button label="Build my project" icon="build" iconPosition="left" size="small" disabled={disabled} onPress={() => onBuild(selected)} />
      {onSeeDetails ? <TextLink label="See the full idea check" onPress={onSeeDetails} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignSelf: "stretch",
    gap: spacing[2],
    padding: spacing[3],
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.overlay.lavenderBorder,
    backgroundColor: themed("rgba(22, 20, 36, 0.92)"),
  },
  header: { flexDirection: "row", alignItems: "center", gap: spacing[2] },
  flex: { flex: 1 },
  options: { gap: spacing[2] },
  option: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing[3],
    padding: spacing[3],
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.overlay.borderStrong,
  },
  optionChecked: { borderColor: colors.veya.violet, backgroundColor: colors.overlay.lavenderSoft },
  box: {
    width: 20,
    height: 20,
    marginTop: 2,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: colors.overlay.borderStrong,
    backgroundColor: colors.overlay.surfaceRaised,
    alignItems: "center",
    justifyContent: "center",
  },
  boxChecked: { backgroundColor: colors.veya.purple, borderColor: colors.veya.violet },
  title: { fontFamily: fontFamilies.medium },
});
