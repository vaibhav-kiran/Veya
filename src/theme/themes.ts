import { reloadAppAsync } from "expo";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

/**
 * App colour themes.
 *
 * Every brand colour in the app is written in Veya's original violet. A theme
 * maps those violets to its own family at start-up — through `themed()` —
 * so one switch recolours buttons, glows, gradients, borders and the tinted
 * near-black backgrounds alike. Reds, whites, blacks and the blue info colour
 * are not brand colours and stay as they are.
 *
 * React Native builds styles once when the app loads, so a theme change is
 * saved and the app restarts to apply it everywhere.
 *
 * The chosen theme is for the signed-in app only. Onboarding and the sign-in
 * screens always use the original Violet: the app starts in the user's theme
 * only when the previous run ended signed in, and restarts once when the user
 * signs in or out (see syncThemeWithSession).
 */
export type ThemeId = "violet" | "graphite" | "emerald";

export type ThemeOption = {
  id: ThemeId;
  name: string;
  description: string;
  /** Preview swatches (background, surface, accent, highlight). */
  swatches: [string, string, string, string];
};

export const THEMES: readonly ThemeOption[] = [
  { id: "violet", name: "Violet", description: "Veya's original purple glow", swatches: ["#08080C", "#15131F", "#7C3AED", "#C4B5FD"] },
  { id: "graphite", name: "Graphite", description: "Gray and black, calm and minimal", swatches: ["#0A0A0A", "#161616", "#6B6B6B", "#D9D9D9"] },
  { id: "emerald", name: "Emerald", description: "Green and black, fresh and focused", swatches: ["#06090A", "#111A15", "#16A34A", "#86EFAC"] },
];

const STORAGE_KEY = "veya.theme";
/** "1" when the last run of the app was signed in (so it starts in the user's theme). */
const SIGNED_IN_KEY = "veya.themeSignedIn";

function isThemeId(value: unknown): value is ThemeId {
  return value === "violet" || value === "graphite" || value === "emerald";
}

/** Synchronous storage: styles are built at import time, before any async storage is ready. */
function readValue(key: string): string | null {
  try {
    if (Platform.OS === "web") return typeof localStorage !== "undefined" ? localStorage.getItem(key) : null;
    return SecureStore.getItem(key);
  } catch {
    return null;
  }
}

function writeValue(key: string, value: string): void {
  try {
    if (Platform.OS === "web") localStorage.setItem(key, value);
    else SecureStore.setItem(key, value);
  } catch {
    // Not fatal: the theme simply isn't remembered.
  }
}

const saved = readValue(STORAGE_KEY);

/** The theme the user picked for the signed-in app. */
export const SAVED_THEME: ThemeId = isThemeId(saved) ? saved : "violet";

/** The theme this run of the app is drawn in (fixed until the next start). */
export const ACTIVE_THEME: ThemeId = readValue(SIGNED_IN_KEY) === "1" ? SAVED_THEME : "violet";

async function restartApp(reason: string): Promise<void> {
  if (Platform.OS === "web") {
    window.location.reload();
    return;
  }
  await reloadAppAsync(reason);
}

/** The theme a session should be shown in: the user's theme inside the app, Violet before sign-in. */
export function themeForSession(signedIn: boolean): ThemeId {
  return signedIn ? SAVED_THEME : "violet";
}

/**
 * Called when sign-in state is known. Remembers it for the next start and
 * restarts once if this run is drawn in the wrong theme for it.
 */
export async function syncThemeWithSession(signedIn: boolean): Promise<void> {
  writeValue(SIGNED_IN_KEY, signedIn ? "1" : "0");
  if (themeForSession(signedIn) !== ACTIVE_THEME) await restartApp(signedIn ? "Applying your theme" : "Signing out");
}

/** Save the theme (signed-in app) and restart so every screen is rebuilt in it. */
export async function applyTheme(id: ThemeId): Promise<void> {
  writeValue(STORAGE_KEY, id);
  writeValue(SIGNED_IN_KEY, "1");
  await restartApp("Applying theme");
}

// =========================================================
// COLOUR MAPPING
// =========================================================

/** Brand colours are the violet family (hues ~225°–300°), including violet-tinted darks. */
const BRAND_HUE_MIN = 225;
const BRAND_HUE_MAX = 300;
/** Emerald: rotate violet (~258°) to green (~143°). */
const EMERALD_HUE_SHIFT = -115;

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return [h * 60, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const hue = (((h % 360) + 360) % 360) / 360;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t: number) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return [Math.round(channel(hue + 1 / 3) * 255), Math.round(channel(hue) * 255), Math.round(channel(hue - 1 / 3) * 255)];
}

/** Map one brand colour to the active theme; other colours pass through. */
export function mapRgb(r: number, g: number, b: number, theme: ThemeId = ACTIVE_THEME): [number, number, number] {
  if (theme === "violet") return [r, g, b];
  const [h, s, l] = rgbToHsl(r, g, b);
  if (s === 0 || h < BRAND_HUE_MIN || h > BRAND_HUE_MAX) return [r, g, b];
  if (theme === "graphite") return hslToRgb(h, s * 0.06, l);
  return hslToRgb(h + EMERALD_HUE_SHIFT, s * 0.88, l);
}

const RGBA = /rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(,\s*[\d.]+\s*)?\)/g;
const HEX = /#([0-9a-fA-F]{6})\b/g;
const cache = new Map<string, string>();

const toHex = (value: number) => value.toString(16).padStart(2, "0").toUpperCase();

/**
 * Recolour a colour value — or any style string containing colours, such as
 * a gradient or a box shadow — into the active theme.
 *   themed("rgba(196, 181, 253, 0.2)"), themed("linear-gradient(90deg, #A78BFA 0%, …)")
 */
export function themed(value: string): string {
  if (ACTIVE_THEME === "violet") return value;
  const cached = cache.get(value);
  if (cached !== undefined) return cached;
  const result = value
    .replace(RGBA, (match, r: string, g: string, b: string, alpha: string | undefined) => {
      const [nr, ng, nb] = mapRgb(Number(r), Number(g), Number(b));
      return alpha ? `rgba(${nr}, ${ng}, ${nb}${alpha})` : `rgb(${nr}, ${ng}, ${nb})`;
    })
    .replace(HEX, (match, hex: string) => {
      const [nr, ng, nb] = mapRgb(parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16));
      return `#${toHex(nr)}${toHex(ng)}${toHex(nb)}`;
    });
  cache.set(value, result);
  return result;
}
