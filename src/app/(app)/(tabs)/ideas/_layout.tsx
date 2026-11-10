import { Stack } from "expo-router";

import { colors } from "@/theme";

export default function IdeasLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.veya.background },
        animation: "slide_from_right",
      }}
    />
  );
}
