/**
 * Veya palette. The brand, semantic and neutral values come from the design
 * system reference (01-design-system.png / veya_design_system.md).
 */
import { themed } from "./themes";

/** Written in Veya's original violet; `themed` maps brand colours to the chosen theme at start-up. */
const baseColors = {
  veya: {
    lavender: "#C4B5FD",
    violet: "#A78BFA",
    purple: "#7C3AED",
    indigo: "#1E1B4B",
    background: "#08080C",
    surface: "#0F0E17",
    border: "#1E1B2E",
  },
  semantic: {
    success: "#21C16B",
    warning: "#FFC800",
    streak: "#FF8A00",
    error: "#FF4D4F",
    info: "#4D8BFF",
  },
  text: {
    primary: "#FFFFFF",
    secondary: "#A1A1AA",
    /** Derived: placeholders, disabled labels and out-of-month dates. */
    muted: "#6B6B78",
    /** Text placed on lavender/violet fills (buttons, selected chips). */
    inverse: "#0F0E17",
  },
  /** Derived translucent layers used for glass panels and selected states. */
  overlay: {
    surfaceGlass: "rgba(22, 20, 36, 0.72)",
    surfaceRaised: "#15131F",
    borderStrong: "#2C2840",
    lavenderSoft: "rgba(196, 181, 253, 0.12)",
    lavenderBorder: "rgba(196, 181, 253, 0.55)",
    violetGlow: "rgba(167, 139, 250, 0.45)",
    errorSoft: "rgba(255, 77, 79, 0.12)",
    scrim: "rgba(8, 8, 12, 0.72)",
  },
} as const;

type Themed<T> = { readonly [K in keyof T]: T[K] extends string ? string : Themed<T[K]> };

function themeAll<T extends Record<string, unknown>>(value: T): Themed<T> {
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, typeof entry === "string" ? themed(entry) : themeAll(entry as Record<string, unknown>)]),
  ) as Themed<T>;
}

export const colors = themeAll(baseColors);

