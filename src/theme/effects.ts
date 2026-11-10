import { colors } from "./colors";
import { themed } from "./themes";

/**
 * Gradients and glows rendered natively via React Native's `backgroundImage`
 * and `boxShadow` style props (New Architecture). Kept restrained on purpose:
 * lavender emphasis is reserved for primary actions and the voice orb.
 */
export const gradients = {
  primaryButton: themed(`linear-gradient(90deg, ${colors.veya.violet} 0%, ${colors.veya.lavender} 100%)`),
  ambientTop: themed(`radial-gradient(ellipse 120% 55% at 50% 0%, rgba(30, 27, 75, 0.9) 0%, rgba(8, 8, 12, 0) 70%)`),
  ambientCenter: themed(`radial-gradient(circle at 50% 42%, rgba(124, 58, 237, 0.22) 0%, rgba(8, 8, 12, 0) 60%)`),
  orbCore: themed(`radial-gradient(circle at 38% 30%, rgba(237, 233, 254, 0.55) 0%, rgba(196, 181, 253, 0.35) 30%, rgba(124, 58, 237, 0.35) 70%, rgba(30, 27, 75, 0.6) 100%)`),
  orbGlass: themed(`radial-gradient(circle at 35% 25%, rgba(255, 255, 255, 0.28) 0%, rgba(196, 181, 253, 0.10) 45%, rgba(124, 58, 237, 0.08) 100%)`),
  orbError: themed(`radial-gradient(circle at 38% 30%, rgba(255, 220, 220, 0.35) 0%, rgba(255, 77, 79, 0.22) 45%, rgba(40, 12, 18, 0.7) 100%)`),
  tabBar: themed(`linear-gradient(180deg, rgba(15, 14, 23, 0.6) 0%, rgba(8, 8, 12, 0.98) 100%)`),
} as const;

export const shadows = {
  buttonGlow: themed(`0px 6px 24px ${colors.overlay.violetGlow}`),
  selectedGlow: themed(`0px 0px 14px rgba(167, 139, 250, 0.35)`),
  orbGlow: themed(`0px 0px 60px rgba(167, 139, 250, 0.55)`),
  orbGlowActive: themed(`0px 0px 90px rgba(196, 181, 253, 0.75)`),
  card: themed(`0px 10px 30px rgba(0, 0, 0, 0.45)`),
  fab: themed(`0px 8px 24px rgba(124, 58, 237, 0.45)`),
} as const;
