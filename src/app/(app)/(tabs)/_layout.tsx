import { Tabs } from "expo-router/js-tabs";

import { BottomTabBar } from "@/components/BottomTabBar";
import { colors } from "@/theme";

/** Talk (voice home) · Your Ideas · Calendar · Settings. */
export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <BottomTabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.veya.background } }}
    >
      <Tabs.Screen name="talk" options={{ title: "Talk" }} />
      <Tabs.Screen name="ideas" options={{ title: "Your Ideas" }} />
      <Tabs.Screen name="timeline" options={{ title: "Calendar" }} />
      <Tabs.Screen name="settings" options={{ title: "Settings" }} />
    </Tabs>
  );
}
