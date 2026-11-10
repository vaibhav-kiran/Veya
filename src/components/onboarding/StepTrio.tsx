import { Fragment } from "react";
import { StyleSheet, View } from "react-native";

import { colors, fontFamilies, themed } from "@/theme";

import { AppText } from "../AppText";
import { Icon, type IconName } from "../Icon";

export type OnboardingStep = { icon: IconName; label: string; caption: string };

/** "SPEAK → PLAN → BUILD" row from the onboarding reference. */
export function StepTrio({ steps }: { steps: readonly OnboardingStep[] }) {
  return (
    <View style={styles.row}>
      {steps.map((step, index) => (
        <Fragment key={step.label}>
          {index > 0 ? (
            <View style={styles.arrow}>
              <Icon name="arrowRight" size={13} color={colors.text.muted} />
            </View>
          ) : null}
          <View style={styles.step} accessible accessibilityLabel={`${step.label}. ${step.caption}`}>
            <Icon name={step.icon} size={24} color={themed("#DDD6FE")} weight="light" />
            <AppText style={styles.label}>{step.label.toUpperCase()}</AppText>
            <AppText style={styles.caption} numberOfLines={2}>
              {step.caption}
            </AppText>
          </View>
        </Fragment>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start" },
  step: { flex: 1, alignItems: "center", gap: 4 },
  arrow: { paddingTop: 6, width: 18, alignItems: "center" },
  label: { fontFamily: fontFamilies.bold, fontSize: 13, lineHeight: 17, letterSpacing: 0.4, color: colors.text.primary, marginTop: 4 },
  caption: { fontFamily: fontFamilies.regular, fontSize: 11.5, lineHeight: 15, color: colors.text.secondary, textAlign: "center" },
});
