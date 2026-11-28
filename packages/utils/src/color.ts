import { z } from "zod"

/** `#RRGGBB` (no alpha), either case. */
export const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/

export const hexColorSchema = z
  .string()
  .regex(HEX_COLOR_PATTERN, "Color must be a hex color like #1A2B3C")
  // One stored spelling, so equal colors compare equal.
  .transform((value) => value.toUpperCase())
  .describe("Hex color `#RRGGBB` (no alpha), for example `#1A2B3C`.")

export const READABLE_TEXT_DARK = "#0f172a"
export const READABLE_TEXT_LIGHT = "#ffffff"

/** Linear-light channel value from an sRGB byte (WCAG 2.x). */
const linearChannel = (byte: number): number => {
  const unit = byte / 255
  return unit <= 0.039_28 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4
}

const channelByte = (hex: string, start: number): number =>
  Number.parseInt(hex.slice(start, start + 2), 16)

/** Relative luminance (WCAG 2.x) of `#RRGGBB`. */
const relativeLuminance = (hex: string): number =>
  0.2126 * linearChannel(channelByte(hex, 1)) +
  0.7152 * linearChannel(channelByte(hex, 3)) +
  0.0722 * linearChannel(channelByte(hex, 5))

/** WCAG contrast ratio between two `#RRGGBB` colors. */
const contrastRatio = (first: string, second: string): number => {
  const a = relativeLuminance(first)
  const b = relativeLuminance(second)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

/**
 * Dark or light text, whichever has the higher WCAG contrast ratio against
 * `hex`, measured against the actual text colors (not a luminance cutoff).
 * Anything that is not `#RRGGBB` falls back to dark text.
 */
export const readableTextColor = (hex: string): string => {
  if (!HEX_COLOR_PATTERN.test(hex)) {
    return READABLE_TEXT_DARK
  }
  return contrastRatio(hex, READABLE_TEXT_LIGHT) >
    contrastRatio(hex, READABLE_TEXT_DARK)
    ? READABLE_TEXT_LIGHT
    : READABLE_TEXT_DARK
}

/** Inline style of a tag chip: its color as background with readable text, or none for an uncolored tag. */
export const tagChipStyle = (
  color: string | null | undefined,
): { backgroundColor: string; color: string } | undefined =>
  color
    ? { backgroundColor: color, color: readableTextColor(color) }
    : undefined

/** Share of the tag color kept in the pastel background and border. */
const BADGE_BACKGROUND_COLOR_SHARE = 0.15
const BADGE_BORDER_COLOR_SHARE = 0.35
/** WCAG AA contrast for small text. */
const WCAG_AA_TEXT_CONTRAST = 4.5
const BADGE_TEXT_DARKEN_STEP = 0.05
const BADGE_TEXT_MAX_DARKEN_STEPS = 20

/** The neutral pastel of a badge whose tag has no color. */
const NEUTRAL_BADGE_STYLE = {
  backgroundColor: "#f3f4f6",
  borderColor: "#e5e7eb",
  color: "#374151",
} as const

/** `from` moved `share` of the way to `to` (both `#RRGGBB`), as `#rrggbb`. */
const mixHex = (from: string, to: string, share: number): string => {
  const channel = (start: number): string =>
    Math.round(
      channelByte(from, start) * (1 - share) + channelByte(to, start) * share,
    )
      .toString(16)
      .padStart(2, "0")
  return `#${channel(1)}${channel(3)}${channel(5)}`
}

export type TintedBadgeStyle = {
  backgroundColor: string
  borderColor: string
  color: string
}

/**
 * A pastel badge from a tag color: a light tint as background, a slightly
 * darker tint as border, and the color itself darkened until its text reaches
 * WCAG AA (4.5:1) on that background. A missing or invalid color gives a
 * neutral gray pastel of the same shape.
 */
export const tintedBadgeStyle = (
  hex: string | null | undefined,
): TintedBadgeStyle => {
  if (!(hex && HEX_COLOR_PATTERN.test(hex))) {
    return NEUTRAL_BADGE_STYLE
  }
  const backgroundColor = mixHex("#ffffff", hex, BADGE_BACKGROUND_COLOR_SHARE)
  const borderColor = mixHex("#ffffff", hex, BADGE_BORDER_COLOR_SHARE)
  let color = hex.toLowerCase()
  for (
    let step = 1;
    step <= BADGE_TEXT_MAX_DARKEN_STEPS &&
    contrastRatio(color, backgroundColor) < WCAG_AA_TEXT_CONTRAST;
    step++
  ) {
    color = mixHex(hex, "#000000", step * BADGE_TEXT_DARKEN_STEP)
  }
  return { backgroundColor, borderColor, color }
}
