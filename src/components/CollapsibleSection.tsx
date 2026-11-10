import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

import { haptics } from "@/lib/haptics";
import { colors, radii, spacing } from "@/theme";

import { AppText } from "./AppText";
import { Icon, type IconName } from "./Icon";

type CollapsibleSectionProps = {
  title: string;
  icon: IconName;
  content: string;
  placeholder: string;
  initiallyOpen?: boolean;
  /** Omit for read-only content (e.g. Veya's generated plan). */
  onEdit?: () => void;
};

/** Progressive disclosure for project sections: a one-line preview until expanded. */
export function CollapsibleSection({ title, icon, content, placeholder, initiallyOpen = false, onEdit }: CollapsibleSectionProps) {
  const [open, setOpen] = useState(initiallyOpen);
  const hasContent = content.trim().length > 0;

  return (
    <View style={styles.card}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ expanded: open }}
        accessibilityHint={open ? "Collapse section" : "Expand section"}
        onPress={() => {
          haptics.selection();
          setOpen((value) => !value);
        }}
        style={styles.header}
      >
        <Icon name={icon} size={18} color={hasContent ? colors.veya.lavender : colors.text.muted} />
        <View style={styles.headerText}>
          <AppText variant="h4">{title}</AppText>
          {!open ? (
            <AppText variant="bodySmall" tone={hasContent ? "secondary" : "muted"} numberOfLines={1}>
              {hasContent ? content : "Not written yet"}
            </AppText>
          ) : null}
        </View>
        <Icon name="chevronDown" size={14} color={colors.text.secondary} style={open ? styles.chevronOpen : undefined} />
      </Pressable>
      {open ? (
        <Animated.View entering={FadeIn.duration(180)} style={styles.body}>
          <AppText variant="bodyMedium" tone={hasContent ? "primary" : "muted"} selectable>
            {hasContent ? content : placeholder}
          </AppText>
          {onEdit ? (
            <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${title}`} onPress={onEdit} hitSlop={8} style={styles.edit}>
              <Icon name="edit" size={13} color={colors.veya.lavender} />
              <AppText variant="bodySmall" tone="accent">
                {hasContent ? "Edit" : "Write it"}
              </AppText>
            </Pressable>
          ) : null}
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.lg + 2,
    borderWidth: 1,
    borderColor: colors.veya.border,
    backgroundColor: colors.veya.surface,
  },
  header: { flexDirection: "row", alignItems: "center", gap: spacing[3], padding: spacing[4], minHeight: 56 },
  headerText: { flex: 1, gap: 2 },
  chevronOpen: { transform: [{ rotate: "180deg" }] },
  body: { paddingHorizontal: spacing[4], paddingBottom: spacing[4], gap: spacing[3] },
  edit: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", minHeight: 28 },
});
