import { Stack } from "expo-router";

import { colors } from "@/theme";

export default function IdeasLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.veya.background },
        // Same as the main stack: screens just appear.
        animation: "none",
      }}
    />
  );
}
