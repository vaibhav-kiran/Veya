export const fontFamilies = {
  regular: "Inter-Regular",

  medium: "Inter-Medium",

  semibold: "Inter-SemiBold",

  bold: "Inter-Bold",
} as const;

export const typography = {
  h1: { fontSize: 32, lineHeight: 38.4, fontFamily: fontFamilies.bold },
  h2: { fontSize: 24, lineHeight: 31.2, fontFamily: fontFamilies.semibold },
  h3: { fontSize: 20, lineHeight: 26, fontFamily: fontFamilies.semibold },
  h4: { fontSize: 16, lineHeight: 22.4, fontFamily: fontFamilies.medium },
  bodyLarge: {
    fontSize: 16,
    lineHeight: 25.6,
    fontFamily: fontFamilies.regular,
  },
  bodyMedium: {
    fontSize: 14,
    lineHeight: 22.4,
    fontFamily: fontFamilies.regular,
  },
  bodySmall: {
    fontSize: 13,
    lineHeight: 20.8,
    fontFamily: fontFamilies.regular,
  },
  caption: { fontSize: 11, lineHeight: 15.4, fontFamily: fontFamilies.regular },
  /** Uppercase section eyebrows ("UPCOMING", "01 — YOUR LANGUAGE"). */
  eyebrow: {
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 0.6,
    fontFamily: fontFamilies.semibold,
    textTransform: "uppercase",
  },
  button: { fontSize: 16, lineHeight: 22, fontFamily: fontFamilies.semibold },
} as const;
