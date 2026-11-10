/**
 * Veya's mascot avatars (assets/images/mascots). The id is what's saved on the user.
 * `source` is a bundled image (`require()` returns its asset number).
 */
export type Mascot = { id: string; name: string; source: number };

export const MASCOTS: readonly Mascot[] = [
  { id: "nova", name: "Nova", source: require("../../assets/images/mascots/mascot-01-nova.png") },
  { id: "pixel", name: "Pixel", source: require("../../assets/images/mascots/mascot-02-pixel.png") },
  { id: "byte", name: "Byte", source: require("../../assets/images/mascots/mascot-03-byte.png") },
  { id: "luna", name: "Luna", source: require("../../assets/images/mascots/mascot-04-luna.png") },
  { id: "sprout", name: "Sprout", source: require("../../assets/images/mascots/mascot-05-sprout.png") },
  { id: "blaze", name: "Blaze", source: require("../../assets/images/mascots/mascot-06-blaze.png") },
  { id: "echo", name: "Echo", source: require("../../assets/images/mascots/mascot-07-echo.png") },
  { id: "mochi", name: "Mochi", source: require("../../assets/images/mascots/mascot-08-mochi.png") },
  { id: "zap", name: "Zap", source: require("../../assets/images/mascots/mascot-09-zap.png") },
  { id: "orbit", name: "Orbit", source: require("../../assets/images/mascots/mascot-10-orbit.png") },
];

export function mascotById(id: string | null | undefined): Mascot | undefined {
  return id ? MASCOTS.find((mascot) => mascot.id === id) : undefined;
}
