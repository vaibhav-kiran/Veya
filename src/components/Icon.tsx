import { SymbolView, type SymbolViewProps } from "expo-symbols";
import type { ColorValue, StyleProp, ViewStyle } from "react-native";

import { colors } from "@/theme";

/**
 * Semantic icon names mapped to SF Symbols (iOS) and Material Symbols
 * (Android/web), both rendered by expo-symbols — no extra icon library.
 */
const iconMap = {
  idea: { ios: "lightbulb", android: "lightbulb" },
  ideaFilled: { ios: "lightbulb.fill", android: "lightbulb" },
  calendar: { ios: "calendar", android: "calendar_month" },
  settings: { ios: "gearshape", android: "settings" },
  star: { ios: "star", android: "star" },
  rocket: { ios: "paperplane", android: "rocket_launch" },
  trophy: { ios: "trophy", android: "trophy" },
  brain: { ios: "brain.head.profile", android: "psychology" },
  document: { ios: "doc.text", android: "description" },
  mic: { ios: "mic.fill", android: "mic" },
  stop: { ios: "stop.fill", android: "stop" },
  chevronLeft: { ios: "chevron.left", android: "chevron_left" },
  chevronRight: { ios: "chevron.right", android: "chevron_right" },
  chevronDown: { ios: "chevron.down", android: "expand_more" },
  close: { ios: "xmark", android: "close" },
  check: { ios: "checkmark", android: "check" },
  checkCircle: { ios: "checkmark.circle.fill", android: "check_circle" },
  circle: { ios: "circle", android: "radio_button_unchecked" },
  eye: { ios: "eye", android: "visibility" },
  eyeOff: { ios: "eye.slash", android: "visibility_off" },
  plus: { ios: "plus", android: "add" },
  person: { ios: "person.fill", android: "person" },
  arrowRight: { ios: "arrow.right", android: "arrow_forward" },
  arrowUp: { ios: "arrow.up", android: "arrow_upward" },
  waveform: { ios: "waveform", android: "graphic_eq" },
  checklist: { ios: "checklist", android: "checklist" },
  edit: { ios: "pencil", android: "edit" },
  trash: { ios: "trash", android: "delete" },
  retry: { ios: "arrow.clockwise", android: "refresh" },
  keyboard: { ios: "keyboard", android: "keyboard" },
  flag: { ios: "flag.fill", android: "flag" },
  warning: { ios: "exclamationmark.triangle", android: "warning" },
  sparkle: { ios: "sparkle", android: "star_shine" },
  signOut: { ios: "rectangle.portrait.and.arrow.right", android: "logout" },
  folder: { ios: "folder", android: "folder" },
  mail: { ios: "envelope", android: "mail" },
  clock: { ios: "clock", android: "schedule" },
  chat: { ios: "text.bubble", android: "chat" },
  save: { ios: "square.and.arrow.down", android: "save" },
  target: { ios: "target", android: "target" },
  people: { ios: "person.2", android: "group" },
  list: { ios: "list.bullet", android: "list" },
  build: { ios: "hammer", android: "construction" },
  language: { ios: "globe", android: "language" },
  micOff: { ios: "mic.slash", android: "mic_off" },
  share: { ios: "square.and.arrow.up", android: "share" },
  image: { ios: "photo", android: "image" },
} as const satisfies Record<string, NonNullable<Extract<SymbolViewProps["name"], object>>>;

export type IconName = keyof typeof iconMap;

type IconProps = {
  name: IconName;
  size?: number;
  color?: ColorValue;
  weight?: "light" | "regular" | "medium" | "semibold";
  style?: StyleProp<ViewStyle>;
};

export function Icon({ name, size = 22, color = colors.text.primary, weight = "regular", style }: IconProps) {
  return (
    <SymbolView
      // Web renders Material Symbols too, so it reuses the Android names.
      name={{ ...iconMap[name], web: iconMap[name].android }}
      size={size}
      tintColor={color}
      weight={weight}
      style={style}
      accessible={false}
      importantForAccessibility="no"
    />
  );
}
