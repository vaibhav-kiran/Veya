import type { BottomTabBarProps } from "expo-router/js-tabs";
import { Pressable, StyleSheet, View } from "react-native";

import { haptics } from "@/lib/haptics";
import { colors, gradients, spacing, themed } from "@/theme";

import { AppText } from "./AppText";
import { Icon, type IconName } from "./Icon";

const TAB_ICONS: Record<string, IconName> = {
  talk: "mic",
  innovator: "flask",
  ideas: "idea",
  timeline: "calendar",
  settings: "settings",
};

/** Bottom navigation: Talk · Innovator · Your Ideas · Calendar · Settings. */
export function BottomTabBar({ state, descriptors, emitter, navigateToTab, insets }: BottomTabBarProps) {
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, spacing[3]) }]} role="tablist">
      {state.routes.map((route, index) => {
        const focused = index === state.index;
        const { options } = descriptors[route.key];
        const label = options.title ?? route.name;
        const tint = focused ? colors.veya.lavender : colors.text.secondary;

        const onPress = () => {
          const event = emitter.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
          if (!focused) haptics.selection();
          if (!focused && !event.defaultPrevented) navigateToTab(route.key);
        };

        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityLabel={`${label}, tab ${index + 1} of ${state.routes.length}`}
            accessibilityState={{ selected: focused }}
            onPress={onPress}
            onLongPress={() => emitter.emit({ type: "tabLongPress", target: route.key })}
            style={styles.item}
          >
            <View style={[styles.iconWrap, focused && styles.iconActive]}>
              <Icon name={TAB_ICONS[route.name] ?? "circle"} size={22} color={tint} weight={focused ? "medium" : "regular"} />
            </View>
            <AppText variant="caption" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={[styles.label, { color: tint }]}>
              {label.toUpperCase()}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    paddingTop: spacing[2],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.veya.border,
    backgroundColor: colors.veya.background,
    backgroundImage: gradients.tabBar,
  },
  item: { flex: 1, alignItems: "center", justifyContent: "center", minHeight: 52, gap: 3 },
  iconWrap: { width: 40, height: 30, alignItems: "center", justifyContent: "center", borderRadius: 15 },
  iconActive: { boxShadow: themed("0px 0px 16px rgba(196, 181, 253, 0.45)"), backgroundColor: colors.overlay.lavenderSoft },
  label: { letterSpacing: 0.4, paddingHorizontal: 2 },
});
