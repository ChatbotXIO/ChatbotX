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
