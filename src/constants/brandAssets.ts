import { ACTIVE_THEME, type ThemeId } from "@/theme";

/**
 * Veya's logo images in each colour theme (recoloured with the same mapping as
 * the app's colours). The app shows the set for the theme it is drawn in, so
 * onboarding and sign-in use the original violet logo.
 */
const LOGO_MARKS: Record<ThemeId, number> = {
  violet: require("../../assets/images/veya-logo-mark.png"),
  graphite: require("../../assets/images/veya-logo-mark-graphite.png"),
  emerald: require("../../assets/images/veya-logo-mark-emerald.png"),
};

const ORBS: Record<ThemeId, number> = {
  violet: require("../../assets/images/veya-orb.png"),
  graphite: require("../../assets/images/veya-orb-graphite.png"),
  emerald: require("../../assets/images/veya-orb-emerald.png"),
};

/** The logo mark (rounded tile) for the active theme. */
export const LOGO_MARK = LOGO_MARKS[ACTIVE_THEME];

/** Veya's glowing orb (chat avatar) for the active theme. */
export const VEYA_ORB = ORBS[ACTIVE_THEME];
